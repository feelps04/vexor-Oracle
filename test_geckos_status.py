import urllib.request
import json

# Testar se o Geckos está recebendo dados
try:
    r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=5)
    d = json.loads(r.read())
    print(f"MMF: {d.get('total', 0)} símbolos")
    
    # Verificar alguns símbolos crypto
    crypto = [s for s in d.get('symbols', []) if s.get('exchange') == 'CRYPTO'][:5]
    for c in crypto:
        print(f"  {c.get('symbol')}: {c.get('bid')} [{c.get('exchange')}]")
except Exception as e:
    print(f"ERRO: {e}")

# Verificar conexões TCP na porta 10208
import socket
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(2)
try:
    sock.connect(('127.0.0.1', 10208))
    print("\nGeckos HTTP: conectado")
except:
    print("\nGeckos HTTP: não conecta")
finally:
    sock.close()
