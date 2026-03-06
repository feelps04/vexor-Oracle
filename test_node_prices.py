import urllib.request
import json

# Testar com símbolos variados
symbols = "BTC,ETH,GC,SI,CL,NG,PETR4,VALE3,AAVE,ADA"
url = f'http://localhost:3000/api/v1/market/symbols/check?symbols={symbols}'

r = urllib.request.urlopen(url, timeout=15)
d = json.loads(r.read())
print(f"Items: {len(d.get('items', []))}")
for item in d.get('items', []):
    status = item.get('status')
    price = item.get('priceBRL', 'N/A')
    print(f"  {item['requested']}: {status} - {price}")
