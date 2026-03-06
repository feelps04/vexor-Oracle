import urllib.request
import json

# Testar endpoint diretamente
print("Testando endpoint /ohlcv:")

data = json.dumps({'symbol': 'GC', 'timeframe': 'H1', 'count': 5, 'broker': 'pepperstone'}).encode()
req = urllib.request.Request('http://127.0.0.1:8765/ohlcv', data=data, headers={'Content-Type': 'application/json'})

try:
    r = urllib.request.urlopen(req, timeout=10)
    raw = r.read().decode('utf-8')
    print(f"Resposta raw: {raw[:500]}")
    d = json.loads(raw)
    print(f"\nSymbol: {d.get('symbol')}")
    print(f"MT5 Symbol: {d.get('mt5_symbol')}")
    print(f"Broker: {d.get('broker')}")
    print(f"Source: {d.get('source')}")
    print(f"Error: {d.get('error')}")
    print(f"Data count: {len(d.get('data', []))}")
    if d.get('data'):
        print(f"Primeiro candle: {d['data'][0]}")
except Exception as e:
    print(f"ERRO: {e}")
