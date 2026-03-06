import urllib.request
import json

r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d = json.loads(r.read())
print(f"Total symbols: {len(d.get('symbols', []))}")
print(f"Timestamp: {d.get('timestamp', 0)}")

# Verificar se tem ações US
us = [x for x in d.get('symbols', []) if '.US' in x.get('symbol', '')]
print(f"Acoes US: {len(us)}")
