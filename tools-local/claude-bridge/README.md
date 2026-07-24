# CDM Claude Bridge — poller local

Puente "JARVIS → Claude Code". Corre en la PC del usuario (Task Scheduler, cada ~2 min),
lee tareas pendientes de Firestore (`appdata`, `type=='claude_task'`), ejecuta cada una con
la CLI `claude` en modo **solo lectura** sobre el repo Centro de Mando, y escribe el
resultado de vuelta para que JARVIS lo lea por voz.

No es un daemon: procesa las pendientes que encuentra y termina (`process.exit`). Pensado
para que el Task Scheduler lo relance cada N minutos.

## Correrlo manual

```
cd tools-local\claude-bridge
node poller.js
```

Modo mock (no ejecuta `claude`, no gasta tokens — solo para probar el round-trip con Firestore):

```
CDM_BRIDGE_MOCK=1 node poller.js
```

(En PowerShell: `$env:CDM_BRIDGE_MOCK='1'; node poller.js`)

## Variables de entorno

| Variable | Default | Qué hace |
|---|---|---|
| `CDM_FIREBASE_KEY` | `C:\Users\Tobias\.secrets\cdm-firebase.json` | Ruta a la service account key de Firebase |
| `CDM_REPO_DIR` | ruta del repo Centro de Mando | `cwd` en el que corre `claude` |
| `CDM_BRIDGE_TIMEOUT_MS` | `180000` | Timeout duro por tarea (ms) |
| `CDM_CLAUDE_BIN` | `claude` | Binario de la CLI a invocar |
| `CDM_CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | Modelo pasado a `--model` |
| `CDM_BRIDGE_MOCK` | (sin setear) | Si es `'1'`, no ejecuta `claude` — devuelve un result canned |

## Esquema de la cola (Firestore, colección `appdata`)

Doc id `ctask_<epochMs>`:

```json
{
  "type": "claude_task",
  "prompt": "string",
  "status": "pending | running | done | error",
  "result": "string | null",
  "createdAt": 0,
  "finishedAt": 0,
  "device": "string | null"
}
```

El poller consulta `where('type','==','claude_task').where('status','==','pending')`
(dos igualdades, no requiere índice compuesto) y ordena por `createdAt` ascendente en
código. Procesa una tarea a la vez (secuencial).

## Seguridad

`claude` corre con `--allowedTools Read Grep Glob --disallowedTools Edit Write Bash` — solo
lectura/análisis del repo, nunca escribe ni ejecuta shell. El prompt se pasa como argumento
de array a `execFile` (no `shell:true` con interpolación), sin riesgo de inyección de shell.

## Registrar en Task Scheduler

```powershell
.\register-task.ps1
```

Crea la tarea `CDM-ClaudeBridge`: corre `node poller.js` cada 2 minutos, indefinidamente,
con las variables de entorno de arriba en sus defaults. Ver el script para el detalle del
trigger. No se ejecuta automáticamente al crearlo — hay que correrlo a mano una vez para
registrar la tarea.
