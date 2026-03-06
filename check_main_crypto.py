import urllib.request
import json

r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d = json.loads(r.read())

# Verificar principais criptos
main_crypto = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOGE', 'DOT', 'LINK', 'LTC', 'AVAX', 'ATOM', 'UNI', 'AAVE', 'MATIC', 'NEAR', 'APT', 'ARB']
symbols = d.get('symbols', [])

print("Principais criptos no cache:")
for sym in main_crypto:
    found = [x for x in symbols if x.get('symbol') == sym and x.get('exchange') == 'CRYPTO']
    if found:
        print(f"  {sym}: {found[0].get('bid')} ({found[0].get('broker')})")
    else:
        # Buscar variações
        variants = [x for x in symbols if sym in x.get('symbol', '').upper() and x.get('exchange') == 'CRYPTO']
        if variants:
            print(f"  {sym}: variantes encontradas: {[v['symbol'] for v in variants[:3]]}")
        else:
            print(f"  {sym}: NAO ENCONTRADO")
