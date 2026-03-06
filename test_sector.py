import urllib.request
import json

# Testar endpoint ticks/sector
data = json.dumps({"sector_id": "sector_003"}).encode()
req = urllib.request.Request('http://127.0.0.1:8765/ticks/sector', data=data, headers={'Content-Type': 'application/json'})
r = urllib.request.urlopen(req, timeout=10)
d = json.loads(r.read())

print(f"Setor_003 ticks: {len(d.get('ticks', {}))}")
for sym, tick in list(d.get('ticks', {}).items())[:10]:
    print(f"  {sym}: {tick.get('bid')}")
