#!/usr/bin/env node
// PreToolUse guard: pide confirmacion antes de tocar firestore.rules/storage.rules
// o las funciones criticas de sync en app.js (ver regla "bugs de sync" en CLAUDE.md).

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const toolName = event.tool_name || "";
  if (!["Edit", "Write", "MultiEdit"].includes(toolName)) process.exit(0);

  const params = event.tool_input || {};
  const filePath = String(params.file_path || "").replace(/\\/g, "/");

  const isRulesFile = /(^|\/)(firestore|storage)\.rules$/.test(filePath);

  const SYNC_SYMBOLS = [
    "_fbSave",
    "_applyRemoteState",
    "loadState",
    "saveState",
    "_fbSaveInProgress",
    "onSnapshot",
    "_syncOnFocus",
    "_lastSyncedSavedAt",
  ];
  const isAppJs = /(^|\/)app\.js$/.test(filePath);
  const editedText = [params.old_string, params.new_string, params.content]
    .concat(Array.isArray(params.edits) ? params.edits.map((e) => `${e.old_string}\n${e.new_string}`) : [])
    .filter(Boolean)
    .join("\n");
  const touchesSyncLogic = isAppJs && SYNC_SYMBOLS.some((sym) => editedText.includes(sym));

  if (!isRulesFile && !touchesSyncLogic) process.exit(0);

  const reason = isRulesFile
    ? `Vas a editar ${filePath} (reglas de seguridad Firestore/Storage). Confirmar antes de continuar.`
    : `Este edit en app.js toca logica de sync (Firestore <-> localStorage). Segun CLAUDE.md: agregar visibilidad/diagnostico antes de tocar esta logica, un cambio a la vez. Confirmar antes de continuar.`;

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
});
