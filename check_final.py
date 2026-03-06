import urllib.request
import json

r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d = json.loads(r.read())

comms = [x for x in d.get('symbols', []) if x.get('exchange') == 'COMMODITIES']
print(f'COMMODITIES no cache: {len(comms)}')
for x in comms:
    print(f"  {x['symbol']}: {x.get('bid')}")

# Testar mapeamentos
print("\nTestando mapeamentos:")
test_syms = ['GC', 'SI', 'CL', 'NG', 'KC', 'ZS', 'ZW', 'ZC']
for sym in test_syms:
    # Buscar no endpoint tick
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym, 'broker': 'pepperstone'}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r2 = urllib.request.urlopen(req, timeout=10)
        d2 = json.loads(r2.read())
        print(f"  {sym}: {d2.get('bid', 'N/A')} (broker: {d2.get('broker', '-')})")
    except Exception as e:
        print(f"  {sym}: ERRO - {e}")
