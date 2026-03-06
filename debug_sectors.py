import urllib.request
import json

# Verificar setores
r = urllib.request.urlopen('http://127.0.0.1:8765/sectors', timeout=10)
sectors = json.loads(r.read())
print(f"Tipo: {type(sectors)}")
print(f"Conteudo: {sectors}")
