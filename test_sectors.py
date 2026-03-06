import urllib.request
import json

# Testar varios setores
for sector_id in ['sector_003', 'sector_004', 'sector_005', 'sector_008']:
    data = json.dumps({"sector_id": sector_id}).encode()
    req = urllib.request.Request('http://127.0.0.1:8765/ticks/sector', data=data, headers={'Content-Type': 'application/json'})
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    
    ticks = d.get('ticks', {})
    with_price = sum(1 for t in ticks.values() if t.get('bid', 0) > 0)
    print(f"{sector_id}: {with_price}/{len(ticks)} com preco")
