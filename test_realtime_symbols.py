import urllib.request
import json

# Testar símbolos em tempo real
symbols = [
    # Futuros BMF
    'BGI', 'BGIO', 'BITG26', 'DOL', 'WDO', 'SJCH26', 'ETHG26',
    # Criptos alternativas
    'ALGO', 'AXS', 'FIL', 'HBAR', 'ICP', 'MANA', 'OP', 'SAND', 'SHIB', 'SUI', 'TON', 'VET', 'XTZ',
    # Moedas
    'USDBRL', 'EURBRL', 'EURUSD', 'GBPUSD', 'USDJPY',
    # Futuros vencimento
    'DOLF28', 'DOLH26', 'DCOF27', 'DDIF34'
]

print("Testando símbolos em tempo real...\n")
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
        broker = d.get('broker', 'N/A')
        if bid and bid > 0:
            print(f"✓ {sym}: {bid} [{broker}]")
        else:
            print(f"✗ {sym}: sem preço [{broker}] {error or ''}")
    except Exception as e:
        print(f"✗ {sym}: ERRO {e}")
