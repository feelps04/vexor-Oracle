$ErrorActionPreference = 'Stop'

Write-Host "--- [QA] FIX-WRAPPER CHAOS TEST ---"

Write-Host "--- [QA] 1) Validando SDK/linker/runtime (qa:fix-wrapper)"
& npm run -s qa:fix-wrapper

Write-Host "--- [QA] 2) Pausando Kafka por 2 segundos"
& docker compose -f .\docker-compose.yml pause kafka | Out-Host
Start-Sleep -Seconds 2

Write-Host "--- [QA] 3) Retomando Kafka"
& docker compose -f .\docker-compose.yml unpause kafka | Out-Host

Write-Host "--- [QA] 4) Verificando se fix-wrapper-cpp segue vivo"
$cid = (& docker compose -f .\docker-compose.yml ps -q fix-wrapper-cpp).Trim()
if (-not $cid) {
  throw "[QA] container do serviço fix-wrapper-cpp nao encontrado"
}
$state = (& docker inspect -f "{{.State.Status}}" $cid).Trim()
if ($state -ne 'running') {
  throw "[QA] fix-wrapper-cpp nao esta rodando (state=$state, cid=$cid)"
}
Write-Host "✅ [QA] fix-wrapper-cpp continua rodando"

Write-Host "--- [QA] CHAOS TEST FINALIZADO ---"
