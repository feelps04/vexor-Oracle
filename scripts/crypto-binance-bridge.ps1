param(
  [string]$CsvPath = "./sectors_symbols.csv",
  [string]$MmfName = "CRYPTO_RAM",
  [int]$RecordBytes = 128,
  [int]$RecordCount = 2048,
  [int]$FlushMs = 200,
  [int]$PollMs = 1000
)

$ErrorActionPreference = 'Stop'

function NowIso() { (Get-Date).ToUniversalTime().ToString('o') }

function Poll-And-Run(
  [System.IO.MemoryMappedFiles.MemoryMappedViewAccessor]$acc,
  [int]$recordBytes,
  [int]$recordCount,
  [string[]]$baseSymbols,
  [int]$pollMs
) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  } catch {
    # ignore
  }

  Add-Type -AssemblyName System.Net.Http

  $handler = [System.Net.Http.HttpClientHandler]::new()
  try {
    $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
  } catch {
    # ignore
  }

  $http = [System.Net.Http.HttpClient]::new($handler)
  $http.Timeout = [TimeSpan]::FromSeconds(10)
  $http.BaseAddress = [Uri]::new('https://api.binance.com/')
  try {
    $http.DefaultRequestHeaders.UserAgent.ParseAdd('transaction-auth-engine/1.0')
    $http.DefaultRequestHeaders.Accept.ParseAdd('application/json')
  } catch {
    # ignore
  }

  $pairPref = @{} # base -> 'BRL' | 'USDT'
  $usdtBrl = 0.0
  $lastLog = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  function Get-AllPrices() {
    $resp = $http.GetAsync('api/v3/ticker/price').GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) {
      return @{ __error = ("http_status=" + [int]$resp.StatusCode) }
    }
    $txt = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $map = @{}

    $arr = $null
    try {
      $arr = $txt | ConvertFrom-Json
    } catch {
      return @{ __error = 'json_parse_failed' }
    }
    if ($null -eq $arr) { return @{ __error = 'json_empty' } }

    foreach ($el in $arr) {
      try {
        $sym = ("" + $el.symbol).Trim().ToUpperInvariant()
        $p = ("" + $el.price).Trim()
        if (-not $sym -or -not $p) { continue }
        $map[$sym] = [double]$p
      } catch {
        # ignore
      }
    }
    return $map
  }

  while ($true) {
    $prices = $null
    $errMsg = $null
    try {
      $prices = Get-AllPrices
    } catch {
      $prices = $null
      try {
        $errMsg = $_.Exception.Message
        if ($_.Exception.InnerException) { $errMsg = $errMsg + ' | inner=' + $_.Exception.InnerException.Message }
      } catch {}
    }

    if ($null -eq $prices) {
      $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      if (($now - $lastLog) -ge 10000) {
        $lastLog = $now
        if ($errMsg) {
          Write-Host "[crypto-bridge] fetch failed (exception) err='$errMsg' at=$(NowIso)"
        } else {
          Write-Host "[crypto-bridge] fetch failed (exception) at=$(NowIso)"
        }
      }
      Start-Sleep -Milliseconds ([Math]::Max(200, $pollMs))
      continue
    }

    if ($prices.ContainsKey('__error')) {
      $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      if (($now - $lastLog) -ge 10000) {
        $lastLog = $now
        Write-Host "[crypto-bridge] fetch failed $($prices['__error']) at=$(NowIso)"
      }
      Start-Sleep -Milliseconds ([Math]::Max(200, $pollMs))
      continue
    }

    if ($prices.ContainsKey('USDTBRL') -and [double]$prices['USDTBRL'] -gt 0) {
      $usdtBrl = [double]$prices['USDTBRL']
    }

    $writes = 0

    foreach ($base in $baseSymbols) {
      $priceBrl = 0.0
      if ($base -eq 'USDT') {
        $priceBrl = if ($usdtBrl -gt 0) { $usdtBrl } else { 1.0 }
      } else {
        $pref = $pairPref[$base]
        if (-not $pref) { $pref = 'BRL' }

        if ($pref -eq 'BRL') {
          $k = ("${base}BRL").ToUpperInvariant()
          if ($prices.ContainsKey($k) -and [double]$prices[$k] -gt 0) {
            $priceBrl = [double]$prices[$k]
            $pairPref[$base] = 'BRL'
          } else {
            $pairPref[$base] = 'USDT'
          }
        }

        if ($priceBrl -le 0 -and $pairPref[$base] -eq 'USDT') {
          $k = ("${base}USDT").ToUpperInvariant()
          if ($prices.ContainsKey($k) -and [double]$prices[$k] -gt 0) {
            $pUsdt = [double]$prices[$k]
            if ($usdtBrl -gt 0) {
              $priceBrl = $pUsdt * $usdtBrl
            } else {
              $priceBrl = $pUsdt
            }
          }
        }
      }

      if ($priceBrl -gt 0) {
        Write-Tick -acc $acc -recordBytes $recordBytes -recordCount $recordCount -symbol $base -priceBrl $priceBrl
        $writes++
      }
    }

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if (($now - $lastLog) -ge 10000) {
      $lastLog = $now
      $btcBrl = $prices.ContainsKey('BTCBRL')
      $btcUsdt = $prices.ContainsKey('BTCUSDT')
      $uBrl = $prices.ContainsKey('USDTBRL')
      Write-Host "[crypto-bridge] writes=$writes usdtBrl=$usdtBrl btcBrl=$btcBrl btcUsdt=$btcUsdt usdtbrl=$uBrl at=$(NowIso)"
    }

    Start-Sleep -Milliseconds ([Math]::Max(200, $pollMs))
  }
}

function Get-CryptoSymbolsFromCsv([string]$path) {
  if (-not (Test-Path $path)) { throw "CSV not found: $path" }
  $lines = Get-Content -LiteralPath $path
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($ln in $lines) {
    if (-not $ln) { continue }
    if ($ln.StartsWith('sector_id,')) { continue }
    # sector_029,Cripto - Spot,CRYPTO,BTC,Bitcoin,Criptomoeda,CRYPTO\BTC
    $parts = $ln.Split(',')
    if ($parts.Length -lt 4) { continue }
    $sectorId = ($parts[0] + '').Trim()
    if ($sectorId -ne 'sector_029') { continue }
    $sym = ($parts[3] + '').Trim().ToUpperInvariant()
    if (-not $sym) { continue }
    $null = $out.Add($sym)
  }
  return @($out | Select-Object -Unique)
}

function Get-Ascii16Bytes([string]$s) {
  $b = [System.Text.Encoding]::ASCII.GetBytes($s)
  $buf = New-Object byte[] 16
  $n = [Math]::Min(16, $b.Length)
  [Array]::Copy($b, 0, $buf, 0, $n)
  return $buf
}

function Get-RecordIndex([string]$sym, [int]$count) {
  $h = 2166136261
  foreach ($c in $sym.ToCharArray()) {
    $h = $h -bxor [int][byte][char]$c
    $h = ($h * 16777619) -band 0x7fffffff
  }
  return ($h % $count)
}

function Ensure-MmfWriter([string]$name, [int]$bytes, [int]$count) {
  $cap = [int64]$bytes * [int64]$count
  $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::CreateOrOpen($name, $cap, [System.IO.MemoryMappedFiles.MemoryMappedFileAccess]::ReadWrite)
  $acc = $mmf.CreateViewAccessor(0, $cap, [System.IO.MemoryMappedFiles.MemoryMappedFileAccess]::ReadWrite)
  return @{ Mmf = $mmf; Acc = $acc; Capacity = $cap }
}

function Write-Tick(
  [System.IO.MemoryMappedFiles.MemoryMappedViewAccessor]$acc,
  [int]$recordBytes,
  [int]$recordCount,
  [string]$symbol,
  [double]$priceBrl
) {
  if ($priceBrl -le 0) { return }
  $sym = $symbol.Trim().ToUpperInvariant()
  if (-not $sym) { return }

  $i = Get-RecordIndex -sym $sym -count $recordCount
  $off = $i * $recordBytes

  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  # writing flag
  $acc.Write($off + 40, [int]1)
  try {
    $acc.Write($off + 0, [double]$priceBrl)  # bid
    $acc.Write($off + 8, [double]0)          # ask
    $acc.Write($off + 24, [long]$ts)         # ts
    $acc.Write($off + 36, [int]1)            # hb
    $sb = Get-Ascii16Bytes -s $sym
    [void]$acc.WriteArray($off + 44, $sb, 0, 16)
  } finally {
    $acc.Write($off + 40, [int]0)
  }
}

function Get-CombinedStreamUrl([string[]]$streams) {
  $joined = ($streams | ForEach-Object { $_.ToLowerInvariant() }) -join '/' 
  return "wss://stream.binance.com:9443/stream?streams=$joined"
}

function Choose-Streams([string[]]$baseSymbols) {
  # Option B: prefer BRL when it exists, else USDT. We don't pre-check existence.
  # We subscribe to BOTH BRL and USDT for each base symbol and use BRL if seen.
  $streams = New-Object System.Collections.Generic.List[string]

  foreach ($s in $baseSymbols) {
    if ($s -eq 'USDT') { continue }
    # Binance uses symbols like BTCUSDT and BTCBRL
    $null = $streams.Add("${s}brl@ticker")
    $null = $streams.Add("${s}usdt@ticker")
  }

  # For conversion USDT->BRL fallback
  $null = $streams.Add("usdtbrl@ticker")

  return @($streams | Select-Object -Unique)
}

function Connect-And-Run(
  [string]$url,
  [System.IO.MemoryMappedFiles.MemoryMappedViewAccessor]$acc,
  [int]$recordBytes,
  [int]$recordCount,
  [string[]]$baseSymbols,
  [int]$flushMs
) {
  Add-Type -AssemblyName System.Net.Http

  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $cts = [Threading.CancellationTokenSource]::new()

  Write-Host "[crypto-bridge] connecting url=$url at=$(NowIso)"
  $ws.ConnectAsync($url, $cts.Token).GetAwaiter().GetResult()
  Write-Host "[crypto-bridge] connected at=$(NowIso)"

  $bestBrl = @{}  # base -> priceBRL direct (from *BRL)
  $bestUsdt = @{} # base -> priceUSDT (from *USDT)
  $usdtBrl = 0.0
  $seenAny = $false
  $recvCount = 0
  $parseErr = 0
  $lastLog = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $loggedBadJson = $false

  $lastFlush = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  $buf = New-Object byte[] 65536
  $sb = [System.Text.StringBuilder]::new(131072)

  while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $sb.Clear()
    $r = $null
    $msgType = $null
    do {
      $seg = New-Object System.ArraySegment[byte] -ArgumentList (, $buf)
      $r = $ws.ReceiveAsync($seg, $cts.Token).GetAwaiter().GetResult()
      $msgType = $r.MessageType
      if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }
      if ($r.Count -gt 0) {
        if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Text) {
          $chunk = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
          [void]$sb.Append($chunk)
        }
      }
    } while (-not $r.EndOfMessage)

    if ($null -ne $r -and $r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }

    if ($msgType -ne [System.Net.WebSockets.WebSocketMessageType]::Text) { continue }

    $json = $sb.ToString()
    if (-not $json) { continue }

    $recvCount++
    $nowLog = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if (($nowLog - $lastLog) -ge 10000) {
      $lastLog = $nowLog
      Write-Host "[crypto-bridge] recv=$recvCount parseErr=$parseErr bestBrl=$($bestBrl.Count) bestUsdt=$($bestUsdt.Count) usdtBrl=$usdtBrl at=$(NowIso)"
    }

    try {
      $doc = [System.Text.Json.JsonDocument]::Parse($json)
      try {
        $root = $doc.RootElement
        $data = $root.GetProperty('data')
        $s = $data.GetProperty('s').GetString()
        $lastStr = $data.GetProperty('c').GetString()
      } finally {
        $doc.Dispose()
      }

      $s = ("" + $s).Trim().ToUpperInvariant()
      if (-not $s) { continue }
      $last = 0.0
      try { $last = [double]("" + $lastStr) } catch { $last = 0.0 }
      if ($last -le 0) { continue }
    } catch {
      $parseErr++
      if (-not $loggedBadJson) {
        $loggedBadJson = $true
        $sample = if ($json.Length -gt 200) { $json.Substring(0, 200) } else { $json }
        Write-Host "[crypto-bridge] JSON parse failed sample='$sample'"
      }
      continue
    }

    if ($s -eq 'USDTBRL') {
      $usdtBrl = $last
    } elseif ($s.EndsWith('BRL')) {
      $base = $s.Substring(0, $s.Length - 3)
      $bestBrl[$base] = $last
    } elseif ($s.EndsWith('USDT')) {
      $base = $s.Substring(0, $s.Length - 4)
      $bestUsdt[$base] = $last
    }

    if (-not $seenAny) {
      $seenAny = $true
      Write-Host "[crypto-bridge] first tick s=$s last=$last usdtBrl=$usdtBrl at=$(NowIso)"
    }

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if (($now - $lastFlush) -lt $flushMs) { continue }
    $lastFlush = $now

    foreach ($base in $baseSymbols) {
      $pBrl = 0.0
      if ($bestBrl.ContainsKey($base)) {
        $pBrl = [double]$bestBrl[$base]
      } elseif ($bestUsdt.ContainsKey($base) -and $usdtBrl -gt 0) {
        $pBrl = ([double]$bestUsdt[$base]) * $usdtBrl
      } elseif ($bestUsdt.ContainsKey($base)) {
        # fallback until USDTBRL arrives
        $pBrl = [double]$bestUsdt[$base]
      } elseif ($base -eq 'USDT' -and $usdtBrl -gt 0) {
        $pBrl = $usdtBrl
      } elseif ($base -eq 'USDT') {
        $pBrl = 1.0
      }

      if ($pBrl -gt 0) {
        Write-Tick -acc $acc -recordBytes $recordBytes -recordCount $recordCount -symbol $base -priceBrl $pBrl
      }
    }
  }

  try { $ws.Dispose() } catch {}
}

$symbols = Get-CryptoSymbolsFromCsv -path $CsvPath
if ($symbols.Count -eq 0) { throw "No symbols found for sector_029 in $CsvPath" }

$streams = Choose-Streams -baseSymbols $symbols
$url = Get-CombinedStreamUrl -streams $streams

$mmf = Ensure-MmfWriter -name $MmfName -bytes $RecordBytes -count $RecordCount

Write-Host "[crypto-bridge] mmf='$MmfName' recordBytes=$RecordBytes recordCount=$RecordCount symbols=$($symbols.Count) at=$(NowIso)"

try {
  Poll-And-Run -acc $mmf.Acc -recordBytes $RecordBytes -recordCount $RecordCount -baseSymbols $symbols -pollMs $PollMs
} finally {
  try { $mmf.Acc.Dispose() } catch {}
  try { $mmf.Mmf.Dispose() } catch {}
}
