import urllib.request
import json

# Testar setor cripto
req = urllib.request.Request(
    'http://127.0.0.1:8765/ticks/sector',
    data=json.dumps({'sector_id': 'crypto_layer1_layer2'}).encode(),
    headers={'Content-Type': 'application/json'}
)
r = urllib.request.urlopen(req, timeout=10)
d = json.loads(r.read())
print(f"crypto_layer1_layer2: {len(d.get('ticks', {}))} ticks")
print(list(d.get('ticks', {}).keys())[:10])

# Testar commodities no cache
req2 = urllib.request.Request(
    'http://127.0.0.1:8765/ticks/sector',
    data=json.dumps({'sector_id': 'sector_012'}).encode(),
    headers={'Content-Type': 'application/json'}
)
r2 = urllib.request.urlopen(req2, timeout=10)
d2 = json.loads(r2.read())
print(f"\nsector_012: {len(d2.get('ticks', {}))} ticks")

# Testar MMF para commodities
r3 = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d3 = json.loads(r3.read())
comms = [x for x in d3.get('symbols', []) if x.get('exchange') == 'COMMODITIES']
print(f"\nCOMMODITIES no cache: {len(comms)}")
for x in comms:
    print(f"  {x['symbol']}: {x.get('bid')}")
