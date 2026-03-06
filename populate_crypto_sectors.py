import csv
import re
from pathlib import Path

csv_path = Path('C:/Users/Bete/Desktop/projeto-sentinel/sectors_symbols.csv')
encoding = 'utf-8-sig'

# Read existing symbols
with open(csv_path, mode='r', encoding=encoding, newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Find all crypto symbols (from sector_029)
crypto_symbols = [row for row in rows if row['sector_id'] == 'sector_029']

new_rows = []
for row in crypto_symbols:
    symbol = row['symbol']
    first_char = symbol[0].upper()
    
    target_sector = None
    target_name = None
    
    if first_char.isdigit():
        target_sector = 'crypto_numeros'
        target_name = 'Cripto - Números'
    elif first_char == 'X':
        target_sector = 'crypto_letra_X'
        target_name = 'Cripto - Letra X'
    elif first_char == 'Z':
        target_sector = 'crypto_letra_Z'
        target_name = 'Cripto - Letra Z'
    
    if target_sector:
        new_row = row.copy()
        new_row['sector_id'] = target_sector
        new_row['sector_name'] = target_name
        new_rows.append(new_row)

# Filter out any existing rows with these sector IDs to avoid duplicates before re-adding
rows = [row for row in rows if row['sector_id'] not in ['crypto_numeros', 'crypto_letra_X', 'crypto_letra_Z']]

# Combine and write back
all_rows = rows + new_rows

fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open(csv_path, mode='w', encoding=encoding, newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(all_rows)

print(f"Added {len(new_rows)} symbols to custom crypto sectors.")
