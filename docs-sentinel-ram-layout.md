## Sentinel_RAM v5 – Layout de memória compartilhada

Este documento descreve o layout binário que o Expert Advisor `Sentinel_RAM v5` usa ao gravar dados de mercado da B3 na memória compartilhada (`MMF_NAME = "Local\\B3RAM"`). Ele deve permanecer sincronizado com qualquer leitor externo (por exemplo, serviços Node.js).

### Cabeçalho global

- **Nome do mapeamento**: `Local\\B3RAM`
- **Tamanho de cada registro (`RECORD_BYTES`)**: `128` bytes
- **Quantidade de registros (`RECORD_COUNT`) recomendada**: `8192`
  - O valor deve ser **maior** que o número máximo de símbolos que se deseja acompanhar (ex.: ~4.500).
  - Recomenda-se uma potência de 2 (ex.: 4096, 8192) para melhor distribuição do hash FNV‑1a.

Cada símbolo é mapeado para um slot por meio de um hash FNV‑1a (`SlotForSymbol`). Colisões são raras, mas possíveis; o leitor deve sempre validar o campo `symbol` antes de confiar nos demais campos.

### Layout de cada registro (128 bytes)

Offsets relativos ao início do registro (`recBase`):

- **`BID_OFF = 0`** – `double` little‑endian (8 bytes)
- **`ASK_OFF = 8`** – `double` little‑endian (8 bytes)
- **`VOL_OFF = 16`** – `int64` little‑endian (8 bytes)
- **`TS_OFF = 24`** – `int64` little‑endian (8 bytes), epoch em milissegundos
- **`ANOM_OFF = 32`** – `int32` little‑endian (4 bytes), flag de anomalia
- **`HB_OFF = 36`** – `int32` little‑endian (4 bytes), heartbeat por registro/global
- **`WF_OFF = 40`** – `int32` little‑endian (4 bytes), flag de escrita (1 = lock, 0 = livre)
- **`SYM_OFF = 44`** – símbolo em ASCII maiúsculo (até 16 bytes úteis)
- **`SYM_BYTES = 16`** – tamanho reservado para o símbolo
- **Reservado** – bytes restantes até completar `RECORD_BYTES = 128`

Total mínimo utilizado hoje:

- 8 (bid) + 8 (ask) + 8 (volume) + 8 (timestamp) + 4 (anom) + 4 (hb) + 4 (wf) + 16 (símbolo) = 60 bytes
- Os 68 bytes finais ficam reservados para expansão futura (campos adicionais).

### Protocolo de escrita (EA)

Para cada símbolo em um determinado slot:

1. **LOCK**: escrever `WF_OFF = 1` (int32) para indicar que o registro está em atualização.
2. Gravar `bid`, `ask`, `volume`, `ts`, `hb`, `symbol` nos offsets definidos.
3. **UNLOCK**: escrever `WF_OFF = 0` para liberar o registro.

O leitor deve:

- Aguardar `WF_OFF == 0` antes de considerar os demais campos.
- Validar o símbolo (ASCII, `trim`, `toUpperCase`, regex de símbolo válido).
- Opcionalmente, usar `HB_OFF` para detectar registros “mortos” ou reinicializações.

### Recomendações para o EA (MetaTrader 5)

- **`RECORD_COUNT`**:
  - Ajustar o valor no código do EA para, no mínimo, 4096; idealmente 8192 para acomodar ~4.500 símbolos da B3 com baixa probabilidade de colisão.
- **Intervalo de varredura (`InpTimerMs`)**:
  - Para milhares de símbolos, começar em 50–100 ms e ajustar conforme o uso de CPU na máquina host.
- **Consistência de tipos**:
  - Garantir que os tipos usados no EA (double/int64/int32) correspondam exatamente às leituras little‑endian feitas pelo consumidor Node.js.

