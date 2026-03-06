import urllib.request
import json

# Testar endpoint ticks/sector para cripto
data = json.dumps({"sector_id": "crypto_main"}).encode()
req = urllib.request.Request('http://127.0.0.1:8765/ticks/sector', data=data, headers={'Content-Type': 'application/json'})
try:
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"crypto_main ticks: {len(d.get('ticks', {}))}")
    for sym, tick in list(d.get('ticks', {}).items())[:10]:
        print(f"  {sym}: {tick.get('bid')}")
except Exception as e:
    print(f"Erro: {e}")

# Testar setor de commodities
data2 = json.dumps({"sector_id": "sector_012"}).encode()
req2 = urllib.request.Request('http://127.0.0.1:8765/ticks/sector', data=data2, headers={'Content-Type': 'application/json'})
try:
    r2 = urllib.request.urlopen(req2, timeout=10)
    d2 = json.loads(r2.read())
    print(f"\nsector_012 ticks: {len(d2.get('ticks', {}))}")
    for sym, tick in list(d2.get('ticks', {}).items())[:10]:
        print(f"  {sym}: {tick.get('bid')}")
except Exception as e:
    print(f"Erro sector_012: {e}")
