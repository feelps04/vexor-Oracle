param(
  [string]$HostIp = "127.0.0.1",
  [int]$Port = 9999
)

$ErrorActionPreference = 'Stop'

function NowIso() { (Get-Date).ToUniversalTime().ToString('o') }

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($HostIp), $Port)
$listener.Start()
Write-Host "[execution-simulator] listening host=$HostIp port=$Port at=$(NowIso)"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $peer = $client.Client.RemoteEndPoint.ToString()
    Write-Host "[execution-simulator] connected peer=$peer at=$(NowIso)"

    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
    $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::UTF8)
    $writer.AutoFlush = $true

    try {
      while ($client.Connected) {
        $line = $reader.ReadLine()
        if ($null -eq $line) { break }
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        $payload = [ordered]@{
          at = NowIso
          peer = $peer
          kind = 'order_received'
          raw = $line
        } | ConvertTo-Json -Compress

        Write-Host $payload

        $ack = [ordered]@{
          type = 'ack'
          ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
          receivedAt = NowIso
          status = 'SIMULATED'
        } | ConvertTo-Json -Compress

        $writer.WriteLine($ack)
      }
    } catch {
      Write-Host "[execution-simulator] socket error peer=$peer err=$($_.Exception.Message)"
    } finally {
      try { $reader.Dispose() } catch {}
      try { $writer.Dispose() } catch {}
      try { $stream.Dispose() } catch {}
      try { $client.Close() } catch {}
      Write-Host "[execution-simulator] disconnected peer=$peer at=$(NowIso)"
    }
  }
} finally {
  try { $listener.Stop() } catch {}
}
