import MetaTrader5 as mt5

mt5.initialize(path=r"C:\Program Files\MetaTrader 5\terminal64.exe")

# Buscar futuros com tick válido
symbols = mt5.symbols_get()

# Grupos de interesse
groups = {
    'DOL': [], 'WDO': [], 'IND': [], 'WIN': [],
    'BGI': [], 'BIT': [], 'ETR': [], 'SOL': [],
    'DCO': [], 'DDI': [], 'FRO': []
}

for s in symbols:
    for g in groups:
        if g in s.name:
            tick = mt5.symbol_info_tick(s.name)
            if tick and tick.bid > 0:
                groups[g].append((s.name, tick.bid))

for g, items in groups.items():
    if items:
        print(f"\n{g} com preço:")
        for name, bid in items[:5]:
            print(f"  {name}: {bid}")

mt5.shutdown()
