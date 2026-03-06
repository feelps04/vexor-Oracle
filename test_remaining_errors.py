import urllib.request
import json

# Testar os que ainda dão erro
symbols = ['SJCH26', 'ETHG26', 'EURBRL', 'DCOF27']

for sym in symbols:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym, 'broker': 'mt5'}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r = urllib.request.urlopen(req, timeout=5)
        d = json.loads(r.read())
        print(f"{sym}: {d}")
    except Exception as e:
        print(f"{sym}: ERRO {e}")
