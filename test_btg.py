import MetaTrader5 as mt5
import time

if not mt5.initialize():
    print('Erro: Nao foi possivel conectar ao MT5 do BTG.')
    quit()

# Tenta sincronizar os ativos reais do BTG
assets = ['VALE3', 'PETR4', 'WINJ26']
print(f'Conectado ao Broker: {mt5.terminal_info().company}')

for asset in assets:
    # Forca o MT5 a buscar o simbolo no servidor PRD
    if mt5.symbol_select(asset, True):
        tick = mt5.symbol_info_tick(asset)
        if tick:
            print(f'✅ {asset}: R$ {tick.last} | Sincronizado com sucesso.')
    else:
        print(f'❌ {asset}: Nao encontrado no servidor do BTG.')

mt5.shutdown()
