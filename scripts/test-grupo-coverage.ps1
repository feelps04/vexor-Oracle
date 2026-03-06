param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$GrupoTxtPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'grupo.txt'),
  [int]$SamplePerGroup = 25,
  [int]$MaxTotalSamples = 300,
  [switch]$Full
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$m) { Write-Host "[INFO] $m" }
function Write-Warn([string]$m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Write-Err([string]$m) { Write-Host "[ERR]  $m" -ForegroundColor Red }

function Get-Json([string]$url) {
  return Invoke-RestMethod -Method GET -Uri $url -TimeoutSec 10
}

function Parse-GrupoTxt([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "grupo.txt not found: $path"
  }

  $groupMap = @{}
  $all = New-Object System.Collections.Generic.List[string]

  $lines = Get-Content -LiteralPath $path
  foreach ($raw in $lines) {
    $line = ("" + $raw).Trim()
    if (-not $line) { continue }
    if ($line.StartsWith('===') -or $line.StartsWith('Gerado') -or $line.StartsWith('---')) { continue }
    if ($line -notmatch '\\') { continue }
    $parts = $line.Split('\\', 2)
    if ($parts.Length -ne 2) { continue }
    $g = ("" + $parts[0]).Trim().ToUpperInvariant()
    $s = ("" + $parts[1]).Trim().ToUpperInvariant()
    if (-not $g -or -not $s) { continue }

    if (-not $groupMap.ContainsKey($g)) {
      $groupMap[$g] = New-Object System.Collections.Generic.List[string]
    }
    $groupMap[$g].Add($s)
    $all.Add($s)
  }

  $uniq = New-Object System.Collections.Generic.HashSet[string]
  $allUniq = New-Object System.Collections.Generic.List[string]
  foreach ($s in $all) { if ($uniq.Add($s)) { $allUniq.Add($s) } }

  foreach ($k in @($groupMap.Keys)) {
    $seen = New-Object System.Collections.Generic.HashSet[string]
    $list = New-Object System.Collections.Generic.List[string]
    foreach ($s in $groupMap[$k]) { if ($seen.Add($s)) { $list.Add($s) } }
    $groupMap[$k] = $list
  }

  return @{ map = $groupMap; all = $allUniq.ToArray() }
}

function Take-Sample([string[]]$arr, [int]$n) {
  if (-not $arr) { return @() }
  if ($n -ge $arr.Length) { return $arr }
  # deterministic sample: take evenly spaced items
  $out = New-Object System.Collections.Generic.List[string]
  $step = [Math]::Max(1, [int]([Math]::Floor($arr.Length / $n)))
  $i = 0
  while ($out.Count -lt $n -and $i -lt $arr.Length) {
    $out.Add($arr[$i])
    $i += $step
  }
  return $out.ToArray()
}

Write-Info "BaseUrl=$BaseUrl"
Write-Info "GrupoTxtPath=$GrupoTxtPath"

# 0) health
try {
  $h = Get-Json "$BaseUrl/health"
  Write-Info ("health ok: " + ($h | ConvertTo-Json -Compress))
} catch {
  Write-Err "Backend not reachable at $BaseUrl. Start scripts/mmf-api-lite-tcp.ps1 first."
  throw
}

# 1) parse grupo.txt
$gd = Parse-GrupoTxt $GrupoTxtPath
$groupMap = $gd.map
$allSymbols = $gd.all
Write-Info "grupo.txt parsed: symbols=$($allSymbols.Length) groups=$($groupMap.Keys.Count)"

# 2) backend groups
$groupsRes = Get-Json "$BaseUrl/api/v1/market/groups"
$backendGroups = @()
if ($groupsRes -and $groupsRes.groups) { $backendGroups = @($groupsRes.groups) }
Write-Info "backend groups: $($backendGroups.Count)"

# Compare group sets
$localGroupSet = New-Object System.Collections.Generic.HashSet[string]
foreach ($k in $groupMap.Keys) { [void]$localGroupSet.Add($k) }
$backendGroupSet = New-Object System.Collections.Generic.HashSet[string]
foreach ($g in $backendGroups) {
  $name = ("" + $g.group).Trim().ToUpperInvariant()
  if ($name) { [void]$backendGroupSet.Add($name) }
}

$missingOnBackend = @()
foreach ($k in $localGroupSet) { if (-not $backendGroupSet.Contains($k)) { $missingOnBackend += $k } }
$extraOnBackend = @()
foreach ($k in $backendGroupSet) { if (-not $localGroupSet.Contains($k)) { $extraOnBackend += $k } }

if ($missingOnBackend.Count -gt 0) {
  Write-Warn "Groups missing on backend: $($missingOnBackend -join ', ')"
}
if ($extraOnBackend.Count -gt 0) {
  Write-Warn "Extra groups on backend: $($extraOnBackend -join ', ')"
}

# 3) per-group symbol coverage (sample or full)
$quoteOk = 0
$quoteNoData = 0
$quoteErr = 0
$totalChecked = 0
$quoteErrSamples = @()

$groupResults = @()

$groupKeys = @($groupMap.Keys | Sort-Object)
foreach ($grp in $groupKeys) {
  $localSyms = @($groupMap[$grp])
  # For coverage, always request as many as possible to avoid false "missing" due to paging.
  $limit = 5000

  $backendSyms = @()
  try {
    $res = Get-Json "$BaseUrl/api/v1/market/groups/$([Uri]::EscapeDataString($grp))/symbols?limit=$limit"
    if ($res -and $res.symbols) { $backendSyms = @($res.symbols) }
  } catch {
    $backendSyms = @()
  }

  $backendSet = New-Object System.Collections.Generic.HashSet[string]
  foreach ($s in $backendSyms) {
    $ss = ("" + $s).Trim().ToUpperInvariant()
    if ($ss) { [void]$backendSet.Add($ss) }
  }

  $missing = 0
  foreach ($s in $localSyms) {
    if (-not $backendSet.Contains($s)) { $missing++ }
  }

  $groupResults += [pscustomobject]@{
    group = $grp
    local = $localSyms.Count
    backend = $backendSyms.Count
    missingFromBackend = $missing
  }

  # quote checks: sample only
  $sampleN = 0
  if ($Full) {
    $sampleN = [Math]::Min($localSyms.Count, 50)
  } else {
    $sampleN = [Math]::Min($SamplePerGroup, $localSyms.Count)
  }
  $samples = Take-Sample $localSyms $sampleN

  foreach ($sym in $samples) {
    if ($totalChecked -ge $MaxTotalSamples) { break }
    $totalChecked++
    try {
      $q = Get-Json "$BaseUrl/api/v1/stocks/$([Uri]::EscapeDataString($sym))/quote"
      $p = $null
      if ($q -and $q.priceBRL -ne $null) { $p = [double]$q.priceBRL }
      if ($p -ne $null -and (-not [double]::IsNaN($p)) -and (-not [double]::IsInfinity($p)) -and $p -gt 0) {
        $quoteOk++
      } else {
        $quoteNoData++
      }
    } catch {
      # Invoke-RestMethod throws on non-2xx, but for our backend 503 means "no real-time price yet".
      $msg = "" + $_.Exception.Message
      $status = $null
      try {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
          $status = [int]$_.Exception.Response.StatusCode
        }
      } catch {}

      if ($status -eq 503 -or ($msg -match '503')) {
        $quoteNoData++
      } else {
        $quoteErr++
        if ($quoteErrSamples.Count -lt 10) {
          $quoteErrSamples += [pscustomobject]@{ symbol = $sym; status = $status; message = $msg }
        }
      }
    }
  }

  if ($totalChecked -ge $MaxTotalSamples) { break }
}

Write-Host ""
Write-Info "=== Group coverage summary ==="
$groupResults | Sort-Object -Property missingFromBackend -Descending | Select-Object -First 30 | Format-Table -AutoSize

Write-Host ""
Write-Info "=== Quote sample summary ==="
Write-Info "checked=$totalChecked ok=$quoteOk no_data=$quoteNoData errors=$quoteErr"

if ($quoteErrSamples.Count -gt 0) {
  Write-Host ""
  Write-Info "=== Quote error samples (first 10) ==="
  $quoteErrSamples | Format-Table -AutoSize
}

if ($quoteErr -gt 0) {
  Write-Warn "Some quote requests errored. Check backend logs and if mmf-api-lite-tcp.ps1 is running."
}

Write-Host ""
Write-Info "Done."
