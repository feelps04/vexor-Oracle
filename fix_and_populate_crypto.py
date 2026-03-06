import csv
from pathlib import Path

csv_path = Path('C:/Users/Bete/Desktop/projeto-sentinel/sectors_symbols.csv')
encoding = 'utf-8-sig'

# Read existing symbols
with open(csv_path, mode='r', encoding=encoding, newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Custom sectors we want to populate
custom_mapping = {
    'crypto_numeros': {'name': 'Cripto - Números', 'pattern': lambda s: s[0].isdigit()},
    'crypto_letra_X': {'name': 'Cripto - Letra X', 'pattern': lambda s: s.upper().startswith('X')},
    'crypto_letra_Z': {'name': 'Cripto - Letra Z', 'pattern': lambda s: s.upper().startswith('Z')},
}

# Remove any existing rows for these specific custom sector IDs to start clean
rows = [row for row in rows if row['sector_id'] not in custom_mapping.keys()]

# Find all assets that are either in sector_029 OR have exchange 'CRYPTO'
crypto_pool = []
seen_symbols = set()
for row in rows:
    if row['sector_id'] == 'sector_029' or row['exchange'] == 'CRYPTO':
        sym = row['symbol']
        if sym not in seen_symbols:
            crypto_pool.append(row)
            seen_symbols.add(sym)

new_rows = []
for sector_id, info in custom_mapping.items():
    count = 0
    for row in crypto_pool:
        if info['pattern'](row['symbol']):
            new_row = row.copy()
            new_row['sector_id'] = sector_id
            new_row['sector_name'] = info['name']
            new_rows.append(new_row)
            count += 1
    print(f"Mapped {count} symbols to {sector_id}")

# Add manual entries for symbols that might not be in the pool but are expected
# For example, 1INCH is often missing if not in sector_029
manual_entries = [
    {'symbol': '1INCH', 'name': '1inch Network', 'sector': 'crypto_numeros', 'sector_name': 'Cripto - Números'},
    {'symbol': 'ZEC', 'name': 'Zcash', 'sector': 'crypto_letra_Z', 'sector_name': 'Cripto - Letra Z'},
    {'symbol': 'ZIL', 'name': 'Zilliqa', 'sector': 'crypto_letra_Z', 'sector_name': 'Cripto - Letra Z'},
]

for entry in manual_entries:
    # Check if already added
    if not any(r['symbol'] == entry['symbol'] and r['sector_id'] == entry['sector'] for r in new_rows):
        new_rows.append({
            'sector_id': entry['sector'],
            'sector_name': entry['sector_name'],
            'exchange': 'CRYPTO',
            'symbol': entry['symbol'],
            'description': entry['name'],
            'type': 'Criptomoeda',
            'full_symbol': f"CRYPTO\\{entry['symbol']}"
        })
        print(f"Manually added {entry['symbol']} to {entry['sector']}")

# Final set of rows
all_rows = rows + new_rows

fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open(csv_path, mode='w', encoding=encoding, newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(all_rows)

print(f"Total symbols in CSV now: {len(all_rows)}")
