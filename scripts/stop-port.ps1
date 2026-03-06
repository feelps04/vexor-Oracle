param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Continue'

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
  Write-Host "[stop-port] no LISTEN socket found on port $Port"
  exit 0
}

$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $pids) {
  Write-Host "[stop-port] stopping pid=$procId on port=$Port"
  try { Stop-Process -Id $procId -Force } catch { Write-Host "[stop-port] failed to stop pid=$procId err=$($_.Exception.Message)" }
}
