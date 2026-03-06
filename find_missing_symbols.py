import MetaTrader5 as mt5

mt5.initialize(path=r"C:\Program Files\MetaTrader 5\terminal64.exe")

# Buscar café, etanol, DCO
for keyword in ['SJC', 'ETH', 'DCO', 'EUR']:
    symbols = mt5.symbols_get()
    matches = [(s.name, mt5.symbol_info_tick(s.name).bid if mt5.symbol_info_tick(s.name) else 0) 
               for s in symbols if keyword in s.name]
    with_price = [m for m in matches if m[1] > 0][:10]
    if with_price:
        print(f"\n{keyword} com preço:")
        for name, bid in with_price:
            print(f"  {name}: {bid}")

mt5.shutdown()
