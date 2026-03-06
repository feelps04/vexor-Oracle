param(
  [string]$HostIp = "127.0.0.1",
  [int]$Port = 3000,
  [string]$MmfName = "B3RAM",
  [string]$SecondaryMmfName = "",
  [int]$RecordBytes = 128,
  [int]$RecordCount = 500,
  [int]$SecondaryRecordCount = 500,
  [int]$PollMs = 100
)

$ErrorActionPreference = 'Stop'

function NowIso() { (Get-Date).ToUniversalTime().ToString('o') }

if (-not ([System.Management.Automation.PSTypeName]'WinMmf').Type) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class WinMmf {
  public const uint FILE_MAP_READ = 0x0004;

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr OpenFileMapping(uint dwDesiredAccess, bool bInheritHandle, string lpName);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr MapViewOfFile(IntPtr hFileMappingObject, uint dwDesiredAccess, uint dwFileOffsetHigh, uint dwFileOffsetLow, UIntPtr dwNumberOfBytesToMap);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);

  public static long ReadInt64(IntPtr basePtr, int offset) {
    return Marshal.ReadInt64(basePtr, offset);
  }

  public static int ReadInt32(IntPtr basePtr, int offset) {
    return Marshal.ReadInt32(basePtr, offset);
  }

  public static double ReadDouble(IntPtr basePtr, int offset) {
    long bits = Marshal.ReadInt64(basePtr, offset);
    return BitConverter.Int64BitsToDouble(bits);
  }

  public static byte[] ReadBytes(IntPtr basePtr, int offset, int count) {
    var buf = new byte[count];
    Marshal.Copy(IntPtr.Add(basePtr, offset), buf, 0, count);
    return buf;
  }
}
"@
}

function Ensure-Mmf {
  param(
    [ref]$mmfRef,
    [ref]$accRef,
    [ref]$openedNameRef,
    [string]$Name,
    [int]$Count
  )

  if ($mmfRef.Value -and ($mmfRef.Value -ne [IntPtr]::Zero) -and $accRef.Value -and ($accRef.Value -ne [IntPtr]::Zero)) { return }

  if (-not $Name) { return }

  $candidates = @($Name, "Global\$Name", "Local\$Name")
  foreach ($n in $candidates) {
    $h = [WinMmf]::OpenFileMapping([WinMmf]::FILE_MAP_READ, $false, $n)
    if ($h -eq [IntPtr]::Zero) { continue }

    $mapBytes = [UIntPtr]::op_Explicit([uint64]($RecordBytes * $Count))
    $p = [WinMmf]::MapViewOfFile($h, [WinMmf]::FILE_MAP_READ, 0, 0, $mapBytes)
    if ($p -eq [IntPtr]::Zero) {
      [void][WinMmf]::CloseHandle($h)
      continue
    }

    $mmfRef.Value = $h
    $accRef.Value = $p
    $openedNameRef.Value = $n
    Write-Host "[mmf-api-lite] MMF opened name='$n' at=$(NowIso)"
    return
  }
}

function Read-MmfPrice([object]$acc, [string]$Symbol, [int]$Count) {
  if ($null -eq $acc) { return $null }
  try {
    $accPtr = [IntPtr]$acc
  } catch {
    return $null
  }
  if ($accPtr -eq [IntPtr]::Zero) { return $null }
  $sym = $Symbol.Trim().ToUpperInvariant()
  if (-not $sym) { return $null }

  $best = $null

  for ($i = 0; $i -lt $Count; $i++) {
    $off = $i * $RecordBytes

    $writing = [WinMmf]::ReadInt32($accPtr, $off + 40)
    if ($writing -eq 1) { continue }

    $bytes = [WinMmf]::ReadBytes($accPtr, $off + 44, 16)
    $s = ([System.Text.Encoding]::ASCII.GetString($bytes)).Trim([char]0).Trim()
    if (-not $s) { continue }
    $s = $s.ToUpperInvariant()
    if ($s -ne $sym) { continue }

    $hb = [WinMmf]::ReadInt32($accPtr, $off + 36)

    $ts = [WinMmf]::ReadInt64($accPtr, $off + 24)

    $bid = [WinMmf]::ReadDouble($accPtr, $off + 0)
    $ask = [WinMmf]::ReadDouble($accPtr, $off + 8)

    # Retornar bid e ask separadamente para transparência
    # priceBRL = mid price (média entre bid e ask)
    $mid = 0
    if ($bid -gt 0 -and $ask -gt 0) { $mid = ($bid + $ask) / 2 }
    elseif ($bid -gt 0) { $mid = $bid }
    elseif ($ask -gt 0) { $mid = $ask }
    
    if ($mid -le 0) { continue }

    if ($null -eq $best -or $hb -gt $best.hb -or ($hb -eq $best.hb -and $ts -gt $best.ts)) {
      $best = [ordered]@{ symbol = $s; bid = $bid; ask = $ask; priceBRL = $mid; spread = [Math]::Abs($ask - $bid); spreadPct = if ($mid -gt 0) { [Math]::Round([Math]::Abs($ask - $bid) / $mid * 100, 2) } else { 0 }; hb = $hb; ts = $ts }
    }
  }

  return $best
}

function Read-MmfSymbols([object]$acc, [int]$Count) {
  if ($null -eq $acc) { return @() }
  try {
    $accPtr = [IntPtr]$acc
  } catch {
    return @()
  }
  if ($accPtr -eq [IntPtr]::Zero) { return @() }

  $set = New-Object System.Collections.Generic.HashSet[string]

  for ($i = 0; $i -lt $Count; $i++) {
    $off = $i * $RecordBytes

    $writing = [WinMmf]::ReadInt32($accPtr, $off + 40)
    if ($writing -eq 1) { continue }

    $bytes = [WinMmf]::ReadBytes($accPtr, $off + 44, 16)
    $s = ([System.Text.Encoding]::ASCII.GetString($bytes)).Trim([char]0).Trim()
    if (-not $s) { continue }
    $s = $s.ToUpperInvariant()
    $null = $set.Add($s)
  }

  return @($set)
}

function Read-AnyMmfPrice([string]$Symbol) {
  $p = Read-MmfPrice -acc $script:acc -Symbol $Symbol -Count $RecordCount
  if ($null -ne $p) { return $p }
  if ($script:secondaryAcc -and $script:secondaryAcc -ne [IntPtr]::Zero) {
    $p = Read-MmfPrice -acc $script:secondaryAcc -Symbol $Symbol -Count $SecondaryRecordCount
    if ($null -ne $p) { return $p }
  }
  
  # Fallback: ler do mt5_prices.json
  $mt5PricesPath = "C:\Users\Bete\Desktop\projeto-sentinel\mt5_prices.json"
  if (Test-Path $mt5PricesPath) {
    try {
      $jsonStr = Get-Content $mt5PricesPath -Raw
      $json = $jsonStr | ConvertFrom-Json
      $sym = $Symbol.ToUpperInvariant()
      
      # Mapear códigos de moeda para pares MT5
      $mt5Symbol = $sym
      $currencyPairs = @{
        'EUR' = 'EURUSD'; 'GBP' = 'GBPUSD'; 'JPY' = 'USDJPY'; 'AUD' = 'AUDUSD'
        'CAD' = 'USDCAD'; 'CHF' = 'USDCHF'; 'NZD' = 'NZDUSD'
        'ARS' = 'USDARS'; 'BRL' = 'USDBRL'; 'MXN' = 'USDMXN'; 'ZAR' = 'USDZAR'
        'INR' = 'USDINR'; 'CNY' = 'USDCNH'; 'CNH' = 'USDCNH'
        'NOK' = 'EURNOK'; 'SEK' = 'EURSEK'; 'DKK' = 'EURDKK'
        'PLN' = 'EURPLN'; 'TRY' = 'USDTRY'; 'SGD' = 'USDSGD'
        'HKD' = 'USDHKD'; 'KRW' = 'USDKRW'; 'TWD' = 'USDTWD'
        'THB' = 'USDTHB'; 'HUF' = 'EURHUF'; 'CZK' = 'EURCZK'
        'CLP' = 'USDCLP'; 'COP' = 'USDCOP'; 'PEN' = 'USDPEN'
        'UYU' = 'USDUYU'; 'RUB' = 'USDRUB'
      }
      if ($currencyPairs.ContainsKey($sym)) {
        $mt5Symbol = $currencyPairs[$sym]
      }
      
      $tick = $json.PSObject.Properties[$mt5Symbol].Value
      if ($null -ne $tick) {
        $bid = [double]$tick.bid
        $ask = [double]$tick.ask
        if ($bid -gt 0 -or $ask -gt 0) {
          # Para pares invertidos (USDJPY), inverter para mostrar valor da moeda
          $isInverted = $sym -in @('JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'KRW', 'TWD', 'THB', 'TRY', 'MXN', 'ZAR', 'INR', 'CNH', 'CNY', 'ARS', 'BRL', 'CLP', 'COP', 'PEN', 'UYU', 'RUB')
          $displayBid = if ($isInverted) { [Math]::Round(1 / $ask, 6) } else { $bid }
          $displayAsk = if ($isInverted) { [Math]::Round(1 / $bid, 6) } else { $ask }
          
          return [PSCustomObject]@{
            symbol = $sym
            bid = $displayBid
            ask = $displayAsk
            priceBRL = $displayAsk
            spread = [Math]::Abs($displayAsk - $displayBid)
            spreadPct = 0
          }
        }
      }
    } catch { Write-Host "MT5 fallback error: $_" }
  }
  
  return $null
}

function Read-AnyMmfSymbols() {
  $set = New-Object System.Collections.Generic.HashSet[string]
  $p = Read-MmfSymbols -acc $script:acc -Count $RecordCount
  foreach ($s in $p) { $null = $set.Add($s) }
  if ($script:secondaryAcc -and $script:secondaryAcc -ne [IntPtr]::Zero) {
    $q = Read-MmfSymbols -acc $script:secondaryAcc -Count $SecondaryRecordCount
    foreach ($s in $q) { $null = $set.Add($s) }
  }
  return @($set)
}

$mmf = [IntPtr]::Zero
$acc = [IntPtr]::Zero
$openedName = $null

$secondaryMmf = [IntPtr]::Zero
$secondaryAcc = [IntPtr]::Zero
$secondaryOpenedName = $null

$http = [System.Net.HttpListener]::new()
$prefix = "http://${HostIp}:${Port}/"
$http.Prefixes.Add($prefix)
$http.Start()
Write-Host "[mmf-api-lite] listening $prefix at=$(NowIso)"

$clients = [System.Collections.Concurrent.ConcurrentDictionary[string, object]]::new()

$timer = New-Object System.Timers.Timer
$timer.Interval = [Math]::Max(20, $PollMs)
$timer.AutoReset = $true
$timer.add_Elapsed({
  Ensure-Mmf -mmfRef ([ref]$script:mmf) -accRef ([ref]$script:acc) -openedNameRef ([ref]$script:openedName) -Name $MmfName -Count $RecordCount
  Ensure-Mmf -mmfRef ([ref]$script:secondaryMmf) -accRef ([ref]$script:secondaryAcc) -openedNameRef ([ref]$script:secondaryOpenedName) -Name $SecondaryMmfName -Count $SecondaryRecordCount
  foreach ($kv in $clients.GetEnumerator()) {
    $state = $kv.Value
    try {
      $sym = $state.Symbol
      $ws = $state.WebSocket
      if ($null -eq $ws -or $ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { continue }

      $p = Read-AnyMmfPrice -Symbol $sym
      if ($null -eq $p) { continue }

      $tick = [ordered]@{ 
        type='tick'
        symbol=$p.symbol
        bid=[double]$p.bid
        ask=[double]$p.ask
        priceBRL=[double]$p.priceBRL
        spread=[double]$p.spread
        spreadPct=[double]$p.spreadPct
        ts=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
      } | ConvertTo-Json -Compress
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($tick)
      $seg = New-Object System.ArraySegment[byte] -ArgumentList (, $bytes)
      $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None) | Out-Null
    } catch {
      # ignore
    }
  }
})
$timer.Start()

try {
  while ($http.IsListening) {
    $ctx = $http.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $path = $req.Url.AbsolutePath

    if ($path -eq '/health') {
      $body = [ordered]@{ status='ok'; redis='unconfigured'; redisLatencyMs=0 } | ConvertTo-Json -Compress
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
      $res.StatusCode = 200
      $res.ContentType = 'application/json'
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    if ($path -eq '/symbols') {
      Ensure-Mmf -mmfRef ([ref]$script:mmf) -accRef ([ref]$script:acc) -openedNameRef ([ref]$script:openedName) -Name $MmfName -Count $RecordCount
      Ensure-Mmf -mmfRef ([ref]$script:secondaryMmf) -accRef ([ref]$script:secondaryAcc) -openedNameRef ([ref]$script:secondaryOpenedName) -Name $SecondaryMmfName -Count $SecondaryRecordCount
      $syms = Read-AnyMmfSymbols
      $limitRaw = $ctx.Request.QueryString['limit']
      $limit = 0
      try { $limit = [int]("" + $limitRaw) } catch { $limit = 0 }
      if ($limit -le 0) { $limit = 500 }
      if ($limit -gt 20000) { $limit = 20000 }

      $list = @()
      if ($syms.Count -le $limit) {
        $list = $syms
      } else {
        $list = @($syms | Select-Object -First $limit)
      }

      $body = [ordered]@{ count=($syms.Count); returned=($list.Count); symbols=$list } | ConvertTo-Json -Compress
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
      $res.StatusCode = 200
      $res.ContentType = 'application/json'
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    if ($path -like '/api/v1/stocks/*/quote') {
      Ensure-Mmf -mmfRef ([ref]$script:mmf) -accRef ([ref]$script:acc) -openedNameRef ([ref]$script:openedName) -Name $MmfName -Count $RecordCount
      Ensure-Mmf -mmfRef ([ref]$script:secondaryMmf) -accRef ([ref]$script:secondaryAcc) -openedNameRef ([ref]$script:secondaryOpenedName) -Name $SecondaryMmfName -Count $SecondaryRecordCount
      $parts = $path.Split('/')
      $symbol = $parts[4]
      $p = Read-AnyMmfPrice -Symbol $symbol
      if ($null -eq $p) {
        $res.StatusCode = 503
        $body = @{ message='stocks quote failed: no real-time price yet for symbol (MMF)'; symbol=$symbol } | ConvertTo-Json -Compress
      } else {
        $res.StatusCode = 200
        # Retornar bid, ask, mid price e spread para transparência
        $body = @{ 
          symbol = $p.symbol
          bid = [double]$p.bid
          ask = [double]$p.ask
          priceBRL = [double]$p.priceBRL
          spread = [double]$p.spread
          spreadPct = [double]$p.spreadPct
        } | ConvertTo-Json -Compress
      }
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
      $res.ContentType = 'application/json'
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    if ($path -eq '/ws/stocks') {
      Ensure-Mmf -mmfRef ([ref]$script:mmf) -accRef ([ref]$script:acc) -openedNameRef ([ref]$script:openedName) -Name $MmfName -Count $RecordCount
      Ensure-Mmf -mmfRef ([ref]$script:secondaryMmf) -accRef ([ref]$script:secondaryAcc) -openedNameRef ([ref]$script:secondaryOpenedName) -Name $SecondaryMmfName -Count $SecondaryRecordCount
      if (-not $ctx.Request.IsWebSocketRequest) {
        $res.StatusCode = 400
        $res.Close()
        continue
      }

      $sym = $ctx.Request.QueryString['symbol']
      if (-not $sym) { $sym = 'WINJ26' }
      $sym = $sym.Trim().ToUpperInvariant()

      $wsCtx = $null
      try {
        # Usar subProtocol 'json' (obrigatório no .NET)
        $wsCtx = $ctx.AcceptWebSocketAsync('json').GetAwaiter().GetResult()
      } catch {
        Write-Host "[mmf-api-lite] WebSocket accept error: $_"
        try {
          $res.StatusCode = 500
          $res.Close()
        } catch {}
        continue
      }

      $ws = $wsCtx.WebSocket
      $id = [Guid]::NewGuid().ToString('n')

      $clients[$id] = [pscustomobject]@{ Symbol = $sym; WebSocket = $ws }

      try {
        $p = Read-AnyMmfPrice -Symbol $sym
        $init = if ($null -eq $p) {
          @{ type='init'; ts=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()); lastPrices=@{} }
        } else {
          @{ 
            type='init'
            ts=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            lastPrices=@{ ($p.symbol) = [double]$p.priceBRL }
            bid=[double]$p.bid
            ask=[double]$p.ask
            spread=[double]$p.spread
            spreadPct=[double]$p.spreadPct
          }
        }
        $initJson = $init | ConvertTo-Json -Compress
        $b = [System.Text.Encoding]::UTF8.GetBytes($initJson)
        $seg = New-Object System.ArraySegment[byte] -ArgumentList (, $b)
        $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None) | Out-Null

        $buf = New-Object byte[] 8192
        while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
          $r = $ws.ReceiveAsync((New-Object System.ArraySegment[byte] -ArgumentList (, $buf)), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
          if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }
          
          # Processar mensagens do cliente (ex: set_symbols)
          $msgText = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
          Write-Host "[WS] Received: $msgText"
          try {
            $clientMsg = $msgText | ConvertFrom-Json
            if ($clientMsg.type -eq 'set_symbols' -and $clientMsg.symbols) {
              # Enviar preços de todos os símbolos solicitados
              Write-Host "[WS] set_symbols received: $($clientMsg.symbols -join ',')"
              $lastPrices = @{}
              foreach ($s in $clientMsg.symbols) {
                $px = Read-AnyMmfPrice -Symbol $s
                Write-Host "[WS] Price for $s : $px"
                if ($px) {
                  $lastPrices[$s] = @{
                    priceBRL = [double]$px.priceBRL
                    bid = [double]$px.bid
                    ask = [double]$px.ask
                    spread = [double]$px.spread
                    spreadPct = [double]$px.spreadPct
                  }
                }
              }
              Write-Host "[WS] lastPrices count: $($lastPrices.Count)"
              $resp = @{ type='init'; ts=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()); lastPrices=$lastPrices }
              $respJson = $resp | ConvertTo-Json -Compress -Depth 3
              Write-Host "[WS] Sending: $respJson"
              $b2 = [System.Text.Encoding]::UTF8.GetBytes($respJson)
              $seg2 = New-Object System.ArraySegment[byte] -ArgumentList (, $b2)
              $ws.SendAsync($seg2, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None) | Out-Null
            }
          } catch {
            Write-Host "[WS] Error: $_"
          }
        }
      } catch {
        # ignore
      } finally {
        $null = $clients.TryRemove($id, [ref]$null)
        try { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'bye', [Threading.CancellationToken]::None) | Out-Null } catch {}
        try { $ws.Dispose() } catch {}
      }

      continue
    }

    $res.StatusCode = 404
    $res.Close()
  }
} finally {
  try { $timer.Stop() } catch {}
  try { $http.Stop() } catch {}
  try {
    if ($script:acc -and $script:acc -ne [IntPtr]::Zero) { [void][WinMmf]::UnmapViewOfFile([IntPtr]$script:acc) }
  } catch {}
  try {
    if ($script:mmf -and $script:mmf -ne [IntPtr]::Zero) { [void][WinMmf]::CloseHandle([IntPtr]$script:mmf) }
  } catch {}

  try {
    if ($script:secondaryAcc -and $script:secondaryAcc -ne [IntPtr]::Zero) { [void][WinMmf]::UnmapViewOfFile([IntPtr]$script:secondaryAcc) }
  } catch {}
  try {
    if ($script:secondaryMmf -and $script:secondaryMmf -ne [IntPtr]::Zero) { [void][WinMmf]::CloseHandle([IntPtr]$script:secondaryMmf) }
  } catch {}
}
