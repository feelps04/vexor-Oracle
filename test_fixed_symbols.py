import urllib.request
import json

# Testar endpoint de verificação com os símbolos corrigidos
symbols = ['ENBR3', 'COCE6', 'CC', 'HE', 'OJ']
url = f'http://localhost:3000/api/v1/market/symbols/check?symbols={",".join(symbols)}'

try:
    r = urllib.request.urlopen(url, timeout=10)
    d = json.loads(r.read())
    print(f"Items: {len(d.get('items', []))}")
    for item in d.get('items', []):
        print(f"  {item['requested']}: {item['status']} - {item.get('priceBRL', 'N/A')}")
except Exception as e:
    print(f"ERRO: {e}")
