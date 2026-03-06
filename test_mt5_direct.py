import MetaTrader5 as mt5
import csv

# Inicializar MT5
mt5.initialize()

# Carregar CSV
with open('sectors_symbols.csv', 'r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

# Filtrar setor_008
s8 = [r for r in rows if r['sector_id'] == 'sector_008']
print(f"Setor_008: {len(s8)} ativos")

# Testar ticks
com_preco = []
sem_preco = []
for r in s8:
    sym = r['symbol']
    tick = mt5.symbol_info_tick(sym)
    if tick and tick.bid > 0:
        com_preco.append((sym, tick.bid))
    else:
        sem_preco.append(sym)

print(f"\nCom preco: {len(com_preco)}")
print(f"Sem preco: {len(sem_preco)}")

print("\nCom preco:")
for sym, bid in com_preco[:10]:
    print(f"  {sym}: {bid}")
