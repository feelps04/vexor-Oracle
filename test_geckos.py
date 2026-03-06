import urllib.request
import json

# Testar endpoint /mmf/debug
try:
    r = urllib.request.urlopen('http://127.0.0.1:8765/mmf/debug', timeout=10)
    d = json.loads(r.read())
    print(f"MMF Debug: {d.get('total', 0)} símbolos")
    print(f"Primeiros símbolos:")
    for s in d.get('symbols', [])[:10]:
        print(f"  {s.get('symbol')}: bid={s.get('bid')} [{s.get('exchange')}]")
except Exception as e:
    print(f"ERRO: {e}")

# Verificar porta Geckos (9208)
import socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    sock.settimeout(2)
    sock.sendto(b'ping', ('127.0.0.1', 9208))
    print("\nGeckos UDP: porta 9208 acessível")
except:
    print("\nGeckos UDP: porta 9208 NÃO acessível")
finally:
    sock.close()
