param(
  [string]$HostIp = "127.0.0.1",
  [int]$Port = 3000,
  [string]$MmfName = "B3RAM",
  [int]$RecordBytes = 128,
  [int]$RecordCount = 8192,
  [int]$TickIntervalMs = 200
)

$ErrorActionPreference = 'Stop'

function NowIso() { (Get-Date).ToUniversalTime().ToString('o') }

$LogPath = Join-Path $PSScriptRoot 'mmf-api-lite-tcp.log'
function LogLine([string]$msg) {
  try {
    $line = "$(NowIso) $msg"
    Add-Content -Path $LogPath -Value $line
  } catch {
    # ignore
  }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$GrupoTxtPath = Join-Path $RepoRoot 'grupo.txt'
$SectorsCsvPath = Join-Path $RepoRoot 'sectors.csv'
$SectorsSymbolsCsvPath = Join-Path $RepoRoot 'sectors_symbols.csv'

function Load-GrupoSymbols {
  $map = @{}
  $all = New-Object System.Collections.Generic.List[string]
  try {
    if (-not (Test-Path -LiteralPath $GrupoTxtPath)) {
      LogLine ("GRUPO_TXT_MISSING path=" + $GrupoTxtPath)
      return @{ map = $map; all = @() }
    }

    $lines = Get-Content -LiteralPath $GrupoTxtPath -ErrorAction Stop
    foreach ($raw in $lines) {
      $line = ("" + $raw).Trim()
      if (-not $line) { continue }
      if ($line.StartsWith('===') -or $line.StartsWith('Gerado') -or $line.StartsWith('---')) { continue }
      if ($line -notmatch '\\') { continue }
      $parts = $line.Split('\\', 2)
      if ($parts.Length -ne 2) { continue }
      $grp = ("" + $parts[0]).Trim().ToUpperInvariant()
      $sym = ("" + $parts[1]).Trim().ToUpperInvariant()
      if (-not $grp -or -not $sym) { continue }

      if (-not $map.ContainsKey($grp)) {
        $map[$grp] = New-Object System.Collections.Generic.List[string]
      }
      $map[$grp].Add($sym)
      $all.Add($sym)
    }
  } catch {
    LogLine ("GRUPO_TXT_LOAD_ERR err=" + $_.Exception.Message)
  }

  $uniq = New-Object System.Collections.Generic.HashSet[string]
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($s in $all) {
    if ($uniq.Add($s)) { $out.Add($s) }
  }

  foreach ($k in @($map.Keys)) {
    $seen = New-Object System.Collections.Generic.HashSet[string]
    $list = New-Object System.Collections.Generic.List[string]
    foreach ($s in $map[$k]) { if ($seen.Add($s)) { $list.Add($s) } }
    $map[$k] = $list
  }

  return @{ map = $map; all = $out.ToArray() }
}

$GrupoData = Load-GrupoSymbols
$GroupToSymbols = $GrupoData.map
$AllSymbols = $GrupoData.all
Write-Host "[mmf-api-lite-tcp] grupo.txt symbols=$($AllSymbols.Count) groups=$($GroupToSymbols.Keys.Count)"
LogLine ("GRUPO_TXT_LOADED symbols=" + $AllSymbols.Count + " groups=" + $GroupToSymbols.Keys.Count)

function Load-SectorsData {
  $sectors = @()
  $sectorMap = @{}
  $sectorToSymbols = @{}
  $symbolToSectorIds = @{}

  try {
    if (Test-Path -LiteralPath $SectorsCsvPath) {
      $raw = Get-Content -LiteralPath $SectorsCsvPath -ErrorAction Stop
      $rows = $raw | ConvertFrom-Csv
      foreach ($r in $rows) {
        $id = ("" + $r.sector_id).Trim()
        if (-not $id) { continue }
        $name = ("" + $r.sector_name).Trim()
        $desc = ("" + $r.description).Trim()
        $total = 0
        try { $total = [int]("" + $r.total_symbols) } catch { $total = 0 }
        $obj = @{ sectorId=$id; name=$name; totalSymbols=$total; description=$desc }
        $sectors += $obj
        $sectorMap[$id] = $obj
      }
    } else {
      LogLine ("SECTORS_CSV_MISSING path=" + $SectorsCsvPath)
    }
  } catch {
    LogLine ("SECTORS_CSV_LOAD_ERR err=" + $_.Exception.Message)
  }

  try {
    if (Test-Path -LiteralPath $SectorsSymbolsCsvPath) {
      $raw2 = Get-Content -LiteralPath $SectorsSymbolsCsvPath -ErrorAction Stop
      $rows2 = $raw2 | ConvertFrom-Csv
      foreach ($r in $rows2) {
        $sid = ("" + $r.sector_id).Trim()
        if (-not $sid) { continue }
        $sym = ("" + $r.symbol).Trim().ToUpperInvariant()
        if (-not $sym) { continue }

        if (-not $sectorToSymbols.ContainsKey($sid)) {
          $sectorToSymbols[$sid] = New-Object System.Collections.Generic.List[string]
        }
        $sectorToSymbols[$sid].Add($sym)

        if (-not $symbolToSectorIds.ContainsKey($sym)) {
          $symbolToSectorIds[$sym] = New-Object System.Collections.Generic.List[string]
        }
        $symbolToSectorIds[$sym].Add($sid)
      }
    } else {
      LogLine ("SECTORS_SYMBOLS_CSV_MISSING path=" + $SectorsSymbolsCsvPath)
    }
  } catch {
    LogLine ("SECTORS_SYMBOLS_CSV_LOAD_ERR err=" + $_.Exception.Message)
  }

  foreach ($k in @($sectorToSymbols.Keys)) {
    $seen = New-Object System.Collections.Generic.HashSet[string]
    $list = New-Object System.Collections.Generic.List[string]
    foreach ($s in $sectorToSymbols[$k]) { if ($seen.Add($s)) { $list.Add($s) } }
    $sectorToSymbols[$k] = $list
  }

  foreach ($k in @($symbolToSectorIds.Keys)) {
    $seen = New-Object System.Collections.Generic.HashSet[string]
    $list = New-Object System.Collections.Generic.List[string]
    foreach ($s in $symbolToSectorIds[$k]) { if ($seen.Add($s)) { $list.Add($s) } }
    $symbolToSectorIds[$k] = $list
  }

  return @{ sectors=$sectors; sectorMap=$sectorMap; sectorToSymbols=$sectorToSymbols; symbolToSectorIds=$symbolToSectorIds }
}

$SectorsData = Load-SectorsData
$Sectors = $SectorsData.sectors
$SectorMap = $SectorsData.sectorMap
$SectorToSymbols = $SectorsData.sectorToSymbols
$SymbolToSectorIds = $SectorsData.symbolToSectorIds
Write-Host "[mmf-api-lite-tcp] sectors loaded=$($Sectors.Count) sectors_symbols=$($SectorToSymbols.Keys.Count)"
LogLine ("SECTORS_LOADED sectors=" + $Sectors.Count + " sector_to_symbols=" + $SectorToSymbols.Keys.Count)

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
    [ref]$hRef,
    [ref]$pRef,
    [ref]$openedNameRef
  )

  if ($hRef.Value -and ($hRef.Value -ne [IntPtr]::Zero) -and $pRef.Value -and ($pRef.Value -ne [IntPtr]::Zero)) {
    return
  }

  $cands = @($MmfName, "Global\$MmfName", "Local\$MmfName")
  $mapBytes = [UIntPtr]::op_Explicit([uint64]($RecordBytes * $RecordCount))

  foreach ($n in $cands) {
    $h = [WinMmf]::OpenFileMapping([WinMmf]::FILE_MAP_READ, $false, $n)
    if ($h -eq [IntPtr]::Zero) { continue }

    $p = [WinMmf]::MapViewOfFile($h, [WinMmf]::FILE_MAP_READ, 0, 0, $mapBytes)
    if ($p -eq [IntPtr]::Zero) {
      [void][WinMmf]::CloseHandle($h)
      continue
    }

    $hRef.Value = $h
    $pRef.Value = $p
    $openedNameRef.Value = $n
    Write-Host "[mmf-api-lite-tcp] MMF opened name='$n' at=$(NowIso)"
    return
  }
}

function Read-MmfPrice {
  param(
    [IntPtr]$BasePtr,
    [string]$Symbol
  )

  if ($BasePtr -eq [IntPtr]::Zero) { return $null }

  $sym = $Symbol
  if ($null -eq $sym) { $sym = '' }
  $sym = $sym.Trim().ToUpperInvariant()
  if (-not $sym) { return $null }

  $best = $null

  for ($i = 0; $i -lt $RecordCount; $i++) {
    $off = $i * $RecordBytes

    $writing = [WinMmf]::ReadInt32($BasePtr, $off + 40)
    if ($writing -eq 1) { continue }

    $bytes = [WinMmf]::ReadBytes($BasePtr, $off + 44, 16)
    $s = ([System.Text.Encoding]::ASCII.GetString($bytes)).Trim([char]0).Trim()
    if (-not $s) { continue }
    $s = $s.ToUpperInvariant()
    if ($s -ne $sym) { continue }

    $hb = [WinMmf]::ReadInt32($BasePtr, $off + 36)
    $ts = [WinMmf]::ReadInt64($BasePtr, $off + 24)
    $bid = [WinMmf]::ReadDouble($BasePtr, $off + 0)
    $ask = [WinMmf]::ReadDouble($BasePtr, $off + 8)

    $price = if ($bid -gt 0) { $bid } elseif ($ask -gt 0) { $ask } else { 0 }
    if ($price -le 0) { continue }

    if ($null -eq $best -or $hb -gt $best.hb -or ($hb -eq $best.hb -and $ts -gt $best.ts)) {
      $best = [ordered]@{ symbol = $s; priceBRL = $price; hb = $hb; ts = $ts }
    }
  }

  return $best
}

function Write-HttpJson {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$Status,
    [string]$Body
  )

  $b = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $statusText = switch ($Status) {
    200 { 'OK' }
    404 { 'Not Found' }
    503 { 'Service Unavailable' }
    500 { 'Internal Server Error' }
    default { 'OK' }
  }

  $hdr = "HTTP/1.1 $Status $statusText\r\n" +
         "Content-Type: application/json\r\n" +
         "Content-Length: $($b.Length)\r\n" +
         "Connection: close\r\n" +
         "\r\n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($hdr)

  $Stream.Write($hb, 0, $hb.Length)
  $Stream.Write($b, 0, $b.Length)
}

function Compute-WsAccept([string]$secKey) {
  $guid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
  $sha1 = [System.Security.Cryptography.SHA1]::Create()
  $bytes = [System.Text.Encoding]::ASCII.GetBytes(($secKey + $guid))
  $hash = $sha1.ComputeHash($bytes)
  return [Convert]::ToBase64String($hash)
}

function Send-WsTextFrame {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [string]$Text
  )

  $payload = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $len = $payload.Length

  $ms = New-Object System.IO.MemoryStream
  $ms.WriteByte(0x81) | Out-Null # FIN + text

  if ($len -le 125) {
    $ms.WriteByte([byte]$len) | Out-Null
  } elseif ($len -le 65535) {
    $ms.WriteByte(126) | Out-Null
    $ms.WriteByte([byte](($len -shr 8) -band 0xFF)) | Out-Null
    $ms.WriteByte([byte]($len -band 0xFF)) | Out-Null
  } else {
    $ms.WriteByte(127) | Out-Null
    $l64 = [uint64]$len
    for ($i = 7; $i -ge 0; $i--) {
      $ms.WriteByte([byte](($l64 -shr (8*$i)) -band 0xFF)) | Out-Null
    }
  }

  $ms.Write($payload, 0, $payload.Length) | Out-Null
  $frame = $ms.ToArray()
  $Stream.Write($frame, 0, $frame.Length)
}

$mmfHandle = [IntPtr]::Zero
$mmfPtr = [IntPtr]::Zero
$openedName = $null

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($HostIp), $Port)
$listener.ExclusiveAddressUse = $false
try {
  $listener.Server.SetSocketOption(
    [System.Net.Sockets.SocketOptionLevel]::Socket,
    [System.Net.Sockets.SocketOptionName]::ReuseAddress,
    $true
  )
} catch {
  # ignore
}

try {
  $listener.Start()
} catch {
  Write-Host "[mmf-api-lite-tcp] FAILED to bind ${HostIp}:$Port err=$($_.Exception.Message)"
  Start-Sleep -Seconds 5
  throw
}

Write-Host "[mmf-api-lite-tcp] pid=$PID listening http://${HostIp}:$Port at=$(NowIso)"
LogLine "START pid=$PID host=${HostIp} port=$Port"

try {
  while ($true) {
    $client = $null
    try {
      $client = $listener.AcceptTcpClient()
      $client.NoDelay = $true

      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)

      # Read request line + headers
      $reqLine = $reader.ReadLine()
      if (-not $reqLine) {
        try { $client.Close() } catch {}
        continue
      }

      LogLine ("REQ_LINE '" + $reqLine + "'")

      $parts = $reqLine.Split(' ')
      if ($parts.Length -lt 2) {
        LogLine "BAD_REQUEST_LINE '$reqLine'"
        try { $client.Close() } catch {}
        continue
      }

    $headers = @{}
    while ($true) {
      $line = $reader.ReadLine()
      if ($null -eq $line -or $line -eq '') { break }
      $i = $line.IndexOf(':')
      if ($i -gt 0) {
        $k = $line.Substring(0, $i).Trim().ToLowerInvariant()
        $v = $line.Substring($i + 1).Trim()
        $headers[$k] = $v
      }
    }

    $method = $parts[0]
    $target = $parts[1]

    # Parse path + query
    $path = $target
    $query = ''
    $qi = $target.IndexOf('?')
    if ($qi -ge 0) {
      $path = $target.Substring(0, $qi)
      $query = $target.Substring($qi + 1)
    }

    LogLine ("REQ method=" + $method + " path=" + $path)

    $bodyText = ''
    if ($method -eq 'POST' -or $method -eq 'PUT') {
      $cl = 0
      if ($headers.ContainsKey('content-length')) {
        try { $cl = [int]$headers['content-length'] } catch { $cl = 0 }
      }
      if ($cl -gt 0 -and $cl -lt 1048576) {
        $charBuf = New-Object char[] $cl
        $readChars = 0
        while ($readChars -lt $cl) {
          $n = $reader.Read($charBuf, $readChars, $cl - $readChars)
          if ($n -le 0) { break }
          $readChars += $n
        }
        if ($readChars -gt 0) {
          $bodyText = -join ($charBuf[0..($readChars-1)])
        }
      }
    }

    # Minimal MMF open per connection (keep simple)
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WinMmfConn {
  public const uint FILE_MAP_READ = 0x0004;
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr OpenFileMapping(uint dwDesiredAccess, bool bInheritHandle, string lpName);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr MapViewOfFile(IntPtr hFileMappingObject, uint dwDesiredAccess, uint dwFileOffsetHigh, uint dwFileOffsetLow, UIntPtr dwNumberOfBytesToMap);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);
}
"@ -ErrorAction SilentlyContinue

    function TryOpenPtr([string]$name) {
        $cands = @($name, "Global\$name", "Local\$name")
        foreach ($cand in $cands) {
          $h = [WinMmfConn]::OpenFileMapping([WinMmfConn]::FILE_MAP_READ, $false, $cand)
          if ($h -eq [IntPtr]::Zero) {
            $gle = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            LogLine ("MMF_OPEN_FAIL name='" + $cand + "' gle=" + $gle)
            continue
          }
          $mapBytes = [UIntPtr]::op_Explicit([uint64]($RecordBytes * $RecordCount))
          $p = [WinMmfConn]::MapViewOfFile($h, [WinMmfConn]::FILE_MAP_READ, 0, 0, $mapBytes)
          if ($p -eq [IntPtr]::Zero) {
            $gle2 = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            LogLine ("MMF_MAP_FAIL name='" + $cand + "' gle=" + $gle2)
            [void][WinMmfConn]::CloseHandle($h)
            continue
          }
          LogLine ("MMF_OPEN_OK name='" + $cand + "'")
          return @{ h=$h; p=$p }
        }
        return @{ h=[IntPtr]::Zero; p=[IntPtr]::Zero }
      }

    function ReadDouble([IntPtr]$ptr, [int]$off) {
        $bits = [System.Runtime.InteropServices.Marshal]::ReadInt64($ptr, $off)
        return [BitConverter]::Int64BitsToDouble($bits)
      }

    function ReadInt32([IntPtr]$ptr, [int]$off) {
        return [System.Runtime.InteropServices.Marshal]::ReadInt32($ptr, $off)
      }

    function ReadInt64([IntPtr]$ptr, [int]$off) {
        return [System.Runtime.InteropServices.Marshal]::ReadInt64($ptr, $off)
      }

    function ReadBytes([IntPtr]$ptr, [int]$off, [int]$n) {
        $buf = New-Object byte[] $n
        [System.Runtime.InteropServices.Marshal]::Copy([IntPtr]::Add($ptr, $off), $buf, 0, $n)
        return $buf
      }

    function ReadPrice([IntPtr]$basePtr, [string]$symbol) {
        if ($basePtr -eq [IntPtr]::Zero) { return $null }
        $sym = $symbol
        if ($null -eq $sym) { $sym = '' }
        $sym = $sym.Trim().ToUpperInvariant()
        if (-not $sym) { return $null }

        function SlotForSymbol([string]$s) {
          $u = $s
          if ($null -eq $u) { $u = '' }
          $u = $u.Trim().ToUpperInvariant()
          if (-not $u) { return 0 }
          [uint64]$h = 2166136261
          [uint64]$prime = 16777619
          [uint64]$mod32 = 4294967296 # 2^32
          for ($j = 0; $j -lt $u.Length; $j++) {
            $c = [uint64][int][char]$u[$j]
            $h = ($h -bxor $c)
            # keep as uint32 (mod 2^32) to match EA's uint arithmetic
            $h = [uint64](($h * $prime) % $mod32)
          }
          # EA v5.20: (h % (RECORD_COUNT - 1)) + 1
          $modBase = [Math]::Max(1, ($RecordCount - 1))
          return ([int](($h % [uint64]$modBase) + 1))
        }

        function ReadPriceAtSlot([int]$slot) {
          if ($slot -lt 0 -or $slot -ge $RecordCount) { return $null }
          $off = $slot * $RecordBytes
          $writing = ReadInt32 $basePtr ($off + 40)
          if ($writing -eq 1) { return $null }

          $bytes = ReadBytes $basePtr ($off + 44) 16
          $s2 = ([System.Text.Encoding]::ASCII.GetString($bytes)).Trim([char]0).Trim()
          if (-not $s2) { return $null }
          $s2 = $s2.ToUpperInvariant()
          if ($s2 -ne $sym) { return $null }

          $hb = ReadInt32 $basePtr ($off + 36)
          $ts = ReadInt64 $basePtr ($off + 24)
          $bid = ReadDouble $basePtr ($off + 0)
          $ask = ReadDouble $basePtr ($off + 8)
          $price = if ($bid -gt 0) { $bid } elseif ($ask -gt 0) { $ask } else { 0 }
          if ($price -le 0) { return $null }
          return @{ symbol=$s2; priceBRL=$price; hb=$hb; ts=$ts }
        }

        $slot1 = 0
        $slot2 = SlotForSymbol $sym

        # Try focus slot first, then hashed slot.
        $r1 = ReadPriceAtSlot $slot1
        if ($r1 -ne $null) { return $r1 }
        if ($slot2 -ne $slot1) {
          $r2 = ReadPriceAtSlot $slot2
          if ($r2 -ne $null) { return $r2 }
        }

        return $null
      }

    function WriteHttpJson([int]$status, [string]$body) {
        try {
        $b = [System.Text.Encoding]::UTF8.GetBytes($body)
        LogLine ("RESP_HTTP status=" + $status + " bytes=" + $b.Length)
        $statusText = switch ($status) {
          200 { 'OK' }
          404 { 'Not Found' }
          503 { 'Service Unavailable' }
          500 { 'Internal Server Error' }
          default { 'OK' }
        }
        $hdr = "HTTP/1.1 $status $statusText`r`n" +
               "Content-Type: application/json`r`n" +
               "Content-Length: $($b.Length)`r`n" +
               "Connection: close`r`n`r`n"
        $hb = [System.Text.Encoding]::ASCII.GetBytes($hdr)
        $stream.Write($hb, 0, $hb.Length)
        $stream.Write($b, 0, $b.Length)
        try { $stream.Flush() } catch {}
        } catch {
          LogLine ("WRITE_HTTP_ERR err=" + $_.Exception.Message)
          throw
        }
      }

    function WsAccept([string]$secKey) {
        $guid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
        $sha1 = [System.Security.Cryptography.SHA1]::Create()
        $bytes = [System.Text.Encoding]::ASCII.GetBytes(($secKey + $guid))
        $hash = $sha1.ComputeHash($bytes)
        return [Convert]::ToBase64String($hash)
      }

    function SendWsText([string]$text) {
        $payload = [System.Text.Encoding]::UTF8.GetBytes($text)
        $len = $payload.Length
        $ms = New-Object System.IO.MemoryStream
        $ms.WriteByte(0x81) | Out-Null
        if ($len -le 125) {
          $ms.WriteByte([byte]$len) | Out-Null
        } elseif ($len -le 65535) {
          $ms.WriteByte(126) | Out-Null
          $ms.WriteByte([byte](($len -shr 8) -band 0xFF)) | Out-Null
          $ms.WriteByte([byte]($len -band 0xFF)) | Out-Null
        } else {
          $ms.WriteByte(127) | Out-Null
          $l64 = [uint64]$len
          for ($i = 7; $i -ge 0; $i--) { $ms.WriteByte([byte](($l64 -shr (8*$i)) -band 0xFF)) | Out-Null }
        }
        $ms.Write($payload, 0, $payload.Length) | Out-Null
        $frame = $ms.ToArray()
        $stream.Write($frame, 0, $frame.Length)
      }

    try {
        if ($path -eq '/health') {
          LogLine "RESP /health"
          WriteHttpJson 200 ('{"status":"ok","redis":"unconfigured","redisLatencyMs":0}')
          $client.Close();
          continue
        }

        if ($path -eq '/api/v1/market/sectors' -and $method -eq 'GET') {
          $mtimeMs = 0
          try {
            if (Test-Path -LiteralPath $SectorsCsvPath) {
              $mtimeMs = [int64]([DateTimeOffset](Get-Item -LiteralPath $SectorsCsvPath).LastWriteTimeUtc).ToUnixTimeMilliseconds()
            }
          } catch {}
          $resp = @{ file = $SectorsCsvPath; mtimeMs = $mtimeMs; sectors = $Sectors }
          WriteHttpJson 200 ($resp | ConvertTo-Json -Compress -Depth 6)
          $client.Close();
          continue
        }

        if ($path -like '/api/v1/market/sectors/*/symbols' -and $method -eq 'GET') {
          $sectorId = ($path.Split('/')[5])
          $sectorId = ("" + $sectorId).Trim()
          $list = @()
          if ($SectorToSymbols.ContainsKey($sectorId)) {
            $list = @($SectorToSymbols[$sectorId])
          }

          $limit = 5000
          if ($query) {
            foreach ($kv in $query.Split('&')) {
              $ii = $kv.IndexOf('=')
              if ($ii -gt 0) {
                $k = $kv.Substring(0,$ii)
                $v = $kv.Substring($ii+1)
                if ($k -eq 'limit') {
                  try { $limit = [Math]::Max(1, [Math]::Min(20000, [int]$v)) } catch { }
                }
              }
            }
          }

          $meta = $null
          if ($SectorMap.ContainsKey($sectorId)) { $meta = $SectorMap[$sectorId] }
          $resp = @{ sectorId = $sectorId; sector = $meta; total = $list.Count; symbols = @($list | Select-Object -First $limit) }
          WriteHttpJson 200 ($resp | ConvertTo-Json -Compress -Depth 6)
          $client.Close();
          continue
        }

        if ($path -eq '/api/v1/auth/login' -and $method -eq 'POST') {
          $resp = @{ userId = 'user-1'; accountId = 'acc-1'; accessToken = 'dev-token' }
          WriteHttpJson 200 ($resp | ConvertTo-Json -Compress)
          $client.Close();
          continue
        }

        if ($path -eq '/api/v1/auth/register' -and $method -eq 'POST') {
          $resp = @{ userId = 'user-1'; accountId = 'acc-1'; accessToken = 'dev-token' }
          WriteHttpJson 200 ($resp | ConvertTo-Json -Compress)
          $client.Close();
          continue
        }

        if ($path -eq '/api/v1/stocks' -and $method -eq 'GET') {
          $limit = 5000
          if ($query) {
            foreach ($kv in $query.Split('&')) {
              $ii = $kv.IndexOf('=')
              if ($ii -gt 0) {
                $k = $kv.Substring(0,$ii)
                $v = $kv.Substring($ii+1)
                if ($k -eq 'limit') {
                  try { $limit = [Math]::Max(1, [Math]::Min(20000, [int]$v)) } catch { }
                }
              }
            }
          }
          $syms = @($AllSymbols | Select-Object -First $limit)
          $resp = @{ total = $AllSymbols.Count; symbols = $syms }
          WriteHttpJson 200 ($resp | ConvertTo-Json -Compress -Depth 4)
          $client.Close();
          continue
        }

        if ($path -eq '/api/v1/market/groups' -and $method -eq 'GET') {
          $groups = @()
          foreach ($k in ($GroupToSymbols.Keys | Sort-Object)) {
            $groups += @{ group = $k; symbols = @($GroupToSymbols[$k]).Count }
          }
          $mtimeMs = 0
          try {
            if (Test-Path -LiteralPath $GrupoTxtPath) {
              $mtimeMs = [int64]([DateTimeOffset](Get-Item -LiteralPath $GrupoTxtPath).LastWriteTimeUtc).ToUnixTimeMilliseconds()
            }
          } catch {}
          $resp = @{ file = $GrupoTxtPath; mtimeMs = $mtimeMs; groups = $groups }
          WriteHttpJson 200 ($resp | ConvertTo-Json -Compress -Depth 6)
          $client.Close();
          continue
        }

        if ($path -like '/api/v1/market/groups/*/symbols' -and $method -eq 'GET') {
          $grp = ($path.Split('/')[5])
          $grp = ("" + $grp).Trim().ToUpperInvariant()
          $list = @()
          if ($GroupToSymbols.ContainsKey($grp)) {
            $list = @($GroupToSymbols[$grp])
          }
          $limit = 5000
          if ($query) {
            foreach ($kv in $query.Split('&')) {
              $ii = $kv.IndexOf('=')
              if ($ii -gt 0) {
                $k = $kv.Substring(0,$ii)
                $v = $kv.Substring($ii+1)
                if ($k -eq 'limit') {
                  try { $limit = [Math]::Max(1, [Math]::Min(20000, [int]$v)) } catch { }
                }
              }
            }
          }
          $resp = @{ group = $grp; total = $list.Count; symbols = @($list | Select-Object -First $limit) }
          WriteHttpJson 200 ($resp | ConvertTo-Json -Compress -Depth 4)
          $client.Close();
          continue
        }

        if ($path -eq '/api/v1/market/symbols/check' -and $method -eq 'GET') {
          $symbols = @()
          if ($query) {
            foreach ($kv in $query.Split('&')) {
              $ii = $kv.IndexOf('=')
              if ($ii -gt 0) {
                $k = $kv.Substring(0,$ii)
                $v = $kv.Substring($ii+1)
                if ($k -eq 'symbols') {
                  $symbols = [Uri]::UnescapeDataString($v).Split(',')
                }
              }
            }
          }

          $items = @()
          foreach ($s in $symbols) {
            $sym2 = ("" + $s).Trim().ToUpperInvariant()
            if (-not $sym2) { continue }
            $ptr = TryOpenPtr $MmfName
            $h = $ptr.h
            $p = $ptr.p
            $price = ReadPrice $p $sym2
            if ($p -ne [IntPtr]::Zero) { [void][WinMmfConn]::UnmapViewOfFile($p) }
            if ($h -ne [IntPtr]::Zero) { [void][WinMmfConn]::CloseHandle($h) }
            if ($price -ne $null) {
              $items += @{ requested=$sym2; symbol=$price.symbol; status='ok'; priceBRL=[double]$price.priceBRL }
            } else {
              $items += @{ requested=$sym2; symbol=$sym2; status='no_data'; message='no real-time price (MMF)' }
            }
          }
          WriteHttpJson 200 ((@{ items = $items } | ConvertTo-Json -Compress))
          $client.Close();
          continue
        }

        if ($path -like '/api/v1/accounts/*/balance' -and $method -eq 'GET') {
          $acc = ($path.Split('/')[4])
          WriteHttpJson 200 ((@{ accountId=$acc; balance=100000 } | ConvertTo-Json -Compress))
          $client.Close();
          continue
        }

        if ($path -like '/api/v1/accounts/*/balance-at' -and $method -eq 'GET') {
          $acc = ($path.Split('/')[4])
          WriteHttpJson 200 ((@{ accountId=$acc; at=(NowIso); balanceBrl=100000 } | ConvertTo-Json -Compress))
          $client.Close();
          continue
        }

        if ($path -like '/api/v1/accounts/*/balance-series' -and $method -eq 'GET') {
          $acc = ($path.Split('/')[4])
          $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
          $pts = @(
            @{ time = ($now - 60); balanceBrl = 100000 },
            @{ time = $now; balanceBrl = 100000 }
          )
          WriteHttpJson 200 ((@{ accountId=$acc; points=$pts } | ConvertTo-Json -Compress))
          $client.Close();
          continue
        }

        if ($path -eq '/api/v1/fx/quote' -and $method -eq 'GET') {
          WriteHttpJson 200 ((@{ currency='USD'; pair='USD/BRL'; rateBRL=5.0 } | ConvertTo-Json -Compress))
          $client.Close();
          continue
        }

        if ($path -eq '/api/v1/btc/quote' -and $method -eq 'GET') {
          WriteHttpJson 200 ((@{ symbol='BTCBRL'; priceBRL=100000 } | ConvertTo-Json -Compress))
          $client.Close();
          continue
        }

        if ($path -like '/api/v1/stocks/*/quote') {
          $parts2 = $path.Split('/')
          $symbol = $parts2[4]

          $ptr = TryOpenPtr $MmfName
          $h = $ptr.h
          $p = $ptr.p

          $price = ReadPrice $p $symbol
          if ($price -eq $null) {
            WriteHttpJson 503 ((@{ message='stocks quote failed: no real-time price yet for symbol (MMF)'; symbol=$symbol } | ConvertTo-Json -Compress))
          } else {
            WriteHttpJson 200 ((@{ symbol=$price.symbol; priceBRL=[double]$price.priceBRL } | ConvertTo-Json -Compress))
          }

          if ($p -ne [IntPtr]::Zero) { [void][WinMmfConn]::UnmapViewOfFile($p) }
          if ($h -ne [IntPtr]::Zero) { [void][WinMmfConn]::CloseHandle($h) }

          $client.Close();
          continue
        }

        if ($path -eq '/ws/stocks') {
          $upgrade = ''
          if ($headers.ContainsKey('upgrade')) { $upgrade = [string]$headers['upgrade'] }
          if ($null -eq $upgrade) { $upgrade = '' }
          $upgrade = $upgrade.ToLowerInvariant()
          if ($upgrade -ne 'websocket') {
            WriteHttpJson 400 ('{"message":"not a websocket"}')
            $client.Close();
            return
          }

          $secKey = $headers['sec-websocket-key']
          if (-not $secKey) {
            WriteHttpJson 400 ('{"message":"missing sec-websocket-key"}')
            $client.Close();
            return
          }

          $accept = WsAccept $secKey
          $resp = "HTTP/1.1 101 Switching Protocols`r`n" +
                  "Upgrade: websocket`r`n" +
                  "Connection: Upgrade`r`n" +
                  "Sec-WebSocket-Accept: $accept`r`n`r`n"
          $rb = [System.Text.Encoding]::ASCII.GetBytes($resp)
          $stream.Write($rb, 0, $rb.Length)

          # parse symbol from query
          $sym = 'WINJ26'
          $isFeedMode = $false
          if ($query) {
            foreach ($kv in $query.Split('&')) {
              $ii = $kv.IndexOf('=')
              if ($ii -gt 0) {
                $k = $kv.Substring(0,$ii)
                $v = $kv.Substring($ii+1)
                if ($k -eq 'symbol') { $sym = [Uri]::UnescapeDataString($v) }
                if ($k -eq 'mode' -and $v -eq 'feed') { $isFeedMode = $true }
              }
            }
          }
          $sym = $sym.Trim().ToUpperInvariant()

          # init
          $ptr = TryOpenPtr $MmfName
          $h = $ptr.h
          $p = $ptr.p
          $price = ReadPrice $p $sym
          $init = if ($price -eq $null) {
            @{ type='init'; ts=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()); lastPrices=@{} }
          } else {
            @{ type='init'; ts=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()); lastPrices=@{ ($price.symbol) = [double]$price.priceBRL } }
          }
          SendWsText ($init | ConvertTo-Json -Compress)

          # In feed mode (Terminal layout), avoid keeping a long-lived connection because
          # this server is single-threaded and would block all HTTP requests (login, etc.).
          # Trading page uses explicit ?symbol=... and can receive continuous ticks.
          if ($isFeedMode -or -not $query -or ($query -and $query -notmatch 'symbol=')) {
            if ($p -ne [IntPtr]::Zero) { [void][WinMmfConn]::UnmapViewOfFile($p) }
            if ($h -ne [IntPtr]::Zero) { [void][WinMmfConn]::CloseHandle($h) }
            try { $client.Close() } catch {}
            continue
          }

          # Limited ticks: this server is single-threaded.
          # Keep WS short-lived so HTTP endpoints (login/register/etc) don't hang.
          $lastHb = -1
          $maxTicks = 20
          $sent = 0
          try {
            while ($sent -lt $maxTicks) {
              Start-Sleep -Milliseconds $TickIntervalMs
              $price2 = ReadPrice $p $sym
              if ($price2 -eq $null) { continue }
              if ($price2.hb -eq $lastHb) { continue }
              $lastHb = $price2.hb
              $tick = @{ type='tick'; symbol=$price2.symbol; priceBRL=[double]$price2.priceBRL; ts=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) }
              SendWsText ($tick | ConvertTo-Json -Compress)
              $sent++
            }
          } catch {
            LogLine ("WS_LOOP_END err=" + $_.Exception.Message)
          }

          if ($p -ne [IntPtr]::Zero) { [void][WinMmfConn]::UnmapViewOfFile($p) }
          if ($h -ne [IntPtr]::Zero) { [void][WinMmfConn]::CloseHandle($h) }
          try { $client.Close() } catch {}
          continue
        }

        WriteHttpJson 404 ('{"message":"not found"}')
        $client.Close();
        continue
    } catch {
      LogLine ("INTERNAL_ERR path=" + $path + " err=" + $_.Exception.Message)
      try { WriteHttpJson 500 ((@{ message='internal error'; err=$_.Exception.Message } | ConvertTo-Json -Compress)) } catch {}
      try { $client.Close() } catch {}
      continue
    }
  } catch {
    try {
      Write-Host "[mmf-api-lite-tcp] connection error err=$($_.Exception.Message)"
    } catch {}
    LogLine ("CONNECTION_ERR err=" + $_.Exception.Message)
    try { if ($client) { $client.Close() } } catch {}
    continue
  }
}
}
catch {
  Write-Host "[mmf-api-lite-tcp] FATAL err=$($_.Exception.Message)"
  Start-Sleep -Seconds 5
  throw
} finally {
  try { $listener.Stop() } catch {}
}
