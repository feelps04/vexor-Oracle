param(
  [string]$ApiBaseUrl = "http://127.0.0.1:3000",
  [string]$Symbol = "WINJ26",
  [int]$WsTimeoutMs = 6000
)

$ErrorActionPreference = 'Stop'

function Write-Result([string]$label, [string]$msg) {
  Write-Host "$label $msg"
}

function Get-Json([string]$url, [int]$timeoutSec = 4) {
  try {
    $res = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec $timeoutSec -Headers @{ Accept = 'application/json' }
    $text = $res.Content
    $json = $null
    try { $json = $text | ConvertFrom-Json } catch { $json = $null }
    return @{ ok = $true; status = [int]$res.StatusCode; text = $text; json = $json }
  } catch {
    $ex = $_.Exception
    $status = $null
    $text = $null
    try {
      if ($ex.Response -and $ex.Response.StatusCode) { $status = [int]$ex.Response.StatusCode }
    } catch {}
    try {
      if ($ex.Response -and $ex.Response.GetResponseStream) {
        $sr = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
        $text = $sr.ReadToEnd()
        $sr.Close()
      }
    } catch {}

    return @{ ok = $false; status = $status; text = $text; error = ($ex.Message) }
  }
}

$Symbol = $Symbol.Trim().ToUpperInvariant()
$ApiBaseUrl = $ApiBaseUrl.Trim().TrimEnd('/')

Write-Host "[check-feed-proofs] ApiBaseUrl=$ApiBaseUrl Symbol=$Symbol WsTimeoutMs=$WsTimeoutMs"

# Proof 1: /health
$h = Get-Json "$ApiBaseUrl/health" 4
if ($h.ok) {
  Write-Result "[proof1]" "GET /health status=$($h.status) body=$($h.text)"
} else {
  Write-Result "[proof1]" "FAILED status=$($h.status) err=$($h.error) body=$($h.text)"
}

# Proof 2: /api/v1/stocks/:symbol/quote
$q = Get-Json "$ApiBaseUrl/api/v1/stocks/$Symbol/quote" 4
if ($q.ok) {
  Write-Result "[proof2]" "GET /api/v1/stocks/$Symbol/quote status=$($q.status) body=$($q.text)"
} else {
  Write-Result "[proof2]" "FAILED status=$($q.status) err=$($q.error) body=$($q.text)"
}

# Proof 3: WS /ws/stocks (raw TCP handshake; avoids ClientWebSocket issues on locked-down VMs)
$gotInit = $false
$gotTick = $false
$initPrice = $null
$tickPrice = $null

try {
  $u = [System.Uri]$ApiBaseUrl
  $wsHost = $u.Host
  if ($wsHost -eq 'localhost' -or $wsHost -eq '::1') { $wsHost = '127.0.0.1' }
  if ($u.Scheme -ne 'http' -and $u.Scheme -ne 'https') { throw "unsupported scheme: $($u.Scheme)" }

  $path = "/ws/stocks?symbol=$([Uri]::EscapeDataString($Symbol))"
  $wsUrl = "ws://${wsHost}:$($u.Port)$path"

  $tcp = New-Object System.Net.Sockets.TcpClient
  $iar = $tcp.BeginConnect($wsHost, $u.Port, $null, $null)
  if (-not $iar.AsyncWaitHandle.WaitOne($WsTimeoutMs)) { throw "timeout connecting" }
  $tcp.EndConnect($iar)

  $stream = $tcp.GetStream()

  $keyBytes = New-Object byte[] 16
  (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($keyBytes)
  $secKey = [Convert]::ToBase64String($keyBytes)

  $req = "GET $path HTTP/1.1`r`n" +
         "Host: ${wsHost}:$($u.Port)`r`n" +
         "Upgrade: websocket`r`n" +
         "Connection: Upgrade`r`n" +
         "Sec-WebSocket-Key: $secKey`r`n" +
         "Sec-WebSocket-Version: 13`r`n" +
         "`r`n"

  $reqBytes = [System.Text.Encoding]::ASCII.GetBytes($req)
  $stream.Write($reqBytes, 0, $reqBytes.Length)

  # Read HTTP response headers
  $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
  $statusLine = $reader.ReadLine()
  if (-not $statusLine -or -not $statusLine.Contains('101')) { throw "handshake failed: $statusLine" }
  while ($true) {
    $line = $reader.ReadLine()
    if ($null -eq $line -or $line -eq '') { break }
  }

  # Read WS frames until timeout; expect init quickly and tick shortly after.
  $stream.ReadTimeout = $WsTimeoutMs
  $t0 = [DateTime]::UtcNow
  while ((([DateTime]::UtcNow - $t0).TotalMilliseconds -lt $WsTimeoutMs) -and (-not ($gotInit -and $gotTick))) {
    $b1 = $stream.ReadByte()
    $b2 = $stream.ReadByte()
    if ($b1 -lt 0 -or $b2 -lt 0) { break }

    $opcode = ($b1 -band 0x0F)
    $masked = (($b2 -band 0x80) -ne 0)
    $len = ($b2 -band 0x7F)

    if ($len -eq 126) {
      $hi = $stream.ReadByte(); $lo = $stream.ReadByte()
      $len = ($hi -shl 8) + $lo
    } elseif ($len -eq 127) {
      $l = 0
      for ($i=0; $i -lt 8; $i++) { $l = ($l -shl 8) + $stream.ReadByte() }
      $len = $l
    }

    $maskKey = $null
    if ($masked) {
      $maskKey = New-Object byte[] 4
      [void]$stream.Read($maskKey, 0, 4)
    }

    $payload = New-Object byte[] $len
    $read = 0
    while ($read -lt $len) {
      $n = $stream.Read($payload, $read, $len - $read)
      if ($n -le 0) { break }
      $read += $n
    }

    if ($masked -and $maskKey) {
      for ($i=0; $i -lt $payload.Length; $i++) { $payload[$i] = $payload[$i] -bxor $maskKey[$i % 4] }
    }

    if ($opcode -ne 1 -or $payload.Length -le 0) { continue }
    $text = [System.Text.Encoding]::UTF8.GetString($payload)
    $msg = $null
    try { $msg = $text | ConvertFrom-Json } catch { $msg = $null }
    if (-not $msg) { continue }

    if ($msg.type -eq 'init') {
      $gotInit = $true
      try {
        $p = [double]$msg.lastPrices.$Symbol
        if ($p -gt 0) { $initPrice = $p }
      } catch {}
    }
    if ($msg.type -eq 'tick') {
      $gotTick = $true
      try {
        $p2 = [double]$msg.priceBRL
        if ($p2 -gt 0) { $tickPrice = $p2 }
      } catch {}
    }
  }

  try { $tcp.Close() } catch {}
  Write-Result "[proof3]" "WS url=$wsUrl gotInit=$gotInit gotTick=$gotTick initPrice=$initPrice tickPrice=$tickPrice"
} catch {
  Write-Result "[proof3]" "FAILED err=$($_.Exception.Message)"
}

# Exit code: 0 if all ok-ish
$ok1 = $h.ok -and $h.status -eq 200
$ok2 = $q.ok -and $q.status -eq 200
# proof3 considered ok if websocket connects and we got init or tick.
# Price may be unavailable while MMF is not yet visible.
$ok3 = $false
if ($gotInit -or $gotTick) { $ok3 = $true }

if (-not ($ok1 -and $ok2 -and $ok3)) {
  exit 2
}

exit 0
