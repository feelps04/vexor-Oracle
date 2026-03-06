import csv

p = r'C:\Users\Bete\Desktop\projeto-sentinel\sectors_symbols.csv'
rows = list(csv.DictReader(open(p, encoding='utf-8')))

# Buscar commodities/futuros
comms = [r for r in rows if 'COMMODIT' in r.get('exchange', '').upper() or 'FUTURO' in r.get('description', '').upper()]
print(f'Commodities no CSV: {len(comms)}')
for r in comms[:30]:
    print(f"  {r['symbol']}: {r['description']} ({r.get('exchange', '-')})")

# Buscar setores únicos
sectors = set(r['sector_id'] for r in rows if 'COMMODIT' in r.get('exchange', '').upper() or 'FUTURO' in r.get('description', '').upper())
print(f"\nSetores de commodities: {sectors}")
