import csv
from pathlib import Path

csv_path = Path('C:/Users/Bete/Desktop/projeto-sentinel/sectors_symbols.csv')
encoding = 'utf-8-sig'

# Read existing symbols
with open(csv_path, mode='r', encoding=encoding, newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Define custom sectors
custom_mapping = {
    'crypto_numeros': {'name': 'Cripto - Números', 'pattern': lambda s: s[0].isdigit()},
    'crypto_letra_X': {'name': 'Cripto - Letra X', 'pattern': lambda s: s.upper().startswith('X')},
    'crypto_letra_Z': {'name': 'Cripto - Letra Z', 'pattern': lambda s: s.upper().startswith('Z')},
}

# Clear existing entries for these custom sectors to avoid mess
rows = [row for row in rows if row['sector_id'] not in custom_mapping.keys()]

# Find all crypto symbols (from sector_029 or CRYPTO exchange)
crypto_pool = [row for row in rows if row['sector_id'] == 'sector_029' or row['exchange'] == 'CRYPTO']

new_rows = []
added_count = 0

for sector_id, info in custom_mapping.items():
    for row in crypto_pool:
        if info['pattern'](row['symbol']):
            new_row = row.copy()
            new_row['sector_id'] = sector_id
            new_row['sector_name'] = info['name']
            new_rows.append(new_row)
            added_count += 1

# Combine and write back
all_rows = rows + new_rows

fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open(csv_path, mode='w', encoding=encoding, newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(all_rows)

print(f"Successfully populated custom sectors. Total added: {added_count}")
for sid in custom_mapping.keys():
    count = len([r for r in new_rows if r['sector_id'] == sid])
    print(f" - {sid}: {count} symbols")
