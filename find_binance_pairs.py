import urllib.request
import json

# Buscar todos os pares USDT da Binance
req = urllib.request.Request('https://api.binance.com/api/v3/ticker/price')
r = urllib.request.urlopen(req, timeout=10)
data = json.loads(r.read())

# Filtrar pares USDT
usdt_pairs = [d['symbol'] for d in data if 'USDT' in d['symbol']]
print(f"Total pares USDT: {len(usdt_pairs)}")

# Símbolos que precisam de mapeamento
needed = ['FTM', 'INJ', 'SEI', 'CAKE', 'XVS', 'BAND', 'RAY', 'JUP', 'BONK', 'WIF', 
          'ONDO', 'RIO', 'TRU', 'FLOKI', 'FET', 'RNDR', 'TAO', 'GRT', 'AGIX', 'ENJ', 
          'ILV', 'GALA', 'IMX', 'YGG', 'PIXEL', 'MKR', 'CRV', 'COMP', 'SUSHI', 'SNX', 
          'LDO', 'RPL', 'FXS', 'CHZ', 'PSG', 'BAR', 'JUV', 'QNT', 'AR', 'STORJ', 
          'APE', 'BLUR', 'KAS', 'DASH', 'KSM', 'GLMR', 'ASTR', 'BGB', 'KCS', 'CRO',
          'XMR', 'ZEC', 'RUNE', 'YFI', 'DYDX', 'GMX', 'PERP', 'ENS', 'STX', 'ORDI',
          'SATS', 'OSMO', 'JUNO', 'JOE', 'VELO', 'BTT', 'JST', 'SUND', 'MELD', 'TINY',
          'OPUL', 'AURORA', 'REF']

print("\nMapeamentos encontrados:")
for sym in needed:
    for pair in [f"{sym}USDT", f"{sym}USD"]:
        if pair in usdt_pairs:
            print(f'"{sym}":"{sym}USD",')
            break
