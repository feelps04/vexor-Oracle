param(
  [string]$WsUrl = 'ws://127.0.0.1:3000/ws/stocks?symbol=WINJ26',
  [int]$TimeoutMs = 5000
)

$ErrorActionPreference = 'Continue'

Write-Host "[diag-ws] url=$WsUrl timeoutMs=$TimeoutMs"

$ws = New-Object System.Net.WebSockets.ClientWebSocket
try { $ws.Options.Proxy = $null } catch {}
$cts = New-Object System.Threading.CancellationTokenSource
$cts.CancelAfter($TimeoutMs)

try {
  $ws.ConnectAsync([System.Uri]$WsUrl, $cts.Token).GetAwaiter().GetResult()
  Write-Host "[diag-ws] CONNECTED state=$($ws.State)"

  $cmd = @{ type = 'set_symbols'; symbols = @('WINJ26'); streams = @('ticks') } | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($cmd)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList (, $bytes)
  $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).GetAwaiter().GetResult()
  Write-Host "[diag-ws] SENT set_symbols"

  $buf = New-Object byte[] 8192
  $recv = $ws.ReceiveAsync((New-Object System.ArraySegment[byte] -ArgumentList (, $buf)), $cts.Token).GetAwaiter().GetResult()
  $text = [System.Text.Encoding]::UTF8.GetString($buf, 0, $recv.Count)
  Write-Host "[diag-ws] RECV type=$($recv.MessageType) end=$($recv.EndOfMessage) bytes=$($recv.Count)"
  Write-Host "[diag-ws] RECV_TEXT=$text"
} catch {
  Write-Host "[diag-ws] FAIL $($_.Exception.GetType().FullName): $($_.Exception.Message)"
  if ($_.Exception.InnerException) {
    Write-Host "[diag-ws] INNER $($_.Exception.InnerException.GetType().FullName): $($_.Exception.InnerException.Message)"
  }
} finally {
  try { $ws.Dispose() } catch {}
}
