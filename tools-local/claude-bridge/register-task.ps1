<#
.SYNOPSIS
    Registra la tarea de Task Scheduler "CDM-ClaudeBridge": corre `node poller.js`
    cada 2 minutos, indefinidamente, para procesar la cola de tareas de JARVIS -> Claude Code.

.DESCRIPTION
    Sigue el mismo patrón que ~/.claude/automations/registrar-tareas.ps1 (LogonType
    InteractiveToken, StartWhenAvailable, MultipleInstancesPolicy=IgnoreNew para que no se
    solapen corridas si una tarda más de 2 min).

    Este script NO se ejecuta solo — hay que correrlo a mano una vez para dar de alta la
    tarea programada.

.PARAMETER Remove
    Si se pasa, desregistra la tarea en vez de crearla.
#>

param(
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$taskName = "CDM-ClaudeBridge"
$scriptRoot = $PSScriptRoot
$pollerPath = Join-Path $scriptRoot "poller.js"

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

# Se lanza vía powershell -WindowStyle Hidden en vez de node.exe directo: bajo LogonType
# Interactive, Task Scheduler le crea consola visible a cualquier app de consola (node.exe
# incluido) en la sesión del usuario. powershell oculto evita esa ventana negra cada 2 min.
$psArgs = "-NoProfile -WindowStyle Hidden -Command `"& '$nodePath' '$pollerPath'`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArgs -WorkingDirectory $scriptRoot

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
# marca cada tarea 'running' al iniciarla, así que una corrida solapada no encuentra pendientes.
try { $settings.MultipleInstances = 'IgnoreNew' } catch {}

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description "Poller local del puente JARVIS -> Claude Code (cola en Firestore appdata/type=claude_task). Corre cada 2 min." | Out-Null

Write-Output "Registrada: $taskName (cada 2 min, node en $nodePath)"
Write-Output "Verificá con: Get-ScheduledTask -TaskName '$taskName'"
