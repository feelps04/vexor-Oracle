param(
  [string]$MmfName = 'B3RAM'
)

$ErrorActionPreference = 'Continue'

$cands = @(
  $MmfName,
  "Global\$MmfName",
  "Local\$MmfName"
)

foreach ($n in $cands) {
  try {
    $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting($n)
    try {
      Write-Host "OPEN_OK name='$n'"
    } finally {
      try { $mmf.Dispose() } catch {}
    }
  } catch {
    Write-Host "OPEN_FAIL name='$n' err=$($_.Exception.Message)"
  }
}
