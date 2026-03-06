param(
  [string]$ViteUrl = 'http://127.0.0.1:5173/',
  [string]$PreviewUrl = 'http://127.0.0.1:55653/'
)

$ErrorActionPreference = 'Continue'

function Fetch([string]$url){
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $url -Method GET
    $txt = [string]$r.Content
    if ($txt.Length -gt 300) { $txt = $txt.Substring(0,300) }
    Write-Host "URL=$url"
    Write-Host ("STATUS=" + $r.StatusCode)
    Write-Host ("LEN=" + ([string]$r.RawContentLength))
    Write-Host "HEAD="
    Write-Host $txt
    Write-Host "----"
  } catch {
    Write-Host "URL=$url"
    Write-Host ("FAIL " + $_.Exception.Message)
    Write-Host "----"
  }
}

Fetch $ViteUrl
Fetch $PreviewUrl
