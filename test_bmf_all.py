import urllib.request
import json

# Testar futuros DI, OC1, DIF e outros BMF
symbols = [
    'DI1', 'DI1H26', 'DI1J26', 'DI1N26', 'DI1F27', 'DI1F28',
    'OC1', 'OC1F27', 'OC1F28', 'OC1H26', 'OC1J26',
    'DIF', 'DIFF27F32', 'DIFF27F35', 'DIFJ26F28',
    'WIN', 'IND', 'BGI', 'BIT', 'SJC', 'ETH'
]

print("Testando futuros BMF em tempo real...\n")
for sym in symbols:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r = urllib.request.urlopen(req, timeout=5)
        d = json.loads(r.read())
        bid = d.get('bid', 0)
        error = d.get('error', None)
        if bid and bid > 0:
            print(f"✓ {sym}: {bid}")
        else:
            print(f"✗ {sym}: sem preço - {error}")
    except Exception as e:
        print(f"✗ {sym}: ERRO {e}")
