param(
  [string]$Url = 'http://127.0.0.1:3000/health'
)

$ErrorActionPreference = 'Continue'

try {
  $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $Url -Method GET
  Write-Host ("STATUS=" + $r.StatusCode)
  Write-Host ("BODY=" + $r.Content)
} catch {
  Write-Host ("FAIL " + $_.Exception.Message)
}
