import urllib.request
import json

# Verificar se COCE6 e IGSN3 existem no MT5
for sym in ['COCE6', 'IGSN3']:
    # Tentar direto no MT5
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym, 'broker': 'mt5'}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r = urllib.request.urlopen(req, timeout=5)
        d = json.loads(r.read())
        bid = d.get('bid', 'N/A')
        error = d.get('error', None)
        print(f"{sym} (MT5): bid={bid} error={error}")
    except Exception as e:
        print(f"{sym} (MT5): ERRO {e}")
