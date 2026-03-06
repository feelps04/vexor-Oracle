import urllib.request
import json

# Testar símbolos com erro
symbols = ['ENER3', 'COCE6', 'ATTA3', 'IGSN3', 'CC', 'HE', 'OJ']

for sym in symbols:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r = urllib.request.urlopen(req, timeout=10)
        d = json.loads(r.read())
        bid = d.get('bid', 'N/A')
        error = d.get('error', None)
        print(f"{sym}: bid={bid} error={error}")
    except Exception as e:
        print(f"{sym}: ERRO {e}")
