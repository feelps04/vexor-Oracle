import MetaTrader5 as mt5
import pandas as pd

# Testar Pepperstone
mt5.initialize(path=r'C:\Program Files\Pepperstone MetaTrader 5\terminal64.exe')

syms = [('GC', 'XAUUSD'), ('SI', 'XAGUSD'), ('CL', 'SpotBrent'), ('NG', 'NatGas'), ('KC', 'Coffee')]

print("Testando OHLCV Pepperstone:")
for orig, mapped in syms:
    info = mt5.symbol_info(mapped)
    if info and not info.visible:
        mt5.symbol_select(mapped, True)
    
    rates = mt5.copy_rates_from_pos(mapped, mt5.TIMEFRAME_H1, 0, 5)
    if rates is not None and len(rates) > 0:
        print(f"  {orig} -> {mapped}: {len(rates)} candles")
        print(f"    Último: {rates[-1]}")
    else:
        print(f"  {orig} -> {mapped}: SEM DADOS")

mt5.shutdown()
