import MetaTrader5 as mt5

# Conectar ao Genial
mt5.initialize(path=r"C:\Program Files\MetaTrader 5\terminal64.exe")

# Listar símbolos que contêm DOL, WDO, BGI
symbols = mt5.symbols_get()
print(f"Total símbolos: {len(symbols)}")

# Buscar futuros
for group in ['DOL', 'WDO', 'BGI', 'BGIO', 'BIT', 'ETR', 'SOL']:
    matches = [s.name for s in symbols if group in s.name and 'FUT' in s.name.upper()][:5]
    if matches:
        print(f"\n{group}: {matches[:5]}")

# Buscar todos com DOL
dol_symbols = [s.name for s in symbols if 'DOL' in s.name][:20]
print(f"\nDOL símbolos: {dol_symbols}")

mt5.shutdown()
