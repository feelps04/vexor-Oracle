import urllib.request
import json

# Testar ticks/sector para crypto_letra_Z
req = urllib.request.Request(
    'http://127.0.0.1:8765/ticks/sector',
    data=json.dumps({'sector_id': 'crypto_letra_Z'}).encode(),
    headers={'Content-Type': 'application/json'}
)
try:
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"Setor: crypto_letra_Z")
    print(f"Ticks: {len(d.get('ticks', {}))}")
    print(f"Errors: {len(d.get('errors', []))}")
    for sym, tick in list(d.get('ticks', {}).items())[:5]:
        print(f"  {sym}: {tick.get('bid', 'N/A')}")
    for err in d.get('errors', [])[:3]:
        print(f"  ERRO: {err}")
except Exception as e:
    print(f"ERRO: {e}")
