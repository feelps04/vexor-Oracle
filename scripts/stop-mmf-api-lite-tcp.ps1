$ErrorActionPreference = 'SilentlyContinue'

$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*mmf-api-lite-tcp.ps1*' }

if (-not $procs) {
  Write-Host "No mmf-api-lite-tcp process found"
  exit 0
}

foreach ($p in $procs) {
  Write-Host ("Stopping mmf-api-lite-tcp pid=" + $p.ProcessId)
  try { Stop-Process -Id $p.ProcessId -Force } catch {}
}
