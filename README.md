 # Transaction Auth Engine (TAE) - Enterprise Architecture Overview

 ## Executive Summary

 O **Transaction Auth Engine (TAE)** é uma plataforma orientada a eventos para **autorização e liquidação** de transações (FX, cripto e ações) com **processamento near real-time**, desenhada para operar sob carga com **consistência**, **idempotência** e **observabilidade**.

 - **Backbone**: Apache Kafka para integração assíncrona e isolamento entre domínios.
 - **Ledger operacional**: Redis como camada de saldo/execução com scripts Lua atômicos.
 - **Ledger espelho**: Postgres via serviço `shadow-mirror` (auditoria/consistência eventual).
 - **APIs externas**: FX (AwesomeAPI), bancos/feriados (BrasilAPI), cripto (Mercado Bitcoin), ações (Brapi) e/ou fontes alternativas.
 - **Observabilidade**: Prometheus + Grafana (dashboard provisionado) e Jaeger (traços distribuídos, preparado no docker-compose).

 ## Architecture (C4)

 ```mermaid
 C4Context
   title Transaction Auth Engine - System Context
   Person(client, "Cliente / Canal" , "Terminal, Swagger, integrações")
   System(tae, "Transaction Auth Engine", "Autorização e liquidação event-driven")

   System_Ext(ext_fx, "FX Providers", "AwesomeAPI / Yahoo / TwelveData")
   System_Ext(ext_kyb, "KYB / Calendário", "BrasilAPI")
   System_Ext(ext_crypto, "Crypto Exchange", "Mercado Bitcoin")
   System_Ext(ext_stocks, "Stocks Quotes", "Brapi / Market Data")
   System_Ext(ext_webhook, "Merchant Webhook", "Settlement callback")

   Rel(client, tae, "HTTP/WebSocket")
   Rel(tae, ext_fx, "Query FX rates")
   Rel(tae, ext_kyb, "Validate bank & holidays")
   Rel(tae, ext_crypto, "Query BTC quotes")
   Rel(tae, ext_stocks, "Query stock quotes")
   Rel(tae, ext_webhook, "Notify settlement")
 ```

 ```mermaid
 C4Container
   title Transaction Auth Engine - Containers

   Container(api, "API", "Node.js (Fastify)", "Ingress: REST, Auth/JWT, WebSocket, /metrics")
   Container(web, "Web UI", "React (Vite)", "Operação e demo")
   Container(producer, "Producer", "Node.js", "Gera transações sintéticas (batch + gzip)")
   Container(consumer, "Auth Engine Consumer", "Node.js", "Autoriza, idempotência, execução Redis")
   Container(notifier, "Notifier", "Node.js", "Dispara webhooks com retry/backoff")
   Container(shadow, "Shadow Mirror", "Node.js", "Espelha AUTHORIZED no Postgres")
   Container(btc, "BTC Price Producer", "Node.js", "Publica btc.ticker")
   Container(od, "Opportunity Detector", "Node.js", "MA 5m; publica opportunities.buy")
   Container(oj, "Opportunity Justifier", "Node.js", "Template/LLM; logging/insights")

   Container(b3, "B3 Connector", "Node.js (UDP multicast)", "Captura feed UDP e publica stocks.ticker")
   Container(fix, "FIX Wrapper (C++)", "OnixS FIX Engine + SBE + librdkafka", "Geração/decodificação SBE + publish Kafka + /metrics")
   Container(md, "Market Data", "Python (FastAPI)", "Integração MT5 (Windows), candles/quotes")

   ContainerDb(kafka, "Kafka", "cp-kafka", "Event backbone")
   ContainerDb(redis, "Redis", "redis", "Saldos, idempotência, exec Lua")
   ContainerDb(pg, "Postgres", "postgres", "Mirror/auditoria")

   Container(obs_prom, "Prometheus", "prom/prometheus", "Scrape metrics")
   Container(obs_graf, "Grafana", "grafana/grafana", "Dashboards")
   Container(obs_jaeger, "Jaeger", "jaeger all-in-one", "Tracing (OTLP)")

   Rel(web, api, "HTTP")
   Rel(api, kafka, "Produce: transactions.pending")
   Rel(producer, kafka, "Produce: transactions.pending")
   Rel(consumer, kafka, "Consume: transactions.pending")
   Rel(consumer, redis, "Atomic debit/credit + idempotência")
   Rel(consumer, kafka, "Produce: authorized/denied/dlq")
   Rel(notifier, kafka, "Consume: transactions.authorized")
   Rel(shadow, kafka, "Consume: transactions.authorized")
   Rel(shadow, pg, "Write mirror_* tables")
   Rel(btc, kafka, "Produce: btc.ticker")
   Rel(od, kafka, "Consume btc.ticker; produce opportunities.buy")
   Rel(oj, kafka, "Consume opportunities.buy")
   Rel(b3, kafka, "Produce: stocks.ticker")
   Rel(fix, kafka, "Produce: stocks.ticker + system.events")
   Rel(md, api, "Optional: API calls for market data")

   Rel(api, obs_prom, "Expose /metrics")
   Rel(fix, obs_prom, "Expose /metrics")
   Rel(obs_prom, obs_graf, "Datasource")
 ```

 ## Kafka Contracts (Topics)

 - **`transactions.pending`**
   - **Producer**: `api`, `producer`
   - **Consumer**: `consumer`
   - **Key**: `accountId` (garante ordenação por conta)

 - **`transactions.authorized` / `transactions.denied` / `transactions.dlq`**
   - **Producer**: `consumer`
   - **Consumers**: `notifier`, `shadow-mirror` (authorized)

 - **`btc.ticker`**
   - **Producer**: `btc-price-producer`
   - **Consumer**: `opportunity-detector`

 - **`opportunities.buy`**
   - **Producer**: `opportunity-detector`, `b3-connector` (alertas comportamentais), opcionalmente outros
   - **Consumer**: `opportunity-justifier`

 - **`stocks.ticker`**
   - **Producers**: `stock-price-producer` (simulado), `b3-connector` (UDP), `fix-wrapper-cpp` (SBE)

 - **`fx.ticker`**
   - **Producer**: `fx-price-producer`

 ## Critical Business Flows

 ```mermaid
 sequenceDiagram
   autonumber
   participant Client as Client/Terminal
   participant API as API (Fastify)
   participant Kafka as Kafka
   participant AE as Auth Engine (Consumer)
   participant Redis as Redis (Lua)
   participant Out as Notifier/Webhook

   Client->>API: POST /api/v1/transactions (idempotencyKey)
   API->>Kafka: Produce transactions.pending (key=accountId)
   API-->>Client: 201 Accepted + receipt

   Kafka-->>AE: Consume transactions.pending
   AE->>Redis: tryAcquire(idempotencyKey)
   AE->>Redis: debit BRL (Lua atomic)
   alt authorized
     AE->>Kafka: Produce transactions.authorized
     Kafka-->>Out: Consume authorized
     Out->>Client: webhook callback (retry/backoff)
   else denied
     AE->>Kafka: Produce transactions.denied
   end
 ```

 ## Observability & SRE Posture

 - **Prometheus**
   - Config: `prometheus.yml` (scrape do `api:3000/metrics`)
   - Recomendação: adicionar scrape jobs para os demais serviços que expõem métricas (ex: `fix-wrapper-cpp:9109`).

 - **Grafana**
   - Provisionamento: `grafana/provisioning/*`
   - Dashboard: `grafana/dashboards/sre-dashboard.json` (Throughput, Latency, counters de status)

 - **Jaeger**
   - Disponível no `docker-compose.yml` para instrumentação OTLP.
   - Status atual: base pronta; tracing efetivo depende de instrumentação nos serviços Node/C++.

 ### FIX Wrapper (C++) - Variáveis de Ambiente e Stress/Chaos

 O serviço `packages/fix-wrapper-cpp` expõe métricas em `:9109/metrics` e foi desenhado para operar em **degraded mode** sob indisponibilidade do Kafka (buffer + probe de recuperação).

 **Variáveis principais**:

 - **`KAFKA_BROKERS`**
   - Default: `kafka:9092`

 - **`FIX_WRAPPER_KAFKA_TOPIC`**
   - Default: `stocks.ticker`

 - **`FIX_WRAPPER_SYSTEM_TOPIC`**
   - Default: `system.events`

 - **`FIX_WRAPPER_BUFFER_BYTES`**
   - Default: `500MB`
   - Define o tamanho do ring buffer (drop-oldest quando satura).

 - **`FIX_WRAPPER_METRICS_PORT`**
   - Default: `9109`

 - **`FIX_WRAPPER_KAFKA_LOG_LEVEL`**
   - Default: `3`
   - Define `log_level` do `librdkafka` para reduzir ruído sob timeouts/outage.

 **Knobs de throughput (librdkafka)** (opcionais; só aplicam se setados):

 - **`FIX_WRAPPER_KAFKA_BATCH_SIZE`**
   - Mapeia para `batch.num.messages`.

 - **`FIX_WRAPPER_KAFKA_LINGER_MS`**
   - Mapeia para `linger.ms`.

 - **`FIX_WRAPPER_KAFKA_COMPRESSION`**
   - Mapeia para `compression.codec` (ex: `lz4`, `snappy`, `none`).

 - **`FIX_WRAPPER_KAFKA_ACKS`**
   - Mapeia para `acks` (ex: `0`, `1`, `all`).

 - **`FIX_WRAPPER_KAFKA_QUEUE_MAX_MSG`**
   - Mapeia para `queue.buffering.max.messages`.

 - **`FIX_WRAPPER_STRESS_TEST`**
   - Default: `false`
   - Quando `true`, habilita o gerador SBE sintético para benchmark/control-plane.

 - **`FIX_WRAPPER_STRESS_RATE_HZ`**
   - Default: `100000`
   - Define a taxa-alvo do stress test (mensagens/segundo). Para rates muito altos (ex. `2000000`), o pacing é controlado por timestamp (clock monotônico) para manter o benchmark “científico”.

 **Métricas críticas para auditoria sob stress** (Prometheus):

 - `kafka_connected` / `degraded`
 - `messages_published_total` / `messages_buffered_total` / `messages_replayed_total`
 - `messages_dropped_total` / `discard_jitter_ms_last`
 - `buffer_used_bytes` / `buffer_capacity_bytes`
 - `kafka_errors_total` / `kafka_delivery_latency_ms_last`

 ### Runbook - Stress test 2.000.000 msg/s (Windows/PowerShell + Docker Compose)

 1) Suba o stack:

 ```powershell
 docker compose up -d --build
 ```

 2) Rode o `fix-wrapper-cpp` em modo stress (2M/s):

 ```powershell
 docker compose run --rm `
   -e FIX_WRAPPER_STRESS_TEST=1 `
   -e FIX_WRAPPER_STRESS_RATE_HZ=2000000 `
   -e FIX_WRAPPER_KAFKA_LOG_LEVEL=3 `
   fix-wrapper-cpp
 ```

 Exemplo com tuning de throughput (valores iniciais sugeridos):

 ```powershell
 docker compose run --rm `
   -e FIX_WRAPPER_STRESS_TEST=1 `
   -e FIX_WRAPPER_STRESS_RATE_HZ=2000000 `
   -e FIX_WRAPPER_KAFKA_LOG_LEVEL=2 `
   -e FIX_WRAPPER_KAFKA_BATCH_SIZE=50000 `
   -e FIX_WRAPPER_KAFKA_LINGER_MS=5 `
   -e FIX_WRAPPER_KAFKA_COMPRESSION=lz4 `
   -e FIX_WRAPPER_KAFKA_ACKS=1 `
   -e FIX_WRAPPER_KAFKA_QUEUE_MAX_MSG=1000000 `
   fix-wrapper-cpp
 ```

 3) Monitoramento do “coração” via `/metrics` (sem `watch`):

 ```powershell
 while ($true) {
   $m = curl.exe -s http://localhost:9109/metrics
   $m | Select-String -Pattern "^(kafka_connected|degraded|buffer_used_bytes|buffer_capacity_bytes|messages_published_total|messages_buffered_total|messages_replayed_total|messages_dropped_total|discard_jitter_ms_last|kafka_errors_total)\\b"
   Start-Sleep -Seconds 1
   "---"
 }
 ```

 Interpretação rápida:

 - Se `kafka_connected=0` e `degraded=1`, o circuito entrou em proteção e está bufferizando/descartando conforme saturação.
 - Se `messages_dropped_total` cresce, o ring buffer saturou (drop-oldest) e houve perda controlada.
 - Em recovery, espere `kafka_connected` voltar para `1` e observar `messages_replayed_total` subindo gradualmente (replay limitado por tick).

 ## Non-Functional Requirements (Enterprise)

 - **Availability**
   - A arquitetura é orientada a eventos; o core de autorização depende de **Kafka + Redis**.
   - Componentes periféricos (ex: `shadow-mirror`, `opportunity-*`) podem degradar sem parar o fluxo financeiro.

 - **Consistency Model**
   - **Execução**: forte (atômica) no Redis via Lua.
   - **Eventos**: ao menos uma vez (Kafka), com mitigação por **idempotência**.
   - **Audit/Mirror**: eventual (Postgres) via `shadow-mirror`.

 - **Idempotency**
   - Chave `idempotencyKey` aplicada no `consumer` antes da execução.
   - Objetivo: eliminar “double debit/credit” sob reprocessamento, rebalance e retries.

 - **Performance (reference targets)**
   - **API**: métricas HTTP via `prom-client` (`http_requests_total`, histograma de latência).
   - **Producer**: batching (100 msgs) + delay (50ms) + gzip (Kafkajs) para throughput.
   - **Consumer**: paralelismo por partições (key = `accountId`).

 ## Capacity & Scaling Strategy

 - **Kafka partitioning**
   - `transactions.pending` com 6 partições (ver `docker-compose.yml` / `kafka-init`).
   - Escala horizontal do `consumer` até o limite de partições no mesmo consumer group.

 - **State sizing (Redis)**
   - Saldos e idempotência residem em Redis; recomenda-se:
     - Persistência (AOF/RDB) em ambiente produtivo.
     - Definição explícita de TTL para idempotência (já implementado) e rotinas de expurgo.

 ## Security & Controls (P.O / Governance)

 - **AuthN/AuthZ**
   - A API suporta JWT (`@fastify/jwt`) e cookies (`@fastify/cookie`).
   - Observação: no `docker-compose.yml`, `COOKIE_SECURE=false` é apropriado para dev/demo.

 - **Secrets management**
   - Não hardcodear chaves (ex: `JWT_SECRET`, `OPENAI_API_KEY`, tokens de dados de mercado).
   - Recomendação: usar secret store (Kubernetes secrets / Vault / AWS Secrets Manager) e rotação.

 - **PII / Data protection**
   - Payloads trafegam em Kafka em JSON. Para produção:
     - definir campos sensíveis e política de mascaramento em logs.
     - aplicar criptografia em trânsito (TLS) e em repouso (volumes/cluster).

 ## Operations & Runbooks

 - **Start stack (dev/demo)**
   - `docker compose up --build`
   - UIs:
     - API/Web: `http://localhost:3000`
     - Grafana: `http://localhost:3001` (admin/admin)
     - Prometheus: `http://localhost:9090`
     - Jaeger: `http://localhost:16686`

 - **Health checks**
   - API: `GET /health` e `GET /metrics`.
   - Kafka: healthcheck `kafka-broker-api-versions` no compose.

 - **Failure modes (expected behavior)**
   - **Kafka down**: serviços produtores/consumidores entram em erro/degradação; o `fix-wrapper-cpp` foi desenhado para tolerar indisponibilidade com buffer e probe de recuperação.
   - **Redis down**: o `consumer` não consegue executar o ledger (deve falhar e evitar “autorização sem débito”).
   - **APIs externas lentas**: `consumer` possui `LatencySensor` para backpressure (pausa controlada).

 ## Risks & Recommendations

 - **Prometheus scrape coverage**
   - Atualmente o `prometheus.yml` scrapeia apenas `api:3000/metrics`.
   - Recomendação: adicionar jobs para os serviços que expõem métricas, em especial:
     - `fix-wrapper-cpp:9109/metrics`

 - **Event schema governance**
   - Padronizar contrato (JSON Schema/Avro/Protobuf) para tópicos críticos (`transactions.*`).
   - Benefícios: compatibilidade evolutiva, validação e redução de incidentes.

 - **Tracing end-to-end**
   - Jaeger está provisionado; falta instrumentação consistente com propagation de `correlationId` via headers e Kafka message headers.

 ## Roadmap (Suggested)

 - **Schema Registry / contract tests** para tópicos financeiros.
 - **SLOs + alerting** no Grafana/Prometheus (latência, DLQ rate, consumer lag, Redis errors).
 - **Kubernetes deployment** com HPA baseado em lag/CPU, PDBs, e configurações HA (Kafka/Redis gerenciados).
 - **Security hardening**: TLS, authz por escopo, secrets manager.

 ## Monorepo Layout (Packages)

 - **`packages/api`**
   - Fastify REST + WebSocket + Swagger + JWT opcional + `/metrics` (prom-client)
   - Produz `transactions.pending`

 - **`packages/consumer`**
   - Consome `transactions.pending`
   - Idempotência em Redis (TTL)
   - Execução atômica (Lua) e backpressure (`LatencySensor`)
   - Produz `authorized/denied/dlq`

 - **`packages/notifier`**
   - Consome `transactions.authorized`
   - Webhook com retry/backoff

 - **`packages/producer`**
   - Gerador de carga transacional (batch + gzip)

 - **`packages/btc-price-producer` / `packages/opportunity-*`**
   - Pipeline analítico (ticks -> MA -> oportunidade -> justificativa)

 - **`packages/b3-connector`**
   - Captura UDP multicast e publica `stocks.ticker`
   - Emite alertas de comportamento (`opportunities.buy`) com heurística de spike

 - **`packages/fix-wrapper-cpp`**
   - Conector C++ para publish Kafka com buffers/telemetria
   - Exposição de métricas em `:9109/metrics` e tolerância a indisponibilidade do Kafka

 - **`services/market-data`**
   - FastAPI; integra com MetaTrader 5 (Windows) para resolução de símbolos e candles/quotes

 ## Notes on `node_modules`

 O diretório `node_modules/` é artefato de build/instalação e **não faz parte da arquitetura**. Para análise técnica e governança (SBOM, CVEs), recomenda-se automatizar com ferramentas (ex: `npm audit`, `osv-scanner`, Snyk), mas não versionar nem documentar seu conteúdo.

 ---

 # Legacy / Detailed Notes (Appendix)

 Motor de Autorizacao de Transacoes Transaction Auth Engine

Sistema opensource de liquidacao financeira em tempo real multimoeda cambio real validacao cadastral de bancos compra de BTC Mercado Bitcoin e compra de acoes Brapi Baseado em Apache Kafka Redis e APIs publicas AwesomeAPI BrasilAPI Mercado Bitcoin Brapi Inclui stream processing media movel 5 min sobre preco BTC e alerta de oportunidade de compra com justificativa template ou LLM

 Distributed Settlement Engine with RealTime FX Bank Validation

 Ingestion API recebe payload transacao internacional ordem BTC ou ordem de acao e enriquece com cambiovalidacao de banco ou cotacao de ativo
 Enrichment AwesomeAPI USDEUR BRL BrasilAPI KYB feriados Mercado Bitcoin preco BTCBRL Brapi cotacao acoes PETR4 VALE3 etc
 Consistency Kafka garante retries e DLQ topicos btcticker e opportunitiesbuy para stream de preco e alertas
 Execution Redis valida saldo BRL e debita de forma atomica Lua credita BTC balancebtcaccountId e acoes balancestockaccountIdsymbol
 Stream processing btcpriceproducer envia preco BTC a cada 1 s para btcticker opportunitydetector calcula media movel 5 min e publica em opportunitiesbuy quando preco lt 98 da media opportunityjustifier gera justificativa template ou LLM opcional
 Output Notifier envia comprovante para o endpoint de liquidacao Webhook Use Webhooksitehttpswebhooksite para ver os dados chegando em tempo real

 Fluxo Financeiro Real

mermaid
sequenceDiagram
 participant UI as Terminal Swagger
 participant API as API Fastify
 participant AwesomeAPI as AwesomeAPI Cambio
 participant BrasilAPI as BrasilAPI Bancos Feriados
 participant Kafka as Kafka
 participant Consumer as Auth Engine
 participant Redis as Redis Lua
 participant Webhook as Webhooksite Lojista

 UIAPI POST apiv1transactions ex 100 USD Banco 033
 APIAwesomeAPI GET USDBRL
 AwesomeAPIAPI Cotacao ex R 502
 APIBrasilAPI GET banksv1033
 BrasilAPIAPI Banco Santander validado
 APIKafka Produce transactionspending amountBRL rate bankName
 APIUI 201 Comprovante rate amountBRL bankName

 KafkaConsumer Consume pending
 ConsumerBrasilAPI Hoje e feriado
 alt Feriado
 ConsumerKafka PENDINGSETTLEMENT agendada
 else Dia util
 ConsumerRedis tryDebit Lua atomico
 RedisConsumer OK Negado
 ConsumerKafka authorized ou denied
 end
 KafkaWebhook Notifier POST comprovante

 Fluxo Comprar BTC 0001 BTC

mermaid
sequenceDiagram
 participant UI as Terminal
 participant API as API Fastify
 participant MB as Mercado Bitcoin API
 participant Kafka as Kafka
 participant Consumer as Auth Engine
 participant Redis as Redis
 participant Webhook as Webhooksite

 UIAPI POST apiv1ordersbtc 0001 BTC
 APIMB GET ticker btcbrl
 MBAPI preco BRL
 APIKafka transactionspending amountBRL amountBtc btcRate
 APIUI 201 Comprovante
 KafkaConsumer consume
 ConsumerRedis tryDebitBRL creditBtcsatoshis
 ConsumerKafka authorized
 KafkaWebhook Notifier POST comprovante

 Etapa Descricao 

 Entrada API recebe transacao em USDEURBRL ex 10000 e opcionalmente codigo do banco 033 
 Enriquecimento Sistema consulta a AwesomeAPI e obtem cotacao ex 100 R 49800 
 Compliance Sistema consulta a BrasilAPI e valida se o banco de destino ex 033 Santander existe no cadastro do Banco Central 
 Feriados Antes do debito o Consumer consulta feriados nacionais Se for feriado a transacao e marcada como PENDINGSETTLEMENT agendada para o proximo dia util 
 Execucao Consumer debita R 49800 do Redis usando script Lua operacao atomica 
 Saida O Notifier envia um comprovante JSON para o Webhook configurado ex Webhooksite 

 Integracoes APIs opensource custo zero

 Ativo Uso API Custo Token 

 Cambio USDEUR AwesomeAPIhttpseconomiaawesomeapicombr Gratis Nao 
 Bancos Feriados BrasilAPIhttpsbrasilapicombr Gratis Nao 
 Bitcoin BTC Mercado Bitcoinhttpsapimercadobitcoinnetapiv4docs Gratis Nao 
 Acoes PETR4 VALE3 Brapihttpsbrapidev Gratis Sim cadastro em brapidevdashboard 
 Liquidacao simulada Webhooksitehttpswebhooksite Gratis Nao 

 AwesomeAPI GET httpseconomiaawesomeapicombrlastUSDBRL para settlement em BRL
 BrasilAPI GET apibanksv1code e GET apiferiadosv1year
 Mercado Bitcoin GET httpsapimercadobitcoinnetapiv4marketsbtcbrlticker para preco BTC em BRL
 Brapi GET httpsbrapidevapiquotesymbol PETR4 VALE3 etc Opcional BRAPITOKEN para mais ativos

 Configurar o Gran Finale Webhooksite

1 Acesse webhooksitehttpswebhooksite e copie sua URL unica ex httpswebhooksitexxxxxxxxx
2 No dockercompose ou env do servico notifier defina WEBHOOKBASEURLhttpswebhooksitexxxxxxxxx
3 Toda transacao aprovada e PENDINGSETTLEMENT sera enviada em JSON para essa URL Deixe uma aba aberta no Webhooksite e envie uma transacao pelo Terminal ou Swagger para ver o comprovante chegar

 Arquitetura

mermaid
flowchart TB
 subgraph Clients Clientes
 APIREST API Fastify
 end

 subgraph Producers Producer Layer
 TSTransaction Simulator
 BTCPbtcpriceproducer
 end

 subgraph KafkaLayer Apache Kafka
 T1transactionspending
 T2transactionsauthorized
 T3transactionsdenied
 DLQtransactionsdlq
 T4btcticker
 T5opportunitiesbuy
 end

 subgraph Consumers Consumer Layer
 AEAuth Engine Consumer
 ODopportunitydetector
 OJopportunityjustifier
 end

 subgraph Data Data Layer
 RedisRedis Saldo BRL BTC Acoes
 end

 API T1
 TS batch GZIP T1
 BTCP 1s T4
 T1 AE
 T4 OD
 OD preco 98 MA 5min T5
 T5 OJ
 AE Redis
 AE T2
 AE T3
 AE DLQ

 API Fastify recebe POST apiv1transactions POST apiv1ordersbtc e POST apiv1ordersstock publica em transactionspending
 Producer Simulator gera transacoes simuladas em lotes com GZIP e envia para transactionspending ate 1000 TPS configuravel
 Consumer Auth Engine consome transactionspending para ordens cryptobuy ou stockbuy debita BRL e credita BTC ou acoes no Redis publica em transactionsauthorized ou transactionsdenied Falhas apos N retentativas vao para transactionsdlq
 btcpriceproducer a cada 1 s consulta Mercado Bitcoin ticker e publica em btcticker
 opportunitydetector consome btcticker mantem janela de 5 min calcula media movel se preco atual lt 98 da media publica em opportunitiesbuy
 opportunityjustifier consome opportunitiesbuy e gera justificativa template fixo ou LLM se OPENAIAPIKEY estiver definido
 Redis saldo BRL por conta balanceaccountId saldo BTC balancebtcaccountId em satoshis saldo acoes balancestockaccountIdsymbol idempotencia TTL 24h
 Notifier consome transactionsauthorized e envia webhooks para o lojista com retry e backoff exponencial 1s 2s 4s

 EnterpriseReady Features

 Atomic Operations Verificacao de saldo e debito via Lua Script no Redis debitasaldolua evitando race condition entre GET e DECRBY em alta concorrencia
 Idempotent Consumer Protecao contra processamento duplicado com chave de idempotencia no Redis e TTL de 24h
 Observabilidade Logs estruturados Pino com Correlation ID idempotencyKey ou correlationId em todos os fluxos para rastreamento ponta a ponta API Kafka Consumer
 Resilient Webhooks Package notifier consome transactionsauthorized e notifica parceiros via HTTP com retry e backoff exponencial 1s 2s 4s em caso de erro 5xx
 Graceful Shutdown Tratamento de SIGTERMSIGINT no Consumer para de receber novas mensagens finaliza o processamento em andamento e so entao desconecta Kafka e Redis evitando perda de offset e cobranca duplicada no rebalance

 Throughput e latencia

 Metrica Valor tipico 

 Throughput 1000 TPS no producer configuravel via TRANSACTIONSPERSECOND 
 Redis lt 1 ms GETDECRBY 
 Kafka produce lt 10 ms por batch GZIP batching 50100 msgs 
 Endtoend P50 50 ms P95 100 ms pending authorizeddenied 

O producer usa batching ate 100 mensagens ou 50 ms e compressao GZIP para maximizar throughput e reduzir uso de rede

 Escalabilidade horizontal

 Consumer aumentar replicas do servico consumer ex docker compose up d scale consumer3 faz com que cada instancia consuma um subconjunto das particoes Com 6 particoes em transactionspending ate 6 consumers no mesmo group processam em paralelo
 Kafka 6 particoes em transactionspending transactionsauthorized e transactionsdenied permitem paralelismo e ordenacao por accountId key accountId
 Formula throughput total particoes throughput por consumer Ex 6 particoes 200 msgss por consumer 1200 TPS

 Prerequisitos

 Nodejs 18
 Docker e Docker Compose para rodar o stack completo

 Execucao rapida

bash
 Clone e entre no diretorio
cd transactionauthengine

 Instalar dependencias monorepo
npm install

 Build de todos os packages
npm run build

 Subir toda a stack Kafka Zookeeper Redis API Producer Consumer
docker compose up build

 Terminal de Operacoes UI httplocalhost3000 Transacao internacional AwesomeAPI BrasilAPI Kafka Auth Engine Comprar BTC Mercado Bitcoin Kafka Auth Engine Comprar Acao Brapi Kafka Auth Engine stepper em tempo real e Exportar comprovante JSON Fonte monoespacada JetBrains Mono verde sucesso 22c55e e laranja cambio f97316
 API httplocalhost3000apiv1transactions httplocalhost3000apiv1ordersbtc httplocalhost3000apiv1ordersstock 
 Swagger UI httplocalhost3000apidocs 
 Health httplocalhost3000health 
 Grafana httplocalhost3001 adminadmin 
 Prometheus httplocalhost9090 

 Checklist para demonstracao Geovani

1 Subir o Docker docker compose up build
2 Abrir o Swagger httplocalhost3000apidocs
3 Abrir o log do Consumer terminal ou docker compose logs f consumer
4 Fazer um POST apiv1transactions pelo Swagger
5 No log do Consumer deve aparecer Transaction Authorized Account accXXX Latency XXms

 Variaveis de ambiente

 Variavel Descricao Padrao 

 KAFKABROKERS Brokers Kafka separados por virgula localhost9092 
 REDISURL URL do Redis redislocalhost6379 
 PORT Porta da API 3000 
 TRANSACTIONSPERSECOND TPS alvo do producer simulador 1000 
 WEBHOOKBASEURL URL base para webhooks notifier httplocalhost9999webhook 
 BRAPITOKEN Token Brapi opcional PETR4 VALE3 MGLU3 ITUB4 funcionam sem token 
 OPENAIAPIKEY Opcional gera justificativa via LLM para eventos em opportunitiesbuy 
 LOGLEVEL Nivel de log Pino info 

 Endpoints da API

 Metodo Path Descricao 

 POST apiv1transactions Transacao internacional body accountId amount currency merchantId idempotencyKey targetBankCode opcional AwesomeAPI BrasilAPI retorna amountBRL rate bankName 
 POST apiv1ordersbtc Ordem de compra de BTC body accountId amountBtc idempotencyKey Mercado Bitcoin amountBRL Consumer debita BRL e credita BTC 
 POST apiv1ordersstock Ordem de compra de acao body accountId symbol quantity idempotencyKey Brapi cotacao Consumer debita BRL e credita quantidade do ativo 
 GET apiv1transactionsid Consulta status eventualmente consistente 
 GET health Health check Kafka Redis 
 GET apidocs Swagger UI OpenAPI 

 Performance Reliability Lab

 Atomic Transactions Script Lua no Redis garante que o saldo nunca fique inconsistente mesmo com varias transacoes da mesma conta concorrentes
 Load Testing Resultados via k6 em packagesloadtest estresse com 100 VUs por 30s threshold P95 lt 40ms Sistema estressado com k6 mantendo P95 de 40ms sob carga de 1200 TPS
 Chaos Engineering Simular queda do Redis ex docker stop redis para validar o fluxo de DLQ no Kafka e o comportamento do consumer apos retries

 Dashboard Prometheus Grafana

O dockercompose inclui Prometheus porta 9090 e Grafana porta 3001 Apos adicionar endpoints metrics nos servicos ex contadores transactionsauthorizedtotal transactionsdeniedtotal transactionsdlqtotal e possivel criar um painel com grafico de pizza 80 Aprovadas 15 Negadas 5 Erros DLQ para visao SRE da saude do sistema

 Testes de carga

Script pronto em packagesloadtest

bash
cd packagesloadtest
k6 run scriptjs 100 VUs 30s
k6 run scriptjs vus 100 duration 30s
BASEURLhttplocalhost3000 k6 run scriptjs

Exemplo minimo k6

javascript
import http from k6http
import uuidv4 from httpsjslibk6iok6utils140indexjs

export const options vus 10 duration 30s 

export default function 
 const payload JSONstringify
 accountId accITER 1000
 amount 1000
 currency BRL
 merchantId merchant1
 idempotencyKey uuidv4
 
 httpposthttplocalhost3000apiv1transactions payload 
 headers ContentType applicationjson 
 

Com Artillery

yaml
 artilleryyml
config
 target httplocalhost3000
 phases
 duration 60
 arrivalRate 50
scenarios
 flow
 post
 url apiv1transactions
 json
 accountId acc1
 amount 100
 currency BRL
 merchantId merchant1
 idempotencyKey randomUUID 

bash
artillery run artilleryyml

 Estrutura do repositorio monorepo

transactionauthengine
 dockercomposeyml
 Dockerfile
 packagejson
 tsconfigbasejson
 packages
 core Entidades e tipos Transaction OrderType BTCMINORUNITS
 shared Interfaces Logger AwesomeAPI BrasilAPI MercadoBitcoin Brapi
 producer Simulador batching GZIP 1000 TPS
 btcpriceproducer Envia preco BTC Mercado Bitcoin a cada 1 s btcticker
 opportunitydetector Media movel 5 min publica opportunitiesbuy se preco 98 MA
 opportunityjustifier Consome opportunitiesbuy justificativa template ou LLM
 consumer Auth Engine debito BRL credito BTCacoes Lua DLQ
 notifier Webhook dispatcher transactionsauthorized com retrybackoff
 api REST Fastify OpenAPI ordersbtc ordersstock
 frontend Terminal bancario transacao Comprar BTC Comprar Acao export JSON
 loadtest k6 stress test P95 lt 40ms

Status de transacao PENDING AUTHORIZED DENIED PENDINGSETTLEMENT agendada em feriado Ordens de ativo cryptobuy stockbuy debitam BRL e creditam BTC ou acoes no Redis

 Licenca

MIT
