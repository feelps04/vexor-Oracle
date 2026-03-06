param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Continue'

Write-Host "[diag-port] port=$Port"

try {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Host "[diag-port] no LISTEN socket found on port $Port"
  } else {
    foreach ($c in $conns) {
      Write-Host "[diag-port] LISTEN local=$($c.LocalAddress):$($c.LocalPort) pid=$($c.OwningProcess)"
    }
  }
} catch {
  Write-Host "[diag-port] Get-NetTCPConnection failed: $($_.Exception.Message)"
}

try {
  $pids = @()
  if ($conns) { $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique }
  foreach ($pid in $pids) {
    try {
      $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if ($p) {
        Write-Host "[diag-port] process pid=$pid name=$($p.ProcessName)"
      }
    } catch {}
  }
} catch {}
