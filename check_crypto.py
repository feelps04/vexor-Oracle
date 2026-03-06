import urllib.request
import json

r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d = json.loads(r.read())

crypto = [x for x in d.get('symbols', []) if x.get('exchange') == 'CRYPTO']
print(f'CRYPTO no cache: {len(crypto)}')
for x in crypto[:15]:
    print(f"  {x['symbol']}: {x.get('bid')} ({x.get('broker')})")

commodities = [x for x in d.get('symbols', []) if x.get('exchange') == 'COMMODITIES']
print(f'\nCOMMODITIES no cache: {len(commodities)}')
for x in commodities[:10]:
    print(f"  {x['symbol']}: {x.get('bid')} ({x.get('broker')})")
