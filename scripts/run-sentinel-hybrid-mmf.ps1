$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'sentinel-hybrid-mmf.cpp'
$exe = Join-Path $PSScriptRoot 'sentinel-hybrid-mmf.exe'

Write-Host "[run-sentinel-hybrid-mmf] compiling..."

$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $cl) {
  throw "cl.exe not found. Open a 'Developer PowerShell for VS' (MSVC) and rerun." 
}

& cl.exe /nologo /std:c++17 /O2 /EHsc "$src" /Fe:"$exe" ws2_32.lib

Write-Host "[run-sentinel-hybrid-mmf] built: $exe"
Write-Host "[run-sentinel-hybrid-mmf] running... (Ctrl+C to stop)"

& "$exe"
