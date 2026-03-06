import urllib.request
import json

# Verificar setores
r = urllib.request.urlopen('http://127.0.0.1:8765/sectors')
d = json.loads(r.read())
print(f'Total setores: {len(d)}')
print(f'Tipo: {type(d)}')
print(f'Conteúdo: {d[:5] if isinstance(d, list) else d}')
