import urllib.request

# Verificar se o CSV está acessível
try:
    r = urllib.request.urlopen('http://localhost:5174/sectors_symbols.csv', timeout=10)
    text = r.read().decode('utf-8')
    lines = text.split('\n')
    print(f"CSV: {len(lines)} linhas")
    
    # Verificar sector_002
    for line in lines[:10]:
        if 'sector_002' in line:
            print(f"  sector_002: {line[:80]}")
except Exception as e:
    print(f"ERRO: {e}")
