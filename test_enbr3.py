import urllib.request
import json

# Testar ENBR3 (antigo ENER3)
req = urllib.request.Request(
    'http://127.0.0.1:8765/tick',
    data=json.dumps({'symbol': 'ENBR3'}).encode(),
    headers={'Content-Type': 'application/json'}
)
try:
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"ENBR3: bid={d.get('bid', 'N/A')} error={d.get('error', None)}")
except Exception as e:
    print(f"ENBR3: ERRO {e}")
