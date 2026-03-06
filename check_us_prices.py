import urllib.request
import json

r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
d = json.loads(r.read())
us = [x for x in d.get('symbols', []) if '.US' in x.get('symbol', '')]
print(f"Acoes US: {len(us)}")
for x in us[:15]:
    print(f"  {x['symbol']}: bid={x.get('bid', '-')} broker={x.get('broker', '-')}")
