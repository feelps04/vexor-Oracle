import MetaTrader5 as mt5
import json

# Conectar ao Genial (MT5 Brasil)
print("=== GENIAL (MT5 Brasil) ===")
path_genial = r"C:\Program Files\MetaTrader 5\terminal64.exe"
if mt5.initialize(path=path_genial):
    symbols = mt5.symbols_get()
    print(f"Total símbolos: {len(symbols)}")
    
    # Buscar ENER3, COCE6, ATTA3, IGSN3
    busca = ['ENER3', 'ENBR3', 'COCE6', 'COCE5', 'ATTA3', 'ATTA4', 'IGSN3', 'IGSN4']
    encontrados = []
    for s in symbols:
        for b in busca:
            if b in s.name:
                tick = mt5.symbol_info_tick(s.name)
                encontrados.append({
                    'symbol': s.name,
                    'description': s.description,
                    'bid': tick.bid if tick else 0,
                    'visible': s.visible
                })
    
    for e in encontrados[:20]:
        print(f"  {e['symbol']}: {e['description']} (bid={e['bid']}, visible={e['visible']})")
    
    mt5.shutdown()
else:
    print("Não conectou ao Genial")

print("\n=== PEPPERSTONE (Forex/Commodities) ===")
path_pepp = r"C:\Program Files\Pepperstone MetaTrader 5\terminal64.exe"
if mt5.initialize(path=path_pepp):
    symbols = mt5.symbols_get()
    print(f"Total símbolos: {len(symbols)}")
    
    # Buscar CC, HE, OJ, Coffee, Cattle, Orange
    busca = ['CC', 'HE', 'OJ', 'Coffee', 'Cattle', 'Orange', 'Cocoa', 'Lean', 'Juice']
    encontrados = []
    for s in symbols:
        for b in busca:
            if b.lower() in s.name.lower() or b in s.name:
                tick = mt5.symbol_info_tick(s.name)
                encontrados.append({
                    'symbol': s.name,
                    'description': s.description,
                    'bid': tick.bid if tick else 0,
                    'visible': s.visible
                })
    
    for e in encontrados[:30]:
        print(f"  {e['symbol']}: {e['description']} (bid={e['bid']}, visible={e['visible']})")
    
    mt5.shutdown()
else:
    print("Não conectou ao Pepperstone")
