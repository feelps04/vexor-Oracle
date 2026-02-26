param(
  [Parameter(Mandatory = $true)][string]$InputCsv,
  [Parameter(Mandatory = $true)][string]$OutputDocx
)

if (!(Test-Path -LiteralPath $InputCsv)) {
  throw "InputCsv not found: $InputCsv"
}

$rows = Import-Csv -LiteralPath $InputCsv

$groups = @{}
foreach ($r in $rows) {
  $g = [string]$r.group
  $s = [string]$r.symbol
  if ([string]::IsNullOrWhiteSpace($g)) { $g = "(no_group)" }
  if ([string]::IsNullOrWhiteSpace($s)) { continue }

  if (-not $groups.ContainsKey($g)) {
    $groups[$g] = New-Object System.Collections.Generic.List[object]
  }
  $groups[$g].Add($r)
}

$word = $null
$doc = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $doc = $word.Documents.Add()

  $sel = $word.Selection
  $sel.Font.Name = "Calibri"
  $sel.Font.Size = 12

  $sel.TypeText("Genial / MetaTrader - Grupos (SYMBOL_PATH)")
  $sel.TypeParagraph()
  $sel.TypeText("Gerado em: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
  $sel.TypeParagraph()
  $sel.TypeParagraph()

  $sortedGroups = $groups.Keys | Sort-Object
  foreach ($g in $sortedGroups) {
    $sel.Font.Size = 14
    $sel.Font.Bold = 1
    $sel.TypeText($g)
    $sel.TypeParagraph()
    $sel.Font.Bold = 0
    $sel.Font.Size = 11

    $items = $groups[$g] | Sort-Object symbol
    foreach ($it in $items) {
      $sym = [string]$it.symbol
      $bid = [string]$it.bid
      $ask = [string]$it.ask
      $last = [string]$it.last
      $d1close = [string]$it.d1_close
      $ts = [string]$it.ts

      $line = "$sym"
      $extras = @()
      if ($last) { $extras += "last=$last" }
      if ($d1close) { $extras += "d1_close=$d1close" }
      if ($bid) { $extras += "bid=$bid" }
      if ($ask) { $extras += "ask=$ask" }
      if ($ts) { $extras += "ts=$ts" }

      if ($extras.Count -gt 0) {
        $line += " (" + ($extras -join ", ") + ")"
      }

      $sel.TypeText("- " + $line)
      $sel.TypeParagraph()
    }

    $sel.TypeParagraph()
  }

  $outDir = Split-Path -Parent $OutputDocx
  if ($outDir -and !(Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
  }

  $wdFormatDocumentDefault = 16
  $doc.SaveAs([ref]$OutputDocx, [ref]$wdFormatDocumentDefault)
}
finally {
  if ($doc) { $doc.Close($false) | Out-Null }
  if ($word) { $word.Quit() | Out-Null }
}
