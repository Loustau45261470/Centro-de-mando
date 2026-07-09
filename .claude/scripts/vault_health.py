#!/usr/bin/env python3
"""
vault_health.py - chequeo de salud del vault (segundo cerebro de Tobías)

Audita el vault por: notas duplicadas, huérfanas (sin enlaces entrantes),
tareas vencidas, notas sin frontmatter, notas con sintaxis de plantilla
sin completar, carpetas vacías, y "wanted notes" (enlaces a notas que
todavía no existen — no es un error, es una lista de notas por escribir).

Adaptado de eugeniughelbur/obsidian-second-brain para la estructura real
de este vault (context/, inbox/, conocimiento/, proyectos/, plantillas/).
Sin dependencias externas, sin API keys.

Uso:
    python vault_health.py --path "."
    python vault_health.py --path "." --json
"""

import argparse
import difflib
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

TODAY = date.today()
EXCLUDE_DIRS = {".obsidian", ".trash", "_trash", ".git", ".claude", "plantillas"}
# El vault comparte raíz con el repo del proyecto (node_modules/, specs/, etc.
# viven ahí también) — solo estas carpetas + notas sueltas de la raíz son vault.
VAULT_SUBDIRS = {"context", "inbox", "conocimiento", "proyectos"}
VAULT_ROOT_FILES = {"_CLAUDE.md", "Inicio.md", "Como-usar-esto.md"}


def _in_vault_scope(rel_parts: tuple) -> bool:
    if len(rel_parts) == 1:
        return rel_parts[0] in VAULT_ROOT_FILES
    return rel_parts[0] in VAULT_SUBDIRS
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---", re.DOTALL)
LINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")
DATE_RE = re.compile(r"due:\s*(\d{4}-\d{2}-\d{2})")
TEMPLATE_RE = re.compile(r"<%.*?%>")
ALIAS_RE = re.compile(r"^aliases:\s*\n((?:\s+-\s+.+\n?)+)", re.MULTILINE)
ALIAS_ITEM_RE = re.compile(r"^\s+-\s+(.+)$", re.MULTILINE)
CODE_FENCE_BLOCK_RE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")


def _strip_code(text: str) -> str:
    return INLINE_CODE_RE.sub("", CODE_FENCE_BLOCK_RE.sub("", text))


def parse_aliases(frontmatter: str) -> list:
    block = ALIAS_RE.search(frontmatter)
    if not block:
        return []
    return [m.strip().strip('"\'').lower() for m in ALIAS_ITEM_RE.findall(block.group(1))]


def index_vault_files(vault: Path) -> set:
    files = set()
    for f in vault.rglob("*"):
        parts = f.relative_to(vault).parts
        if not _in_vault_scope(parts):
            continue
        if any(p in EXCLUDE_DIRS for p in parts):
            continue
        if not f.is_file():
            continue
        files.add(f.relative_to(vault).as_posix().lower())
        files.add(f.name.lower())
    return files


def load_vault(vault: Path) -> dict:
    notes = {}
    for md in vault.rglob("*.md"):
        parts = md.relative_to(vault).parts
        if not _in_vault_scope(parts):
            continue
        if any(p in EXCLUDE_DIRS for p in parts):
            continue
        rel = str(md.relative_to(vault))
        content = md.read_text(encoding="utf-8", errors="replace")
        fm_match = FRONTMATTER_RE.match(content)
        frontmatter = fm_match.group(1) if fm_match else ""
        links = [l.strip().rstrip("\\") for l in LINK_RE.findall(_strip_code(content))]
        due_match = DATE_RE.search(frontmatter)
        notes[rel] = {
            "path": md,
            "rel": rel,
            "stem": md.stem,
            "content": content,
            "frontmatter": frontmatter,
            "has_frontmatter": bool(fm_match),
            "links": links,
            "aliases": parse_aliases(frontmatter),
            "due": due_match.group(1) if due_match else None,
            "size": len(content),
        }
    return notes


def _norm_title(stem: str) -> str:
    norm = re.sub(r"[^a-z0-9 ]", " ", stem.lower())
    return re.sub(r"\s+", " ", norm).strip()


def _max_pairwise_similarity(notes: dict, files: list) -> float:
    bodies = [notes[f]["content"][:1000] for f in files]
    best = 0.0
    for i in range(len(bodies)):
        for j in range(i + 1, len(bodies)):
            best = max(best, difflib.SequenceMatcher(None, bodies[i], bodies[j]).ratio())
    return best


def check_duplicates(notes: dict) -> list:
    issues = []
    groups = defaultdict(list)
    for rel, note in notes.items():
        norm = _norm_title(note["stem"])
        if norm:
            groups[norm].append(rel)
    for norm, files in groups.items():
        if len(files) <= 1:
            continue
        similar = _max_pairwise_similarity(notes, files) >= 0.6
        issues.append({
            "type": "duplicate",
            "severity": "warning" if similar else "info",
            "message": f"{'Posibles duplicados' if similar else 'Mismo título, contenido distinto'}: {norm!r}",
            "files": files,
        })
    return issues


def check_orphans(notes: dict) -> list:
    all_links = set()
    for note in notes.values():
        for link in note["links"]:
            lk = link.lower()
            if lk.endswith(".md"):
                lk = lk[:-3]
            all_links.add(lk)
            all_links.add(lk.replace(" ", "-"))

    alias_set = set()
    for note in notes.values():
        for alias in note["aliases"]:
            alias_set.add(alias.lower())

    issues = []
    for rel, note in notes.items():
        if rel in ("_CLAUDE.md",):
            continue
        stem_lower = note["stem"].lower()
        stem_norm = stem_lower.replace("-", " ").replace("_", " ")
        linked = (
            stem_lower in all_links
            or stem_norm in all_links
            or any(stem_lower in lk for lk in all_links)
            or any(alias in all_links for alias in note["aliases"])
        )
        if not linked:
            issues.append({
                "type": "orphan",
                "severity": "info",
                "message": f"Sin enlaces entrantes: {rel}",
                "files": [rel],
            })
    return issues


def check_stale_tasks(notes: dict) -> list:
    issues = []
    for rel, note in notes.items():
        if note["due"]:
            try:
                due_date = date.fromisoformat(note["due"])
                if due_date < TODAY:
                    days_overdue = (TODAY - due_date).days
                    issues.append({
                        "type": "stale_task",
                        "severity": "warning" if days_overdue > 7 else "info",
                        "message": f"Vencida hace {days_overdue}d: {rel}",
                        "files": [rel],
                        "due": note["due"],
                    })
            except ValueError:
                pass
    return issues


def check_missing_frontmatter(notes: dict) -> list:
    issues = []
    for rel, note in notes.items():
        if rel in ("_CLAUDE.md",):
            continue
        if not note["has_frontmatter"] and note["size"] > 50:
            issues.append({
                "type": "no_frontmatter",
                "severity": "warning",
                "message": f"Sin frontmatter: {rel}",
                "files": [rel],
            })
    return issues


def check_empty_folders(vault: Path) -> list:
    issues = []
    for folder in vault.rglob("*/"):
        parts = folder.relative_to(vault).parts
        if not parts or parts[0] not in VAULT_SUBDIRS:
            continue
        if any(p in EXCLUDE_DIRS for p in folder.parts):
            continue
        if not folder.is_dir():
            continue
        if not list(folder.iterdir()):
            rel = str(folder.relative_to(vault))
            issues.append({
                "type": "empty_folder",
                "severity": "info",
                "message": f"Carpeta vacía: {rel}/",
                "files": [],
            })
    return issues


def check_wanted_notes(notes: dict, vault: Path) -> list:
    all_stems = {note["stem"].lower(): rel for rel, note in notes.items()}
    all_files = index_vault_files(vault)
    all_aliases: dict = {}
    for rel, note in notes.items():
        for alias in note["aliases"]:
            all_aliases[alias.lower()] = rel

    SKIP_FROM_LINK_SCAN = {"_CLAUDE.md"}

    issues = []
    for rel, note in notes.items():
        if Path(rel).name in SKIP_FROM_LINK_SCAN:
            continue
        real_links = [l.strip().rstrip("\\") for l in LINK_RE.findall(_strip_code(note["content"]))]
        for link in real_links:
            link_name = link.rsplit("/", 1)[-1]
            if link_name.lower().endswith(".md"):
                link_name = link_name[:-3]
            link_stem = link_name.lower()
            link_norm = link_stem.replace("-", " ").replace("_", " ")
            resolved = (
                link_stem in all_stems
                or link_norm in all_stems
                or link_stem in all_aliases
                or link_norm in all_aliases
                or link.lower() in all_files
            )
            if not resolved:
                potential_folder = vault / link
                if not potential_folder.is_dir():
                    issues.append({
                        "type": "wanted_note",
                        "severity": "info",
                        "message": f"[[{link}]] — pedida por {rel}",
                        "files": [rel],
                    })
    return issues


def check_template_leftovers(notes: dict) -> list:
    issues = []
    for rel, note in notes.items():
        if TEMPLATE_RE.search(note["content"]):
            issues.append({
                "type": "template_leftover",
                "severity": "error",
                "message": f"Sintaxis de plantilla sin completar en: {rel}",
                "files": [rel],
            })
    return issues


def run_health_check(vault: Path) -> dict:
    print(f"Escaneando vault: {vault}\n", file=sys.stderr)
    notes = load_vault(vault)
    print(f"   {len(notes)} notas encontradas\n", file=sys.stderr)

    checks = [
        ("Duplicados", check_duplicates(notes)),
        ("Huérfanas", check_orphans(notes)),
        ("Tareas vencidas", check_stale_tasks(notes)),
        ("Sin frontmatter", check_missing_frontmatter(notes)),
        ("Carpetas vacías", check_empty_folders(vault)),
        ("Notas pedidas (wanted)", check_wanted_notes(notes, vault)),
        ("Plantillas sin completar", check_template_leftovers(notes)),
    ]

    all_issues = []
    counts = {}
    for label, issues in checks:
        counts[label] = len(issues)
        all_issues.extend(issues)

    return {
        "vault": str(vault),
        "scanned": TODAY.isoformat(),
        "total_notes": len(notes),
        "total_issues": len(all_issues),
        "counts": counts,
        "issues": all_issues,
    }


def print_report(result: dict):
    print("=" * 60)
    print(f"  REPORTE DE SALUD DEL VAULT - {result['scanned']}")
    print("=" * 60)
    print(f"  Notas escaneadas: {result['total_notes']}")
    print(f"  Issues encontrados: {result['total_issues']}")
    print()

    if result["total_issues"] == 0:
        print("Vault limpio. Sin issues.")
        return

    for label, count in result["counts"].items():
        if count > 0:
            print(f"  {label}: {count}")

    print()
    by_type = defaultdict(list)
    for issue in result["issues"]:
        by_type[issue["type"]].append(issue)

    for issue_type, issues in by_type.items():
        print(f"\n{issue_type.replace('_', ' ').title()} ({len(issues)})")
        print("-" * 50)
        for issue in issues[:10]:
            print(f"  {issue['message']}")
        if len(issues) > 10:
            print(f"  ... y {len(issues) - 10} más")


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Chequeo de salud del vault")
    parser.add_argument("--path", required=True, help="Ruta al vault")
    parser.add_argument("--json", action="store_true", help="Salida JSON")
    args = parser.parse_args()

    vault = Path(args.path).expanduser().resolve()
    if not vault.exists():
        print(f"Vault no encontrado: {vault}")
        return 1

    result = run_health_check(vault)

    if args.json:
        print(json.dumps(result, indent=2, default=str, ensure_ascii=False))
    else:
        print_report(result)


if __name__ == "__main__":
    main()
