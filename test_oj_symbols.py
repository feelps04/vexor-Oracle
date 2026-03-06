import urllib.request
import json

# Testar diferentes símbolos para suco de laranja
symbols = ['OJ', 'OrangeJuice', 'ORANGEJUICE', 'ORANGE_JUICE', 'SUGAR', 'SUGAR11']

for sym in symbols:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r = urllib.request.urlopen(req, timeout=5)
        d = json.loads(r.read())
        bid = d.get('bid', 'N/A')
        error = d.get('error', None)
        print(f"{sym}: bid={bid} error={error}")
    except Exception as e:
        print(f"{sym}: ERRO {e}")
