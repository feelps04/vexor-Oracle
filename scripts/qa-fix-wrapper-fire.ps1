$ErrorActionPreference = 'Stop'

$ComposeFile = "C:\Users\Bete\transaction-auth-engine\docker-compose.yml"

function Get-MetricValue([string]$metrics, [string]$name) {
  $m = [regex]::Match($metrics, "(?m)^" + [regex]::Escape($name) + "\s+([^\r\n]+)$")
  if (-not $m.Success) { return $null }
  return $m.Groups[1].Value.Trim()
}

function Get-MetricsWithRetry([int]$retries, [int]$sleepMs) {
  for ($i=0; $i -lt $retries; $i++) {
    try {
      return (Invoke-WebRequest -UseBasicParsing "http://localhost:9109/metrics" -TimeoutSec 3).Content
    } catch {
      Start-Sleep -Milliseconds $sleepMs
    }
  }
  throw "Unable to fetch /metrics after $retries retries"
}

Write-Host "--- [FIRE] SBE STRESS FIRE TEST ---"

Write-Host "--- [FIRE] Ensuring Kafka is unpaused"
try {
  & docker compose -f $ComposeFile unpause kafka | Out-Host
} catch {
}

$redisRunning = $false
try {
  $rid = (& docker compose -f $ComposeFile ps -q redis).Trim()
  if ($rid) { $redisRunning = $true }
} catch {
  $redisRunning = $false
}

Write-Host "--- [FIRE] 0) Snapshot baseline (Kafka UP)"
$m1 = Get-MetricsWithRetry 10 250
Start-Sleep -Seconds 2
$m2 = Get-MetricsWithRetry 10 250

$c1 = [uint64](Get-MetricValue $m1 "fix_wrapper_sbe_messages_decoded_total")
$c2 = [uint64](Get-MetricValue $m2 "fix_wrapper_sbe_messages_decoded_total")
$rate = [math]::Floor(($c2 - $c1) / 2)

$sat = Get-MetricValue $m2 "fix_wrapper_buffer_saturation_level"
$deg = Get-MetricValue $m2 "fix_wrapper_degraded"
$conn = Get-MetricValue $m2 "fix_wrapper_kafka_connected"

Write-Host ("decoded_rate_msg_per_s={0} sat={1} degraded={2} kafka_connected={3}" -f $rate,$sat,$deg,$conn)

Write-Host "--- [FIRE] 1) Pausing Kafka for 8s"

try {
  try {
    & docker compose -f $ComposeFile pause kafka | Out-Host
  } catch {
    & docker compose -f $ComposeFile pause kafka | Out-Null
  }

  for ($i=0; $i -lt 8; $i++) {
    $m = Get-MetricsWithRetry 5 200
    $sat = Get-MetricValue $m "fix_wrapper_buffer_saturation_level"
    $used = Get-MetricValue $m "fix_wrapper_buffer_used_bytes"
    $deg = Get-MetricValue $m "fix_wrapper_degraded"
    $conn = Get-MetricValue $m "fix_wrapper_kafka_connected"
    $drop = Get-MetricValue $m "fix_wrapper_messages_dropped_total"
    $jit = Get-MetricValue $m "fix_wrapper_discard_jitter_ms_last"

    $redis = "<skipped>"
    if ($redisRunning) {
      try {
        $redis = (& docker compose -f $ComposeFile exec -T redis redis-cli GET system:status:degraded)
        $redis = ($redis -replace "\r", "" -replace "\n", "")
        if (-not $redis) { $redis = "<nil>" }
      } catch {
        $redis = "<error>"
      }
    }

    Write-Host ("t={0}s sat={1} used_bytes={2} kafka_connected={3} degraded={4} dropped={5} discard_jitter_ms_last={6} redis={7}" -f $i,$sat,$used,$conn,$deg,$drop,$jit,$redis)
    Start-Sleep -Seconds 1
  }
} finally {
  Write-Host "--- [FIRE] 2) Unpausing Kafka"
  try {
    & docker compose -f $ComposeFile unpause kafka | Out-Host
  } catch {
  }
}

Write-Host "--- [FIRE] 3) Snapshot after recovery"
Start-Sleep -Seconds 2
$m3 = Get-MetricsWithRetry 10 250
$sat3 = Get-MetricValue $m3 "fix_wrapper_buffer_saturation_level"
$deg3 = Get-MetricValue $m3 "fix_wrapper_degraded"
$conn3 = Get-MetricValue $m3 "fix_wrapper_kafka_connected"

Write-Host ("after sat={0} degraded={1} kafka_connected={2}" -f $sat3,$deg3,$conn3)
Write-Host "--- [FIRE] DONE ---"
