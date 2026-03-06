param(
  [string]$HostIp = '127.0.0.1',
  [int]$Port = 3000,
  [string]$Path = '/ws/stocks?symbol=WINJ26',
  [int]$TimeoutMs = 2000
)

$ErrorActionPreference = 'Continue'

try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $iar = $tcp.BeginConnect($HostIp, $Port, $null, $null)
  if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs)) { throw 'timeout connect' }
  $tcp.EndConnect($iar)

  $stream = $tcp.GetStream()
  $keyBytes = New-Object byte[] 16
  (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($keyBytes)
  $secKey = [Convert]::ToBase64String($keyBytes)

  $req = "GET $Path HTTP/1.1`r`n" +
         "Host: ${HostIp}:$Port`r`n" +
         "Upgrade: websocket`r`n" +
         "Connection: Upgrade`r`n" +
         "Sec-WebSocket-Key: $secKey`r`n" +
         "Sec-WebSocket-Version: 13`r`n" +
         "`r`n"

  $reqBytes = [System.Text.Encoding]::ASCII.GetBytes($req)
  $stream.Write($reqBytes, 0, $reqBytes.Length)

  $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
  $statusLine = $reader.ReadLine()
  Write-Host ("STATUS_LINE=" + $statusLine)
} catch {
  Write-Host ("FAIL " + $_.Exception.Message)
}
