# Testar fallback MT5
$mt5PricesPath = "C:\Users\Bete\Desktop\projeto-sentinel\mt5_prices.json"
$jsonStr = Get-Content $mt5PricesPath -Raw
$json = $jsonStr | ConvertFrom-Json

Write-Host "Testing MT5 fallback..."
Write-Host "Keys in JSON: $($json.PSObject.Properties.Count)"

$symbols = @('EURUSD', 'GBPUSD', 'USDJPY', 'VALE3')
foreach ($sym in $symbols) {
    $tick = $json.PSObject.Properties[$sym].Value
    if ($tick) {
        Write-Host "$sym : bid=$($tick.bid) ask=$($tick.ask)"
    } else {
        Write-Host "$sym : NOT FOUND"
    }
}
