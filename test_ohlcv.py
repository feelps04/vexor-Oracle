import urllib.request
import json

# Testar OHLCV para commodities
print("Testando OHLCV para commodities:")

for sym in ['GC', 'SI', 'CL', 'NG', 'KC']:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/ohlcv',
        data=json.dumps({'symbol': sym, 'timeframe': 'H1', 'count': 10, 'broker': 'pepperstone'}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r = urllib.request.urlopen(req, timeout=10)
        d = json.loads(r.read())
        rates = d.get('rates', [])
        print(f"  {sym}: {len(rates)} candles, último: {rates[-1] if rates else 'N/A'}")
    except Exception as e:
        print(f"  {sym}: ERRO - {e}")

# Testar OHLCV para cripto
print("\nTestando OHLCV para cripto:")
for sym in ['BTC', 'ETH', 'SOL']:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/ohlcv',
        data=json.dumps({'symbol': sym, 'timeframe': 'H1', 'count': 10, 'broker': 'binance'}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r = urllib.request.urlopen(req, timeout=10)
        d = json.loads(r.read())
        rates = d.get('rates', [])
        print(f"  {sym}: {len(rates)} candles, último: {rates[-1] if rates else 'N/A'}")
    except Exception as e:
        print(f"  {sym}: ERRO - {e}")
