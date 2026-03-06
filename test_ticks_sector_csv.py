import urllib.request
import json

# Testar ticks/sector para setor CSV
for sector_id in ['sector_001', 'sector_002', 'sector_003']:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/ticks/sector',
        data=json.dumps({'sector_id': sector_id}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    ticks = d.get('ticks', {})
    print(f"{sector_id}: {len(ticks)} ticks")
    if ticks:
        # Mostrar alguns ticks
        for sym, tick in list(ticks.items())[:3]:
            print(f"  {sym}: bid={tick.get('bid', 'N/A')}")
    else:
        print(f"  Error: {d.get('error', 'N/A')}")
