import csv
import urllib.request
import json

# Buscar simbolos com preco
r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug',timeout=5)
d = json.loads(r.read())
mmf = set(x['symbol'] for x in d.get('symbols',[]) if x.get('bid',0)>0 or x.get('ask',0)>0)

# Ler CSV
with open('sectors_symbols.csv', 'r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

# Filtrar setor_008 para apenas BDRs com preco
new_rows = []
removed = 0
for row in rows:
    if row['sector_id'] == 'sector_008':
        if row['symbol'] in mmf:
            new_rows.append(row)
        else:
            removed += 1
    else:
        new_rows.append(row)

# Escrever CSV
fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open('sectors_symbols.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(new_rows)

print(f'Removidos {removed} BDRs sem cotacao do setor_008')
kept = [r['symbol'] for r in new_rows if r['sector_id']=='sector_008']
print(f'BDRs mantidos ({len(kept)}): {kept}')
