import urllib.request
import json

# Verificar setores
r = urllib.request.urlopen('http://127.0.0.1:8765/sectors')
d = json.loads(r.read())
print(f'Total setores: {len(d)}')

# Verificar setores de cripto
crypto_sectors = [s for s in d if 'crypto' in s.get('sectorId', '').lower()]
print(f'\nSetores crypto: {len(crypto_sectors)}')
for s in crypto_sectors[:5]:
    print(f"  {s['sectorId']}: {len(s.get('symbols', []))} símbolos")

# Verificar um setor específico
r2 = urllib.request.Request(
    'http://127.0.0.1:8765/ticks/sector',
    data=json.dumps({'sector_id': 'crypto_letra_Z'}).encode(),
    headers={'Content-Type': 'application/json'}
)
try:
    resp = urllib.request.urlopen(r2, timeout=10)
    ticks = json.loads(resp.read())
    print(f"\nTicks crypto_letra_Z: {len(ticks.get('ticks', {}))} ticks")
except Exception as e:
    print(f"\nErro crypto_letra_Z: {e}")
