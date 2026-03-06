# Fluxo de Setores (CSV -> API -> Providers -> UI)

## Fonte de verdade (CSV)

- **`DATA_DIR/sectors.csv`**
  - Define a lista de setores (ex.: `sector_001` ... `sector_052`) e metadata descritiva.
  - **Inclui colunas**: `source`, `protocol`, `frequency`, `recommendation`.
- **`DATA_DIR/sectors_symbols.csv`**
  - Define os símbolos por setor.
  - É o que determina se um setor está **ativo**: `active = (qtd símbolos no setor > 0)`.

Resolução do diretório:

- Se `DATA_DIR` estiver definido: usa esse diretório.
- Caso contrário: default `packages/api/data`.

## Metadata exibida ao usuário (Setor/Fonte/Protocolo/Frequência/Minha Recomendação)

Essa metadata é gerada na API a partir das **colunas do `sectors.csv`**.

- `packages/api/src/routes/sectors.ts`

Mapeamento atual:

- **001-028 (B3)**
  - **Setor**: `sector_001` ... `sector_028`
  - **Fonte**: MT5 Genial
  - **Protocolo**: Script MMF
  - **Frequência**: Ticks (Real-time)
  - **Minha Recomendação**: "Mudar para Poll (1-5 min). Ticks alimentam a ansiedade e o vício em \"olhar o preço\" a cada segundo."

- **029 (Cripto)**
  - **Setor**: `sector_029`
  - **Fonte**: Binance
  - **Protocolo**: REST API
  - **Frequência**: 3s (Poll)
  - **Minha Recomendação**: "Cuidado. WebSockets de Cripto são frenéticos. Para o investidor racional, 1 minuto é mais que suficiente."

- **008/052 (Global)**
  - **Setor**: `sector_008`, `sector_052`
  - **Fonte**: Yahoo Fin.
  - **Protocolo**: REST API
  - **Frequência**: 1 min (Poll)
  - **Minha Recomendação**: "Excelente. É estável, gratuito e o delay de 1 min é um \"filtro de sanidade\"."
  - **Observação operacional**: quando Yahoo falha (ex.: 401 Unauthorized), a API faz fallback para **Stooq (CSV)**.

- **048 (Taxas)**
  - **Setor**: `sector_048`
  - **Fonte**: BCB (SGS)
  - **Protocolo**: REST API
  - **Frequência**: Diário/Sob demanda
  - **Minha Recomendação**: "Perfeito. Taxas macro não mudam intraday; olhar mais que 1x ao dia é ruído."

## Diagrama end-to-end (Mermaid)

```mermaid
flowchart TD
  A[DATA_DIR/sectors.csv] -->|parseCsvFile| B[SectorIndex.sectors]
  C[DATA_DIR/sectors_symbols.csv] -->|parseCsvFile| D[SectorIndex.symbolsBySectorId]

  B --> E[/GET /api/v1/market/sectors\n(activeOnly opcional)/]
  D --> E

  B --> F[/GET /api/v1/market/sectors/:sectorId/symbols/]
  D --> F

  B --> G[/GET /api/v1/market/sectors/:sectorId/quotes/]
  D --> G

  B --> H[/GET /api/v1/market/sectors/quotes (bulk)/]
  D --> H

  subgraph META[Metadata (Setor/Fonte/Protocolo/Frequência/Recomendação)]
    M[getSectorMetaFromRow(sectorRow)]
  end

  B --> M

  subgraph QUOTES[Quotes provider por grupo]
    Q[getSectorQuotes(idx, sectorId, symbols)]

    Q -->|sector_001..028 (B3)| P1[Redis market:lastPrice:v1:*\nOU MARKET_DATA_URL]
    Q -->|sector_029 (Cripto)| P2[Binance REST ticker/price\n(cache TTL curto)]
    Q -->|sector_008 (Global equities)| P3[Yahoo Finance\nse falhar -> Stooq CSV por símbolo]
    Q -->|sector_052 (Indices)| P4[Yahoo Finance\nse falhar -> Stooq CSV por símbolo]
    Q -->|sector_048 (Taxas)| P5[BCB SGS REST\n(cache TTL maior)]
  end

  G --> Q
  H --> Q

  subgraph UI[UI (Vite/React)]
    U1[packages/web] --> U2[apiGet('/api/v1/...') via proxy do Vite]
    U2 --> E
    U2 --> H
    U3[Tela de Setores] -->|exibe| U4[Setor + Metadata + Preço + Status]
  end
```

## Como o usuário final “vê” isso na plataforma

1. UI lista setores **ativos** (derivado do `sectors_symbols.csv`).
2. UI renderiza colunas:
   - `Setor` (ex.: `sector_008` + nome)
   - `Fonte`, `Protocolo`, `Frequência`, `Minha Recomendação` (do `sectors.csv`)
3. UI busca preços via endpoint bulk:
   - **`GET /api/v1/market/sectors/quotes?limit=N`**
4. UI mostra:
   - `status: ok` + `priceBRL`
   - `updatedAt` (epoch ms) + `source` (ex.: `yahoo`, `stooq`, `binance`, `bcb`, `redis`, `market-data`)
   - ou `status: no_data` + `message` (diagnóstico)

Observação prática:

- Sem `REDIS_URL` e sem `MARKET_DATA_URL`, setores B3 (`sector_001..028` e outros B3) tendem a retornar `no_data`.

## Endpoints envolvidos

- **Lista de setores + metadata**
  - `GET /api/v1/market/sectors?activeOnly=true`
- **Quotes bulk (para todos os setores ativos)**
  - `GET /api/v1/market/sectors/quotes?limit=...`
- **Quotes por setor**
  - `GET /api/v1/market/sectors/:sectorId/quotes?limit=...`
- **Símbolos por setor**
  - `GET /api/v1/market/sectors/:sectorId/symbols?limit=...`

- **Health/observabilidade**
  - `GET /api/v1/market/health`

## Resiliência e limites

- **Circuit breaker** por provider: Yahoo, Stooq, Binance, BCB.
- **Rate limiting** in-memory em `/api/v1/market/*`.

## TTLs (env vars)

- `SECTORS_CACHE_TTL_MS`
- `SECTORS_YAHOO_TTL_MS`
- `SECTORS_STOOQ_TTL_MS`
- `SECTORS_BINANCE_TTL_MS`
- `SECTORS_BCB_TTL_MS`
