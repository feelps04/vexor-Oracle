import websocket
import json
import time

try:
    ws = websocket.create_connection('ws://127.0.0.1:9002/ws/stocks?mode=feed', timeout=5, subprotocols=['json'])
    print("Connected!")
    
    # Send set_symbols
    msg = json.dumps({"type": "set_symbols", "symbols": ["PETR4", "VALE3"]})
    ws.send(msg)
    print(f"Sent: {msg}")
    
    # Receive messages
    for i in range(3):
        try:
            result = ws.recv()
            if result:
                data = json.loads(result)
                print(f"Received [{i}]: {json.dumps(data, indent=2)[:500]}")
        except Exception as e:
            print(f"Error receiving: {e}")
        time.sleep(0.5)
    
    ws.close()
    print("Closed")
except Exception as e:
    print(f"Connection error: {e}")
