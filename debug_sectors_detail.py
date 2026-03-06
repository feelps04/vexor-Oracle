import urllib.request
import json

# Verificar status
r = urllib.request.urlopen('http://127.0.0.1:8765/status', timeout=10)
status = json.loads(r.read())
print(f"CSV loaded: {status.get('csv_loaded')}")
print(f"Total assets: {status.get('total_assets')}")
print(f"Total sectors: {status.get('total_sectors')}")

# Verificar setores do CSV
r = urllib.request.urlopen('http://127.0.0.1:8765/sectors', timeout=10)
sectors_data = json.loads(r.read())
print(f"\nTipo de resposta: {type(sectors_data)}")

# Verificar se tem setores do CSV
if isinstance(sectors_data, dict):
    print(f"Keys: {sectors_data.keys()}")
    sectors_list = sectors_data.get('sectors', [])
else:
    sectors_list = sectors_data

csv_sectors = [s for s in sectors_list if s.get('sector_id', '').startswith('sector_')]
crypto_sectors = [s for s in sectors_list if s.get('sector_id', '').startswith('crypto_')]
print(f"\nSetores CSV (sector_*): {len(csv_sectors)}")
print(f"Setores Cripto (crypto_*): {len(crypto_sectors)}")

if csv_sectors:
    print("\nPrimeiros setores CSV:")
    for s in csv_sectors[:5]:
        print(f"  {s['sector_id']}: {s['sector_name']} ({s.get('count', 0)} ativos)")
