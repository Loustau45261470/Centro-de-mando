// Centro de Mando — Claude Bridge Poller
// Corre LOCAL (Task Scheduler, cada ~2 min). Lee tareas pendientes en Firestore
// (appdata, type=='claude_task'), las ejecuta con la CLI `claude` en modo SOLO LECTURA
// sobre el repo Centro de Mando, y escribe el resultado de vuelta para que JARVIS lo lea.
//
// Run-once: procesa todas las pendientes y termina (process.exit). No es un loop infinito.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const ENV = process.env;

const KEY_PATH = ENV.CDM_FIREBASE_KEY || 'C:\\Users\\Tobias\\.secrets\\cdm-firebase.json';
const REPO_DIR = ENV.CDM_REPO_DIR || 'c:\\Users\\Tobias\\Desktop\\Claude\\Proyectos\\Aplicaciones funcionales\\Centro de comando';
const TIMEOUT_MS = parseInt(ENV.CDM_BRIDGE_TIMEOUT_MS || '180000', 10);

// En Windows, `claude` (instalado vía npm) es un shim .cmd. Node bloquea el spawn directo
// de .cmd/.bat sin shell:true (fix de seguridad CVE-2024-27980, tira `spawn EINVAL`), y
// shell:true es justo lo que el ticket pide evitar (riesgo de inyección con el prompt como
// argumento). El shim .cmd solo hace `"%dp0%\...\claude.exe" %*` — resolvemos la ruta real
// del .exe (parseando el .cmd) y lo spawneamos directo, sin cmd.exe de por medio.
function resolveClaudeBin() {
  if (ENV.CDM_CLAUDE_BIN) return ENV.CDM_CLAUDE_BIN;
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const out = execSync('where claude', { encoding: 'utf8', windowsHide: true });
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const exeDirect = lines.find((l) => l.toLowerCase().endsWith('.exe'));
      if (exeDirect) return exeDirect;

      const cmdShim = lines.find((l) => l.toLowerCase().endsWith('.cmd'));
      if (cmdShim) {
        const shimContent = fs.readFileSync(cmdShim, 'utf8');
        const m = shimContent.match(/%dp0%\\([^"%]+\.exe)/i);
        if (m) {
          const exePath = path.join(path.dirname(cmdShim), m[1]);
          if (fs.existsSync(exePath)) return exePath;
        }
      }
    } catch (e) {
      // sigue con el default 'claude' — fallará más claro en runClaudeTask si no resuelve
    }
  }
  return 'claude';
}
const CLAUDE_BIN = resolveClaudeBin();
const CLAUDE_MODEL = ENV.CDM_CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const RESULT_MAX_LEN = 6000;
const MOCK = ENV.CDM_BRIDGE_MOCK === '1';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// --- Observabilidad (aditivo, ver observability\SPEC.md §6, §8 Fase 3) --------------------
// Contrato never-throw (R18): el logging/notify de acá NUNCA debe alterar el comportamiento
// del poller (ni exit codes, ni el resultado escrito en Firestore). Todo queda envuelto.
let obsLog = null;
try {
  ({ obsLog } = require('C:\\Users\\Tobias\\.claude\\observability\\lib\\obslog.js'));
} catch (e) {
  // observabilidad opcional: si el require falla (path movido, etc.), el poller sigue igual.
}

// Un evento run_end por cada claude_task procesada (SPEC §6, R8).
function emitBridgeTaskEvent(ctaskId, status, resultText) {
  if (!obsLog) return;
  try {
    obsLog({
      run_id: `bridge-claude-bridge-${Date.now()}`,
      source: 'bridge',
      task: 'claude-bridge',
      kind: 'run_end',
      status,
      summary: typeof resultText === 'string' ? resultText.slice(0, 200) : undefined,
      meta: { ctask_id: ctaskId },
    });
  } catch (e) {
    try { log(`[obs] emitBridgeTaskEvent falló: ${e.message}`); } catch (_) {}
  }
}

function notifyPollerAbort(failReason) {
  try {
    const { execFileSync } = require('child_process');
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-File',
      'C:\\Users\\Tobias\\.claude\\observability\\notify\\notify.ps1',
      '-Task', 'claude-bridge', '-FailReason', failReason, '-Source', 'bridge',
    ], { windowsHide: true, timeout: 15000 });
  } catch (e) {
    try { log(`[obs] notify falló: ${e.message}`); } catch (_) {}
  }
}

// Push al cerrar una claude_task encolada DESDE EL BOARD (device:'centro-comando-board').
// Las de JARVIS voz ya avisan por voz — no duplicar. Never-throw: solo console.warn si falla,
// jamás altera el resultado escrito en Firestore ni el exit code del poller.
function notifyBoardTaskDone(taskId, status, resultText) {
  try {
    const { execFileSync } = require('child_process');
    const args = [
      'C:\\Users\\Tobias\\.claude\\observability\\notify\\notify-push.js',
      '--task', 'claude-bridge',
    ];
    if (status === 'error') {
      args.push('--kind', 'alert', '--fail-reason', truncate(resultText || 'error').slice(0, 100));
    } else {
      args.push('--kind', 'success', '--summary', truncate(resultText || '').slice(0, 100));
    }
    execFileSync('node', args, { windowsHide: true, timeout: 15000 });
  } catch (e) {
    try { console.warn(`[obs] notifyBoardTaskDone falló (${taskId}): ${e.message}`); } catch (_) {}
  }
}

// Latido de "vivo pero ocioso": el poller corre cada 2 min y sale; cuando no hay tareas no
// emite nada, así que un poller sano parece caído (missing_run) si JARVIS se usa poco. Un
// run_end idle THROTTLED (máx 1 cada ~3 h vía archivo de estado) le da al sweep una señal
// durable de vida sin inundar el run-log. Never-throw (R18): jamás altera el poller.
const HEARTBEAT_FILE = ENV.CDM_BRIDGE_HEARTBEAT_FILE || path.join(__dirname, '.bridge-heartbeat');
const HEARTBEAT_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 h (< staleAfterHours=6 h, con margen)
function emitBridgeHeartbeat() {
  if (!obsLog) return;
  try {
    let last = 0;
    try { last = parseInt(fs.readFileSync(HEARTBEAT_FILE, 'utf8'), 10) || 0; } catch (_) {}
    const now = Date.now();
    if (now - last < HEARTBEAT_INTERVAL_MS) return;
    obsLog({
      run_id: `bridge-claude-bridge-hb-${now}`,
      source: 'bridge',
      task: 'claude-bridge',
      kind: 'run_end',
      status: 'ok',
      meta: { idle: true },
    });
    try { fs.writeFileSync(HEARTBEAT_FILE, String(now)); } catch (_) {}
  } catch (e) {
    try { log(`[obs] emitBridgeHeartbeat falló: ${e.message}`); } catch (_) {}
  }
}

// El poller MISMO aborta (Firestore caído, key ausente, excepción fatal no controlada).
function emitPollerAbort(failReason, summary) {
  if (obsLog) {
    try {
      obsLog({
        run_id: `bridge-claude-bridge-${Date.now()}`,
        source: 'bridge',
        task: 'claude-bridge',
        kind: 'run_end',
        status: 'fail',
        fail_reason: failReason,
        summary,
      });
    } catch (e) {
      try { log(`[obs] emitPollerAbort falló: ${e.message}`); } catch (_) {}
    }
  }
  notifyPollerAbort(failReason);
}
// --- Fin observabilidad ---------------------------------------------------------------------

function truncate(str) {
  if (typeof str !== 'string') str = String(str == null ? '' : str);
  return str.length > RESULT_MAX_LEN ? str.slice(0, RESULT_MAX_LEN) : str;
}

// --- Firestore init (patrón de push-reminders.js, con service account desde archivo) ---
function initFirestore() {
  if (!fs.existsSync(KEY_PATH)) {
    log(`ERROR: no se encontró la service account key en ${KEY_PATH} (configurable con CDM_FIREBASE_KEY). Abortando.`);
    emitPollerAbort('missing_key');
    process.exit(1);
  }
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const svcAccount = require(path.resolve(KEY_PATH));
  initializeApp({ credential: cert(svcAccount) });
  return getFirestore();
}

// --- Ejecución de claude en modo solo-lectura (o mock) ---
async function runClaudeTask(prompt) {
  if (MOCK) {
    return { ok: true, output: `[MOCK] recibí: ${prompt}` };
  }

  const args = [
    '-p', prompt,
    '--allowedTools', 'Read', 'Grep', 'Glob',
    '--disallowedTools', 'Edit', 'Write', 'Bash',
    '--output-format', 'text',
    '--model', CLAUDE_MODEL,
    '--max-turns', '20',
  ];

  try {
    const { stdout } = await execFileAsync(CLAUDE_BIN, args, {
      cwd: REPO_DIR,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, output: stdout };
  } catch (err) {
    const timedOut = err.killed && err.signal;
    const detail = err.stderr || err.message || String(err);
    const prefix = timedOut ? `timeout tras ${TIMEOUT_MS}ms — ` : '';
    return { ok: false, output: `${prefix}${detail}` };
  }
}

// --- Loop principal (run-once) ---
async function main() {
  const db = initFirestore();

  let snap;
  try {
    snap = await db.collection('appdata')
      .where('type', '==', 'claude_task')
      .where('status', '==', 'pending')
      .get();
  } catch (err) {
    log(`ERROR consultando Firestore: ${err.message}`);
    emitPollerAbort('firestore_error', err.message);
    process.exit(1);
  }

  const pending = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (data && data.status === 'pending') {
      pending.push({ id: doc.id, ref: doc.ref, data });
    }
  });
  pending.sort((a, b) => (a.data.createdAt || 0) - (b.data.createdAt || 0));

  log(`${pending.length} tarea(s) pendiente(s)${MOCK ? ' [MOCK]' : ''}`);

  for (const task of pending) {
    log(`-> ${task.id}: iniciando (prompt: "${truncate(task.data.prompt || '').slice(0, 120)}")`);
    try {
      await task.ref.update({ status: 'running' });

      const { ok, output } = await runClaudeTask(task.data.prompt || '');

      if (ok) {
        await task.ref.update({
          status: 'done',
          result: truncate(output),
          finishedAt: Date.now(),
        });
        log(`-> ${task.id}: done`);
        emitBridgeTaskEvent(task.id, 'ok', output);
        if (task.data.device === 'centro-comando-board') notifyBoardTaskDone(task.id, 'done', output);
      } else {
        await task.ref.update({
          status: 'error',
          result: truncate(output),
          finishedAt: Date.now(),
        });
        log(`-> ${task.id}: error — ${truncate(output).slice(0, 200)}`);
        emitBridgeTaskEvent(task.id, 'fail', output);
        if (task.data.device === 'centro-comando-board') notifyBoardTaskDone(task.id, 'error', output);
      }
    } catch (err) {
      log(`-> ${task.id}: excepción no controlada — ${err.message}`);
      try {
        await task.ref.update({
          status: 'error',
          result: truncate(err.message || String(err)),
          finishedAt: Date.now(),
        });
      } catch (err2) {
        log(`-> ${task.id}: no se pudo guardar el estado de error — ${err2.message}`);
      }
      emitBridgeTaskEvent(task.id, 'fail', err.message || String(err));
      if (task.data.device === 'centro-comando-board') notifyBoardTaskDone(task.id, 'error', err.message || String(err));
    }
  }

  emitBridgeHeartbeat();
  log('listo.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      log(`ERROR fatal: ${err.message}`);
      emitPollerAbort('fatal', err.message || String(err));
      process.exit(1);
    });
}

module.exports = { main, runClaudeTask, truncate, emitBridgeTaskEvent, emitPollerAbort, notifyBoardTaskDone };
