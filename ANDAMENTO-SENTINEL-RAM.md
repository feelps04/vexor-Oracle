# Andamento: Sentinel RAM → Node.js → Kafka → glok 4.20

## O "Pulo do Gato" no Cursor

No Cursor, ao rodar o bloco de código deste ANDAMENTO, **use um terminal PowerShell**. Se for um terminal **cmd** comum, os comandos `$env:...` não funcionam — no cmd usa-se `set VAR=valor`.

- **PowerShell**: `$env:MT5_WATCH_METHOD = "mmf"`
- **cmd**: `set MT5_WATCH_METHOD=mmf`

Abra um novo terminal no Cursor e escolha **PowerShell** como perfil antes de colar os comandos.

---

## Status geral

| Item | Status |
|------|--------|
| EA Sentinel_RAM no MetaEditor (`metaeditor.rmd` / v5.20) | **Pronto** – 8192 slots, `Local\B3RAM`, rotação por ciclo |
| EA carregado no MT5 (Genial) | **OK** – 2026.02.27 21:27:53 `expert Sentinel_RAM (A2FY34,H1) loaded successfully` |
| Documentação do layout MMF | **Pronto** – `docs-sentinel-ram-layout.md` |
| Módulo Node leitor MMF (`packages/stock-price-producer/src/mmf.ts`) | **Pronto** – OpenFileMappingW, MapViewOfFile, leitura por slot |
| Integração modo `mmf` no stock-price-producer | **Pronto** – `MT5_WATCH_METHOD=mmf` publica em `stocks.ticker` |
| Pipeline paralelo (Ultra-Institutional) | **OK** – `fix-wrapper-cpp` (SBE/FIX) + `stock-price-producer` (MMF/Watchdog) publicando em paralelo |
| Normalização SBE → `priceBRL` | **Pronto** – `fix-wrapper-cpp` injeta `priceBRL` calculado de `price_mantissa`/`price_exponent` |
| Origem na UI (`source`) | **Pronto** – UI mostra `source` por ativo (ex.: `genial`, `pepperstone`, `b3-sbe`) |
| Imports com extensão `.ts` | **Pronto** – `main.ts` importa `./mmf.ts` para Node 24 sem build |
| Dependências `ffi-napi` e `ref-napi` | Instalar com `npm install` (ou já em `node_modules`) |
| Consumidor glok 4.20 no Kafka | A consumir `stocks.ticker` (mesmo formato já usado pelo stocks-ws) |
| Deploy Genial (EA + Node + PM2/serviço) | Documentado no plano; aplicar na máquina quando quiser |

---

## Passos executados (2026.02.28)

1. **EA Sentinel_RAM** – Você já carregou no MT5; MMF `Local\B3RAM` fica criada com o EA ativo.
2. **Node 24 sem build** – Produtor preparado para rodar com `--experimental-strip-types` (import `./mmf.ts` com extensão).
3. **Comando para subir o produtor (PowerShell)** – Use o Node da sua Área de Trabalho:

```powershell
cd "C:\Users\Genial\Desktop\transaction-auth-engine"

$env:MT5_WATCH_METHOD = "mmf"
$env:KAFKA_BROKERS     = "localhost:9092"
$env:MMF_NAME          = "Local\B3RAM"
$env:MMF_RECORD_BYTES  = "128"
$env:MMF_RECORD_COUNT  = "8192"

& "C:\Users\Genial\Desktop\nodejs\node.exe" --experimental-strip-types "packages/stock-price-producer/src/main.ts"
```

---

## Execução em paralelo (C++ low-latency + Node watchdog)

O setup recomendado é rodar **os dois publishers em paralelo**:

1. **C++ (fix-wrapper-cpp / OnixS)**
   - Publica ticks em `stocks.ticker` com latência mínima (SBE/FIX)
   - Agora injeta `priceBRL` e `source` no payload

2. **Node (stock-price-producer / MMF)**
   - Publica ticks em `stocks.ticker` lendo o que o MT5 consolidou
   - Serve como redundância/Watchdog (a UI não fica cega se o C++ oscilar)

### Variáveis importantes (fix-wrapper-cpp)

- `FIX_WRAPPER_SOURCE`
  - Define o campo `source` nos ticks do C++
  - Sugestão:
    - `FIX_WRAPPER_SOURCE=genial` quando ligado ao fluxo Genial
    - `FIX_WRAPPER_SOURCE=b3-sbe` quando for o SBE puro do mercado

### Variáveis importantes (stock-price-producer)

- `MT5_WATCH_METHOD=mmf`
- `MMF_CONFIGS` (multi MMF: genial + pepperstone)

Exemplo (PowerShell):

```powershell
$env:MT5_WATCH_METHOD = "mmf"
$env:KAFKA_BROKERS = "localhost:9092"
$env:MMF_CONFIGS = '[
  {"name":"Local\\B3RAM","source":"genial","recordBytes":128,"recordCount":8192},
  {"name":"Local\\GLOBALRAM_XP","source":"pepperstone","recordBytes":128,"recordCount":16384}
]'

& "C:\Users\Genial\Desktop\nodejs\node.exe" --experimental-strip-types "packages/stock-price-producer/src/main.ts"
```

---

## O bug do NaN/0 (SBE) e a correção aplicada

Quando o `fix-wrapper-cpp` recebia SBE, o handler publicava apenas:

- `price_mantissa`
- `price_exponent`

O backend da UI (`stocks-ws.ts`) espera `priceBRL` (ou `price`). Resultado: **NaN/0 na UI**.

Correção aplicada no `fix-wrapper-cpp`:

```
priceBRL = price_mantissa * 10^price_exponent
```

E agora o payload inclui `priceBRL` + `source`.

---

## Como validar na UI (Genial vs Pepperstone)

Na tela `Terminal` (web), cada ativo passa a exibir o `source` ao lado do nome.

Checklist:

1. Suba API + Kafka + Redis
2. Suba `fix-wrapper-cpp` (se estiver usando)
3. Suba `stock-price-producer` com `MMF_CONFIGS` (genial + pepperstone)
4. Abra a UI e confirme:
   - Os preços atualizam (não ficam 0)
   - O `source` aparece (ex.: `genial` e `pepperstone` em símbolos que existam nos dois)

---

## Alterações aplicadas no repositório (normalização + source)

1. **C++ (fix-wrapper-cpp)**
   - Arquivo: `packages/fix-wrapper-cpp/src/main.cpp`
   - Mudança:
     - Calcula `priceBRL = price_mantissa * 10^price_exponent` no handler SBE.
     - Injeta `source` via env `FIX_WRAPPER_SOURCE` (default: `b3-sbe`).

2. **API (stocks-ws)**
   - Arquivo: `packages/api/src/routes/stocks-ws.ts`
   - Mudança:
     - Lê `source` do tick do Kafka e repassa para o WS (`tick`/`ticks`).

3. **UI (Terminal)**
   - Arquivo: `packages/web/src/pages/Terminal.tsx`
   - Mudança:
     - Captura `source` dos ticks e exibe ao lado do nome do ativo.


- Se o Kafka estiver em outro host/porta, altere `KAFKA_BROKERS` (ex.: `localhost:29092` ou `ip:9092`).
- Mantenha o **MT5 aberto com o EA ativo** na mesma máquina; senão a MMF não existe e o produtor falha ao abrir.
- Se aparecer `ERR_MODULE_NOT_FOUND` para **`@transaction-auth-engine/shared`** (ou outro pacote do monorepo), rode na raiz:  
  `& "C:\Users\Genial\Desktop\nodejs\npm.cmd" install`  
  (e corrija qualquer `package.json` vazio/inválido se o npm reclamar).
- Se aparecer `ERR_MODULE_NOT_FOUND` para um arquivo dentro de `src/`, todos os imports relativos em `packages/stock-price-producer/src` devem usar extensão `.ts` (ex.: `from './mmf.ts'`). Hoje isso já está aplicado em `main.ts`; se surgir outro arquivo com import sem extensão, peça: *"Adicione a extensão .ts em todos os imports dos arquivos dentro de packages/stock-price-producer/src para que o node --experimental-strip-types funcione."*

---

## Comando em uma linha (bypass)

No **PowerShell**, a partir da raiz do projeto (`C:\Users\Genial\Desktop\transaction-auth-engine`):

```powershell
$env:MT5_WATCH_METHOD="mmf"; $env:MMF_NAME="Local\B3RAM"; $env:KAFKA_BROKERS="localhost:9092"; C:\Users\Genial\Desktop\nodejs\node.exe --experimental-strip-types packages/stock-price-producer/src/main.ts
```

- Para Kafka na porta **29092** (Confluent/Docker padrão do projeto): use `$env:KAFKA_BROKERS="localhost:29092"` no lugar de `9092`.

---

## Checklist de execução

Antes de rodar o produtor, confira:

| Item | Verificação |
|------|-------------|
| Terminal | **PowerShell** (não cmd), dentro do Cursor ou externo. |
| Pasta | Raiz do repositório: `C:\Users\Genial\Desktop\transaction-auth-engine`. |
| Kafka | Docker/Kafka no padrão do projeto → geralmente **9092**. Confluent local → às vezes **29092**. Ajuste `KAFKA_BROKERS`. |
| MT5 + EA | MetaTrader 5 aberto e EA Sentinel_RAM carregado no gráfico (MMF `Local\B3RAM` ativa). |
| Node | `C:\Users\Genial\Desktop\nodejs\node.exe` (Node 24 com `--experimental-strip-types`). |

---

## O que você tem hoje

1. **MetaEditor / MT5**  
   O código em `metaeditor.rmd` é o **Sentinel_RAM v5.20**: cria a MMF `Local\B3RAM`, 8192 slots × 128 bytes, grava bid/ask/volume/timestamp/símbolo por slot (hash FNV-1a). Parâmetros input: `InpMMFName`, `InpRecordBytes`, `InpRecordCount`, `InpSymsPerCycle`, `InpTimerMs`, `InpAutoSelect`.

2. **Node.js (transaction-auth-engine)**  
   - `packages/stock-price-producer` já declara `ffi-napi` e `ref-napi` no `package.json`.  
   - Ao terminar o `npm install`, rode na raiz do repositório:
     ```bash
     npm run build -w @transaction-auth-engine/stock-price-producer
     ```
   - Para subir o produtor lendo da MMF e publicando no Kafka:
     ```bash
     set MT5_WATCH_METHOD=mmf
     set KAFKA_BROKERS=localhost:9092
     set MMF_NAME=Local\B3RAM
     set MMF_RECORD_BYTES=128
     set MMF_RECORD_COUNT=8192
     npm run start -w @transaction-auth-engine/stock-price-producer
     ```
   - O produtor só sobe em **Windows** (usa kernel32). Variáveis opcionais: `MMF_*_OFFSET` e `MMF_SYMBOL_BYTES` se um dia o layout do EA mudar.

3. **Kafka**  
   Mensagens no tópico `stocks.ticker` no formato já usado pelo projeto:  
   `{ type: 'tick', symbol, priceBRL, bid, ask, volume, timestamp, ts }`.

4. **glok 4.20**  
   Basta consumir o tópico `stocks.ticker` (ex.: com `kafkajs`, mesmo padrão do `stocks-ws`) e usar os campos `symbol`, `priceBRL`, `ts` para alimentar a API/estratégias.

---

## Instalação das dependências nativas

Foi executado:

```bash
npm install ffi-napi ref-napi --workspace=@transaction-auth-engine/stock-price-producer
```

Esse comando pode levar **1–2 minutos** no Windows porque compila addons nativos. Se aparecer erro de compilação (Visual Studio Build Tools, Python, etc.), instale o [Windows Build Tools](https://github.com/felixrieseberg/windows-build-tools) ou o Visual Studio com “Desktop development with C++”.

Depois que o install terminar:

- Na raiz: `npm run build -w @transaction-auth-engine/stock-price-producer`
- Subir o produtor com as variáveis acima, com o **MetaTrader 5 aberto e o EA Sentinel_RAM ativo** na mesma máquina, para a MMF `Local\B3RAM` existir.

---

## Ordem recomendada para testar

1. Abrir o MetaTrader 5 (Genial), anexar o EA Sentinel_RAM ao gráfico e deixar rodando.  
2. Garantir que Kafka está acessível (`KAFKA_BROKERS` correto).  
3. Depois do `npm install` e do build, rodar o stock-price-producer com `MT5_WATCH_METHOD=mmf`.  
4. Verificar logs do produtor (publicações por símbolo) e/ou consumir `stocks.ticker` no glok 4.20 ou via WebSocket do projeto.

---

## Como verificar se está funcionando (teste na plataforma)

| Camada | O que está em uso | Como testar |
|--------|--------------------|-------------|
| **MT5 / EA** | Expert Advisor Sentinel_RAM v5.20 (MQL5) | Aba "Experts" do MT5: deve aparecer "loaded successfully". Logs do EA a cada 100 ciclos (HB, MW, Volta em ms). |
| **MMF** | Memória compartilhada `Local\B3RAM` (Windows kernel32) | O produtor Node só sobe se a MMF existir; se abrir sem erro e logar "Starting MMF-based MT5 stock price producer", a MMF está acessível. |
| **Node** | `packages/stock-price-producer` (Node 24, `--experimental-strip-types`) | Terminal mostra logs do Pino (`createLogger`). Mensagens como "MMF MT5 producer idle or steady state" com `published` e `symbols` indicam leitura e publicação. |
| **Kafka** | Tópico `stocks.ticker` | Consumir o tópico (kafka-console-consumer, glok 4.20, ou stocks-ws) e conferir mensagens `{"type":"tick","symbol":"...","priceBRL":...,"ts":...}`. |
| **IA / glok** | glok 4.20 (consumidor Kafka, Node/TS) | Se a API ou o glok consome `stocks.ticker`, verificar nessa aplicação se os preços/símbolos chegam em tempo real. |

**Resumo:** O fluxo é **MT5 (EA) → MMF → Node (stock-price-producer) → Kafka → glok 4.20 / stocks-ws**. Se o produtor logar publicações e o consumidor (Kafka/WebSocket) receber ticks, o sistema está funcionando de forma imparcial (dados puros, sem intervenção manual).

---

## Resumo rápido

| Passo | Ação |
|-------|------|
| 1 | MT5 aberto + EA Sentinel_RAM carregado (já feito). |
| 2 | Na pasta do projeto, rodar o bloco PowerShell da seção **Passos executados** (variáveis de ambiente + `node.exe --experimental-strip-types ... main.ts`). |
| 3 | Ajustar `KAFKA_BROKERS` se o Kafka não for `localhost:9092`. |
| 4 | Se faltar módulo (`@transaction-auth-engine/shared` ou outro), executar `npm install` na raiz com o `npm.cmd` do `C:\Users\Genial\Desktop\nodejs`. |

*Última atualização: 2026.03.01 – pipeline paralelo (C++ + MMF) com `priceBRL` normalizado no SBE e `source` propagado até a UI.*
