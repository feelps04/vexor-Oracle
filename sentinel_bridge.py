import socket
import json
import time

def stream_to_sentinel():
    UDP_IP = "127.0.0.1"
    UDP_PORT = 9300
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    print("🚀 SENTINEL PYTHON: Iniciando bomba de dados na 9300...")
    
    while True:
        # Simulando o dado que virá da sua GLOBALRAM/MT5
        # No seu código real, você lerá o sectors_symbols.csv aqui
        mock_data = {
            "symbol": "BTCUSD",
            "bid": 65432.10,
            "ask": 65432.15,
            "timestamp": time.time()
        }
        
        payload = json.dumps({"event": "data", "data": mock_data})
        sock.sendto(payload.encode('utf-8'), (UDP_IP, UDP_PORT))
        
        time.sleep(0.01) # 10ms de intervalo (Alta frequência)

if __name__ == "__main__":
    stream_to_sentinel()
