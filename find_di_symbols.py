import MetaTrader5 as mt5

mt5.initialize(path=r"C:\Program Files\MetaTrader 5\terminal64.exe")

# Buscar DI, OC1, DIF com preço
keywords = ['DI1', 'OC1', 'DIF', 'DI ', 'WDO', 'IND', 'WIN']

for kw in keywords:
    symbols = mt5.symbols_get()
    matches = []
    for s in symbols:
        if kw in s.name:
            tick = mt5.symbol_info_tick(s.name)
            if tick and tick.bid > 0:
                matches.append((s.name, tick.bid))
    
    if matches:
        print(f"\n{kw} com preço ({len(matches)}):")
        for name, bid in matches[:10]:
            print(f"  {name}: {bid}")

mt5.shutdown()
