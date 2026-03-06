import urllib.request
import json

# Testar endpoint tick com broker explícito
print("Testando /tick com broker explícito:")

for sym, broker in [('BTC', 'binance'), ('ETH', 'binance'), ('GC', 'pepperstone'), ('SI', 'pepperstone')]:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym, 'broker': broker}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"  {sym} (broker={broker}): bid={d.get('bid', 'N/A')}, error={d.get('error', '-')}")
