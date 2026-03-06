import urllib.request
import json

# Testar tudo junto
print("=== RESUMO FINAL ===\n")

# 1. Cache MMF
r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d = json.loads(r.read())
crypto = [x for x in d.get('symbols', []) if x.get('exchange') == 'CRYPTO']
comms = [x for x in d.get('symbols', []) if x.get('exchange') == 'COMMODITIES']
print(f"Cache MMF:")
print(f"  CRIPTO: {len(crypto)} símbolos")
print(f"  COMMODITIES: {len(comms)} símbolos")

# 2. Ticks
print(f"\nTicks de exemplo:")
for sym in ['BTC', 'ETH', 'GC', 'SI', 'CL', 'NG']:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"  {sym}: {d.get('bid', 'N/A')}")

# 3. OHLCV
print(f"\nOHLCV (5 candles):")
for sym in ['GC', 'SI', 'BTC']:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/ohlcv',
        data=json.dumps({'symbol': sym, 'timeframe': 'H1', 'count': 5}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"  {sym}: {len(d.get('data', []))} candles (broker: {d.get('broker', '-')})")

# 4. Setores cripto
print(f"\nSetores cripto:")
for sector in ['crypto_layer1_layer2', 'crypto_defi', 'crypto_meme']:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/ticks/sector',
        data=json.dumps({'sector_id': sector}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    r = urllib.request.urlopen(req, timeout=10)
    d = json.loads(r.read())
    print(f"  {sector}: {len(d.get('ticks', {}))} ticks")
