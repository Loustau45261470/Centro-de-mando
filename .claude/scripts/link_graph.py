"""Extractor determinístico del grafo de enlaces del vault, para /mapa-vault.

Construye el grafo (notas, [[wikilinks]] resueltos, grado, hubs, huérfanas)
en una pasada, sin necesidad de leer cada nota en el contexto del modelo.

Adaptado de eugeniughelbur/obsidian-second-brain (scripts/link_graph.py).
stdlib puro.

Uso:
    python link_graph.py --path "." [--scope "Nombre de nota"]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SKIP_DIRS = {".obsidian", ".git", ".trash", "_trash", ".claude", "plantillas"}
# El vault comparte raíz con el repo del proyecto (node_modules/, specs/, etc.
# viven ahí también) — solo estas carpetas + notas sueltas de la raíz son vault.
VAULT_SUBDIRS = {"context", "inbox", "conocimiento", "proyectos"}
VAULT_ROOT_FILES = {"_CLAUDE.md", "Inicio.md", "Como-usar-esto.md"}


def _in_vault_scope(rel_parts: tuple) -> bool:
    if len(rel_parts) == 1:
        return rel_parts[0] in VAULT_ROOT_FILES
    return rel_parts[0] in VAULT_SUBDIRS

LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`]*`")
TYPE_RE = re.compile(r"(?m)^type:\s*[\"']?([A-Za-z0-9_-]+)")
ALIAS_BLOCK_RE = re.compile(r"(?ms)^aliases:\s*\n((?:\s*-\s*.+\n?)+)")
ALIAS_INLINE_RE = re.compile(r"(?m)^aliases:\s*\[(.+)\]")
EM_DASH, EN_DASH = "—", "–"


def _norm(s: str) -> str:
    s = s.replace(EM_DASH, "-").replace(EN_DASH, "-")
    return re.sub(r"[\s_-]+", " ", s.strip().lower())


def _strip_code(text: str) -> str:
    return INLINE_CODE_RE.sub("", CODE_FENCE_RE.sub("", text))


def _frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[3:end]
    return ""


def _aliases(fm: str) -> list[str]:
    out: list[str] = []
    m = ALIAS_INLINE_RE.search(fm)
    if m:
        out += [a.strip().strip("\"'") for a in m.group(1).split(",")]
    m = ALIAS_BLOCK_RE.search(fm)
    if m:
        out += [ln.strip().lstrip("-").strip().strip("\"'") for ln in m.group(1).splitlines() if ln.strip()]
    return [a for a in out if a]


def _link_target(link: str) -> str:
    link = link.split("|", 1)[0].split("#", 1)[0].strip().rstrip("\\")
    if "/" in link:
        link = link.rsplit("/", 1)[-1]
    if link.endswith(".md"):
        link = link[:-3]
    return link


def build_graph(vault: Path, scope: str | None = None) -> dict:
    notes: dict[str, dict] = {}
    key_to_rel: dict[str, str] = {}

    for md in sorted(vault.rglob("*.md")):
        parts = md.relative_to(vault).parts
        if not _in_vault_scope(parts):
            continue
        if SKIP_DIRS & set(parts):
            continue
        rel = md.relative_to(vault).as_posix()
        try:
            text = md.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        fm = _frontmatter(text)
        tmatch = TYPE_RE.search(fm)
        note = {
            "path": rel,
            "title": md.stem,
            "type": tmatch.group(1) if tmatch else "",
            "folder": parts[0] if len(parts) > 1 else "",
            "content": _strip_code(text),
            "aliases": _aliases(fm),
        }
        notes[rel] = note
        key_to_rel.setdefault(_norm(md.stem), rel)
        for a in note["aliases"]:
            key_to_rel.setdefault(_norm(a), rel)

    edges: list[dict] = []
    dangling = 0
    indeg = {rel: 0 for rel in notes}
    outdeg = {rel: 0 for rel in notes}

    for rel, note in notes.items():
        seen: set[str] = set()
        for raw in LINK_RE.findall(note["content"]):
            target = key_to_rel.get(_norm(_link_target(raw)))
            if target is None:
                dangling += 1
                continue
            if target == rel or target in seen:
                continue
            seen.add(target)
            edges.append({"from": rel, "to": target})
            outdeg[rel] += 1
            indeg[target] += 1

    nodes = []
    for rel, note in notes.items():
        deg = indeg[rel] + outdeg[rel]
        nodes.append({
            "id": rel, "path": rel, "title": note["title"], "type": note["type"],
            "folder": note["folder"], "in": indeg[rel], "out": outdeg[rel], "degree": deg,
        })

    if scope:
        skey = _norm(scope)
        root = key_to_rel.get(skey)
        keep = set()
        if root:
            keep.add(root)
            for e in edges:
                if e["from"] == root:
                    keep.add(e["to"])
                if e["to"] == root:
                    keep.add(e["from"])
            second = set()
            for e in edges:
                if e["from"] in keep:
                    second.add(e["to"])
                if e["to"] in keep:
                    second.add(e["from"])
            keep |= second
        nodes = [n for n in nodes if n["id"] in keep]
        edges = [e for e in edges if e["from"] in keep and e["to"] in keep]

    ranked = sorted(nodes, key=lambda n: n["degree"], reverse=True)
    orphans = [n["path"] for n in nodes if n["degree"] == 0]
    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "orphan_count": len(orphans),
            "dangling_link_count": dangling,
            "top_hubs": [{"path": n["path"], "title": n["title"], "degree": n["degree"]} for n in ranked[:10]],
            "orphans": orphans[:50],
            "scope": scope or "full",
        },
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Extrae el grafo de enlaces del vault en JSON")
    ap.add_argument("--path", required=True, help="Raíz del vault")
    ap.add_argument("--scope", default=None, help="Centrar en una nota (2 saltos); omitir para el vault completo")
    args = ap.parse_args(argv[1:])

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    vault = Path(args.path).expanduser().resolve()
    if not vault.is_dir():
        print(f"vault path does not exist: {vault}", file=sys.stderr)
        return 2
    graph = build_graph(vault, args.scope)
    print(json.dumps(graph, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
