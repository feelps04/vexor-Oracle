import urllib.request
import json

# Testar endpoint /ticks/sector
req = urllib.request.Request(
    'http://127.0.0.1:8765/ticks/sector',
    data=json.dumps({'sector_id': 'sector_002'}).encode(),
    headers={'Content-Type': 'application/json'}
)
try:
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"OK: {len(d.get('ticks', {}))} ticks")
except Exception as e:
    print(f"ERRO: {e}")
