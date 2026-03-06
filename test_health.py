import urllib.request
import json

# Verificar se Redis está configurado na API Node
url = 'http://localhost:3000/api/v1/health'
try:
    r = urllib.request.urlopen(url, timeout=10)
    print(f"Health: {r.read().decode()}")
except Exception as e:
    print(f"Health error: {e}")

# Testar diretamente o Python API
print("\nPython API tick:")
for sym in ['BTC', 'GC', 'PETR4']:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"  {sym}: {d.get('bid', 'N/A')}")
