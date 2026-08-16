<#
.SYNOPSIS
    Registra la tarea de Task Scheduler "CDM-FixBridge": corre `node fix-poller.js`
    cada 2 minutos, indefinidamente, para procesar la cola de diagnósticos del canal de
    auto-fix (Firestore appdata/type=='fix_task').

.DESCRIPTION
    Mismo patrón que register-task.ps1 (LogonType Interactive, StartWhenAvailable,
    MultipleInstancesPolicy=IgnoreNew para que no se solapen corridas si una tarda más de
    2 min). Tarea SEPARADA de "CDM-ClaudeBridge" — no la reemplaza ni la toca.

    Este script NO se ejecuta solo — hay que correrlo a mano una vez para dar de alta la
    tarea programada.

.PARAMETER Remove
    Si se pasa, desregistra la tarea en vez de crearla.
#>

param(
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$taskName = "CDM-FixBridge"
$scriptRoot = $PSScriptRoot
$pollerPath = Join-Path $scriptRoot "fix-poller.js"

if ($Remove) {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Output "No hay tarea '$taskName' registrada."
        return
    }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Desregistrada: $taskName"
    return
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    throw "No se encontró 'node' en el PATH de esta shell. Instalá Node.js o corré este script desde una shell donde 'node' resuelva."
}
$nodePath = $nodeCmd.Source
Write-Output "Ruta de node resuelta: $nodePath"

$userId = "$env:USERDOMAIN\$env:USERNAME"
$startBoundary = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")

# Regla dura "Cero ventanas en pantalla" del CLAUDE.md global + memoria
# tareas-programadas-sin-ventana:
#   - NO usar "powershell -WindowStyle Hidden" como Command: la consola la crea el host ANTES
#     de que PowerShell aplique el estilo, así que parpadea igual.
#   - S4U tampoco sirve ACÁ: fix-poller.js ejecuta el CLI de `claude` (ver runDiagnosis), cuyas
#     credenciales OAuth están cifradas con DPAPI contra la sesión interactiva del usuario.
#     Sin sesión interactiva no desencriptan y todo diagnóstico falla por auth.
#   - El patrón correcto para este caso: wscript.exe + run-hidden.vbs manteniendo
#     LogonType=Interactive, que es lo que DPAPI necesita.
$vbsLauncher = Join-Path $env:USERPROFILE ".claude\automations\run-hidden.vbs"
if (-not (Test-Path $vbsLauncher)) {
    throw "No se encontró el launcher invisible en '$vbsLauncher'. Sin él la tarea mostraría una ventana de consola cada 2 min."
}
$action = New-ScheduledTaskAction -Execute "wscript.exe" `
    -Argument "`"$vbsLauncher`" `"$nodePath`" `"$pollerPath`"" -WorkingDirectory $scriptRoot

# RepetitionDuration: [TimeSpan]::MaxValue serializa a P99999999DT... que el Task Scheduler
# de Windows 10 (build 18362) rechaza por fuera de rango. Se usa 10 años (efectivamente
# indefinido, pero dentro del rango XML válido).
$trigger = New-ScheduledTaskTrigger -Once -At $startBoundary `
    -RepetitionInterval (New-TimeSpan -Minutes 2) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

# -MultipleInstancesPolicy no existe en New-ScheduledTaskSettingsSet en Windows 10 build 18362
# (PS 5.1). Se setea la propiedad directo, de forma defensiva. Si falla, no es crítico: el poller
# marca cada tarea 'diagnosing' al iniciarla, así que una corrida solapada no encuentra pendientes.
try { $settings.MultipleInstances = 'IgnoreNew' } catch {}

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description "Poller local del canal de auto-fix (cola en Firestore appdata/type=fix_task). Solo diagnostica, no escribe nunca. Corre cada 2 min." | Out-Null

Write-Output "Registrada: $taskName (cada 2 min, node en $nodePath)"
Write-Output "Verificá con: Get-ScheduledTask -TaskName '$taskName'"
