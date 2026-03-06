param(
  [string]$HostIp = '127.0.0.1',
  [int]$Port = 3000,
  [string]$Path = '/health',
  [int]$TimeoutMs = 2000
)

$ErrorActionPreference = 'Continue'

try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $iar = $tcp.BeginConnect($HostIp, $Port, $null, $null)
  if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs)) { throw 'timeout connect' }
  $tcp.EndConnect($iar)
  $stream = $tcp.GetStream()

  $req = "GET $Path HTTP/1.1`r`n" +
         "Host: ${HostIp}:$Port`r`n" +
         "Connection: close`r`n" +
         "`r`n"
  $reqBytes = [System.Text.Encoding]::ASCII.GetBytes($req)
  $stream.Write($reqBytes, 0, $reqBytes.Length)

  $buf = New-Object byte[] 4096
  $stream.ReadTimeout = $TimeoutMs
  $n = $stream.Read($buf, 0, $buf.Length)
  if ($n -le 0) { throw 'no response' }
  $text = [System.Text.Encoding]::ASCII.GetString($buf, 0, $n)
  Write-Host $text
} catch {
  Write-Host ("FAIL " + $_.Exception.Message)
}
