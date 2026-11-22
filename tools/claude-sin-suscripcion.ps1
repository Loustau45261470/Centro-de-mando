# Abre Claude Code usando otro proveedor (Kimi u OpenRouter) en vez de la suscripción.
# Solo afecta a la ventana donde lo corrés: tus otras sesiones siguen con la suscripción.
#
# Uso:
#   .\tools\claude-sin-suscripcion.ps1                    # Kimi (pago por uso, barato)
#   .\tools\claude-sin-suscripcion.ps1 openrouter         # modelo gratis de OpenRouter
#   .\tools\claude-sin-suscripcion.ps1 kimi -p "pregunta" # sin ventana (como claude -p)
# Todo lo que va después del proveedor se le pasa tal cual a claude.
# Otro modelo: antes de correrlo, $env:MODELO_ALTERNATIVO = 'nombre/del-modelo'
#
# Claves (nunca en el repo):
#   Kimi:       %USERPROFILE%\.secrets\moonshot-key.txt    (o variable MOONSHOT_API_KEY)
#   OpenRouter: %USERPROFILE%\.secrets\openrouter-key.txt  (o variable OPENROUTER_API_KEY)
# Dentro de Claude Code, /status muestra qué proveedor está activo.

# Sin bloque param a propósito: PowerShell completa parámetros por prefijo y "-p" de claude
# se confundiría con un parámetro propio del script.
$Resto = @($args)
$Proveedor = 'kimi'
if ($Resto.Count -gt 0 -and @('kimi', 'openrouter') -contains $Resto[0]) {
  $Proveedor = $Resto[0]
  $Resto = @($Resto | Select-Object -Skip 1)
}
$Modelo = $env:MODELO_ALTERNATIVO

function Get-Clave($variable, $archivo) {
  $v = [Environment]::GetEnvironmentVariable($variable)
  if ($v) { return $v.Trim() }
  $ruta = Join-Path $env:USERPROFILE ".secrets\$archivo"
  if (Test-Path $ruta) { return (Get-Content $ruta -Raw).Trim() }
  return $null
}

if ($Proveedor -eq 'kimi') {
  $clave = Get-Clave 'MOONSHOT_API_KEY' 'moonshot-key.txt'
  $url = 'https://api.moonshot.ai/anthropic'
  if (-not $Modelo) { $Modelo = 'kimi-k3[1m]' }   # el que indica la guía oficial de Kimi
  $env:CLAUDE_CODE_AUTO_COMPACT_WINDOW = '1000000'
  $dondeSacarla = 'https://platform.kimi.ai (API Keys)'
} else {
  $clave = Get-Clave 'OPENROUTER_API_KEY' 'openrouter-key.txt'
  $url = 'https://openrouter.ai/api'
  if (-not $Modelo) { $Modelo = 'moonshotai/kimi-k2.7-code:free' }
  $dondeSacarla = 'https://openrouter.ai/keys'
}

if (-not $clave) {
  Write-Host "Falta la clave de $Proveedor. Sacala en $dondeSacarla y guardala en una línea en:" -ForegroundColor Yellow
  Write-Host "  $env:USERPROFILE\.secrets\$(if ($Proveedor -eq 'kimi') {'moonshot-key.txt'} else {'openrouter-key.txt'})"
  exit 1
}

$env:ANTHROPIC_BASE_URL = $url
$env:ANTHROPIC_AUTH_TOKEN = $clave
$env:ANTHROPIC_API_KEY = ''            # vacía: si quedara una clave de Anthropic, tendría prioridad
$env:ANTHROPIC_MODEL = $Modelo
$env:ANTHROPIC_DEFAULT_OPUS_MODEL = $Modelo
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = $Modelo
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = $Modelo
$env:ANTHROPIC_DEFAULT_FABLE_MODEL = $Modelo   # apunta al mismo modelo: nunca se usa Fable
$env:CLAUDE_CODE_SUBAGENT_MODEL = $Modelo

Write-Host "Claude Code -> $Proveedor ($Modelo)" -ForegroundColor Cyan
& claude @Resto
exit $LASTEXITCODE
