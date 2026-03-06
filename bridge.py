import socket
import json
import time
import urllib.request

def start_bridge():
    DEST_IP = "127.0.0.1"
    DEST_PORT = 10208
    MMF_URL = "http://127.0.0.1:8765/mmf/debug"
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    print(f"📡 BRIDGE ATIVO: Enviando ticks MMF para porta {DEST_PORT}...")
    print(f"📊 Buscando dados de: {MMF_URL}")

    while True:
        try:
            # Busca dados reais da MMF
            with urllib.request.urlopen(MMF_URL, timeout=0.1) as response:
                data = json.loads(response.read().decode())
                
                # Envia ticks B3
                for item in data.get('b3_symbols', []):
                    if item.get('bid', 0) > 0 or item.get('ask', 0) > 0:
                        tick = {
                            "event": "tick",
                            "data": {
                                "s": item['symbol'],
                                "bid": item.get('bid', 0),
                                "ask": item.get('ask', 0),
                                "source": "b3",
                                "t": time.time()
                            }
                        }
                        sock.sendto(json.dumps(tick).encode('utf-8'), (DEST_IP, DEST_PORT))
                
                # Envia ticks Global
                for item in data.get('global_symbols', []):
                    if item.get('bid', 0) > 0 or item.get('ask', 0) > 0:
                        tick = {
                            "event": "tick",
                            "data": {
                                "s": item['symbol'],
                                "bid": item.get('bid', 0),
                                "ask": item.get('ask', 0),
                                "source": "global",
                                "t": time.time()
                            }
                        }
                        sock.sendto(json.dumps(tick).encode('utf-8'), (DEST_IP, DEST_PORT))
                        
        except Exception as e:
            pass  # Silencioso para não inundar o log
        
        time.sleep(0.01)  # 10ms - alta frequência

if __name__ == "__main__":
    start_bridge()
