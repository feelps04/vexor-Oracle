import MetaTrader5 as mt5

mt5.initialize(path=r'C:\Program Files\Pepperstone MetaTrader 5\terminal64.exe')

syms = ['USOIL', 'UKOIL', 'NatGas', 'Gasoline', 'Coffee', 'Cotton', 'Sugar', 
        'Soybeans', 'Wheat', 'Corn', 'Cattle', 'SpotBrent', 'XAUUSD', 'XAGUSD']

print("Commodities no Pepperstone:")
for s in syms:
    tick = mt5.symbol_info_tick(s)
    if tick:
        print(f"  {s}: bid={tick.bid} ask={tick.ask}")
    else:
        # Tentar selecionar
        mt5.symbol_select(s, True)
        tick = mt5.symbol_info_tick(s)
        if tick:
            print(f"  {s}: bid={tick.bid} ask={tick.ask} (selecionado)")
        else:
            print(f"  {s}: NAO ENCONTRADO")

mt5.shutdown()
