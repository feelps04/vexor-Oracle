import urllib.request
import json

# Verificar quais commodities têm preço no cache
r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d = json.loads(r.read())

# Símbolos de commodities do CSV
csv_commodities = ['CC', 'CT', 'GF', 'HE', 'KC', 'LE', 'OJ', 'SB', 'ZC', 'ZS', 'ZW',
                   'BZ', 'CL', 'HO', 'NG', 'RB', 'ALI', 'GC', 'HG', 'PA', 'PL', 'SI',
                   'SLVB34', 'SJCH26', 'ETHG26', 'CCMH26', 'BITG26']

print("Status das commodities no cache:")
for sym in csv_commodities:
    found = [x for x in d.get('symbols', []) if x.get('symbol') == sym]
    if found:
        print(f"  {sym}: {found[0].get('bid', 0)} ({found[0].get('broker', '-')})")
    else:
        # Tentar mapeado
        mapped = {
            'GC': 'XAUUSD', 'SI': 'XAGUSD', 'CL': 'USOIL', 'NG': 'NATGAS',
            'BZ': 'UKOIL', 'HG': 'COPPER', 'PA': 'XPDUSD', 'PL': 'XPTUSD'
        }.get(sym)
        if mapped:
            found_m = [x for x in d.get('symbols', []) if x.get('symbol') == mapped]
            if found_m:
                print(f"  {sym} → {mapped}: {found_m[0].get('bid', 0)} ({found_m[0].get('broker', '-')})")
            else:
                print(f"  {sym} → {mapped}: NAO ENCONTRADO")
        else:
            print(f"  {sym}: NAO ENCONTRADO (sem mapeamento)")
