param(
  [string]$MmfName = 'B3RAM',
  [int]$RecordBytes = 128,
  [int]$RecordCount = 8192
)

$ErrorActionPreference = 'Continue'

if (-not ([System.Management.Automation.PSTypeName]'WinMmfDiag').Type) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class WinMmfDiag {
  public const uint FILE_MAP_READ = 0x0004;

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr OpenFileMapping(uint dwDesiredAccess, bool bInheritHandle, string lpName);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr MapViewOfFile(IntPtr hFileMappingObject, uint dwDesiredAccess, uint dwFileOffsetHigh, uint dwFileOffsetLow, UIntPtr dwNumberOfBytesToMap);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);

  [DllImport("kernel32.dll")]
  public static extern uint GetLastError();
}
"@
}

$cands = @(
  $MmfName,
  "Global\$MmfName",
  "Local\$MmfName"
)

$mapBytes = [UIntPtr]::op_Explicit([uint64]($RecordBytes * $RecordCount))

foreach ($n in $cands) {
  $h = [WinMmfDiag]::OpenFileMapping([WinMmfDiag]::FILE_MAP_READ, $false, $n)
  if ($h -eq [IntPtr]::Zero) {
    $err = [WinMmfDiag]::GetLastError()
    Write-Host "OPEN_FAIL name='$n' gle=$err"
    continue
  }

  $p = [WinMmfDiag]::MapViewOfFile($h, [WinMmfDiag]::FILE_MAP_READ, 0, 0, $mapBytes)
  if ($p -eq [IntPtr]::Zero) {
    $err = [WinMmfDiag]::GetLastError()
    Write-Host "MAP_FAIL name='$n' gle=$err"
    [void][WinMmfDiag]::CloseHandle($h)
    continue
  }

  Write-Host "OPEN_OK name='$n' handle=$h ptr=$p"
  [void][WinMmfDiag]::UnmapViewOfFile($p)
  [void][WinMmfDiag]::CloseHandle($h)
}
