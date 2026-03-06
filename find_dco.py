import MetaTrader5 as mt5

mt5.initialize(path=r"C:\Program Files\MetaTrader 5\terminal64.exe")

# Buscar DCO com preço
symbols = mt5.symbols_get()
dco_matches = [(s.name, mt5.symbol_info_tick(s.name).bid if mt5.symbol_info_tick(s.name) else 0) 
               for s in symbols if 'DCO' in s.name]
with_price = [m for m in dco_matches if m[1] > 0][:10]
print("DCO com preço:")
for name, bid in with_price:
    print(f"  {name}: {bid}")

mt5.shutdown()
