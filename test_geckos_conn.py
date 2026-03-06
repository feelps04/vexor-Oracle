import socket
import json

# Testar conexão UDP com Geckos
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(5)

# Enviar mensagem para o servidor Geckos (porta 10208)
try:
    # Geckos usa WebRTC, não UDP direto. Vamos testar o HTTP na porta 11208
    import urllib.request
    
    # Testar HTTP do Geckos (porta + 1000 = 11208)
    try:
        r = urllib.request.urlopen('http://127.0.0.1:11208', timeout=5)
        print(f"Geckos HTTP: {r.status}")
    except Exception as e:
        print(f"Geckos HTTP erro: {e}")
    
    # Testar UDP bridge (porta 10209)
    sock.sendto(json.dumps({"type":"test"}).encode(), ('127.0.0.1', 10209))
    data, addr = sock.recvfrom(65536)
    print(f"UDP Bridge resposta: {data[:200]}")
except Exception as e:
    print(f"Erro: {e}")
finally:
    sock.close()
