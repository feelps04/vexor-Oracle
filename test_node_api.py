import urllib.request
import json

# Testar o endpoint da API Node.js
url = 'http://localhost:3000/api/v1/market/symbols/check?symbols=BTC,ETH,GC,PETR4'
try:
    r = urllib.request.urlopen(url, timeout=10)
    d = json.loads(r.read())
    print(f"Status: OK")
    print(f"Items: {len(d.get('items', []))}")
    for item in d.get('items', [])[:5]:
        print(f"  {item}")
except Exception as e:
    print(f"ERRO: {e}")
