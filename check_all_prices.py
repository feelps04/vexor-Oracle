import urllib.request
import json

r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d = json.loads(r.read())

bov = [x for x in d.get('symbols', []) if x.get('exchange') == 'BOVESPA' and x.get('bid', 0) > 0]
nyse = [x for x in d.get('symbols', []) if x.get('exchange') == 'NYSE' and x.get('bid', 0) > 0]

print(f"BOVESPA com preco: {len(bov)}")
print(f"NYSE com preco: {len(nyse)}")

print("\nBOVESPA (primeiros 10):")
for x in bov[:10]:
    print(f"  {x['symbol']}: {x['bid']} ({x.get('broker', '-')})")

print("\nNYSE (primeiros 10):")
for x in nyse[:10]:
    print(f"  {x['symbol']}: {x['bid']} ({x.get('broker', '-')})")
