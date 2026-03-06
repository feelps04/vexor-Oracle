import csv

# Corrigir os 3 símbolos restantes
fix_map = {
    'AMZO34': 'AMZN.US',
    'BERK34': 'BRK.B.US',
    'GOGL34': 'GOOGL.US'
}

# Ler CSV
with open('sectors_symbols.csv', 'r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

# Corrigir símbolos
fixed = 0
for row in rows:
    if row['sector_id'] == 'sector_008' and row['symbol'] in fix_map:
        old_sym = row['symbol']
        new_sym = fix_map[old_sym]
        row['symbol'] = new_sym
        row['full_symbol'] = f"NYSE\\{new_sym}"
        row['exchange'] = "NYSE"
        fixed += 1
        print(f"  {old_sym} -> {new_sym}")

# Escrever CSV
fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open('sectors_symbols.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"\nCorrigidos {fixed} símbolos")
