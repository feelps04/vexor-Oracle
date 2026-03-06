import urllib.request
import json

# Testar endpoint /ticks/sector para crypto_letra_Z
req = urllib.request.Request(
    'http://127.0.0.1:8765/ticks/sector',
    data=json.dumps({'sector_id': 'crypto_letra_Z'}).encode(),
    headers={'Content-Type': 'application/json'}
)
r = urllib.request.urlopen(req, timeout=10)
d = json.loads(r.read())
print(f"Setor crypto_letra_Z: {len(d.get('ticks', {}))} ticks")
for sym, tick in list(d.get('ticks', {}).items())[:5]:
    print(f"  {sym}: bid={tick.get('bid')}")

# Testar crypto_numeros
req2 = urllib.request.Request(
    'http://127.0.0.1:8765/ticks/sector',
    data=json.dumps({'sector_id': 'crypto_numeros'}).encode(),
    headers={'Content-Type': 'application/json'}
)
r2 = urllib.request.urlopen(req2, timeout=10)
d2 = json.loads(r2.read())
print(f"\nSetor crypto_numeros: {len(d2.get('ticks', {}))} ticks")
for sym, tick in list(d2.get('ticks', {}).items())[:5]:
    print(f"  {sym}: bid={tick.get('bid')}")
