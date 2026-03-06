import urllib.request
import json

# Verificar setores
r = urllib.request.urlopen('http://127.0.0.1:8765/sectors', timeout=10)
sectors = json.loads(r.read())
print(f"Total setores: {len(sectors)}")

# Mostrar alguns setores
for s in sectors[:10]:
    print(f"  {s['sector_id']}: {s['sector_name']} ({s.get('count', 0)} ativos)")

# Verificar ticks de um setor
print("\nTestando sector_002:")
req = urllib.request.Request(
    'http://127.0.0.1:8765/ticks/sector',
    data=json.dumps({'sector_id': 'sector_002'}).encode(),
    headers={'Content-Type': 'application/json'}
)
r = urllib.request.urlopen(req, timeout=10)
d = json.loads(r.read())
print(f"  Ticks: {len(d.get('ticks', {}))}")
print(f"  Error: {d.get('error', '-')}")
