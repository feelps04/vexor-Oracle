import urllib.request
import json

# Testar tick direto
data = json.dumps({"symbol": "AAPL.US", "broker": "mt5"}).encode()
req = urllib.request.Request('http://127.0.0.1:8765/tick', data=data, headers={'Content-Type': 'application/json'})
r = urllib.request.urlopen(req, timeout=5)
d = json.loads(r.read())
print(f"AAPL.US tick: {d}")
