"""
Sentinel UDP Bridge - Zero-Copy Emitter
Latência <1ms: Python detecta -> UDP emit -> Geckos.io

NÃO é um servidor HTTP. É um canhão UDP que dispara deltas.
"""
import socket
import time
import threading
from datetime import datetime

# orjson é 10x mais rápido que json padrão
try:
    import orjson
    USE_ORJSON = True
except ImportError:
    import json
    orjson = None
    USE_ORJSON = False

# MT5
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

# ── Config ───────────────────────────────────────────────────────────────────
GECKOS_UDP_PORT = 10209  # Porta UDP diferente do TCP Geckos
GECKOS_UDP_HOST = "127.0.0.1"
REFRESH_INTERVAL_MS = 10  # 10ms para latência mínima
PRICE_CHANGE_THRESHOLD = 0.0001  # 0.01% de mudança

# ── UDP Socket (Canhão de Dados) ─────────────────────────────────────────────
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1024 * 1024)  # 1MB buffer

def emit_delta(symbol: str, bid: float, ask: float, exchange: str = "", broker: str = ""):
    """Emite delta via UDP com latência <1ms"""
    packet = {
        "s": symbol,  # symbol
        "b": bid,     # bid
        "a": ask,     # ask
        "e": exchange,  # exchange
        "br": broker,   # broker
        "t": time.time_ns()  # timestamp nanosegundos
    }
    
    if USE_ORJSON:
        data = orjson.dumps(packet)
    else:
        data = json.dumps(packet, separators=(',', ':')).encode()
    
    sock.sendto(data, (GECKOS_UDP_HOST, GECKOS_UDP_PORT))

def emit_batch(deltas: list):
    """Emite lote de deltas em um único pacote UDP"""
    packet = {
        "type": "deltas",
        "items": deltas,
        "t": time.time_ns()
    }
    
    if USE_ORJSON:
        data = orjson.dumps(packet)
    else:
        data = json.dumps(packet, separators=(',', ':')).encode()
    
    sock.sendto(data, (GECKOS_UDP_HOST, GECKOS_UDP_PORT))

# ── MT5 Connections ──────────────────────────────────────────────────────────
CONNECTIONS = {
    "mt5": {"connected": False, "path": r"C:\Program Files\MetaTrader 5\terminal64.exe"},
    "pepperstone": {"connected": False, "path": r"C:\Program Files\Pepperstone MetaTrader 5\terminal64.exe"}
}

def connect_broker(broker: str) -> bool:
    """Conecta ao broker MT5"""
    if not MT5_AVAILABLE:
        return False
    
    path = CONNECTIONS[broker]["path"]
    from pathlib import Path
    if not Path(path).exists():
        return False
    
    mt5.shutdown()
    if mt5.initialize(path=path):
        info = mt5.account_info()
        if info:
            CONNECTIONS[broker]["connected"] = True
            print(f"[Bridge] Conectado: {broker} - {info.login} | {info.server}")
            return True
    return False

# ── Delta Tracker ────────────────────────────────────────────────────────────
previous_prices = {}  # {symbol: (bid, ask)}

def check_delta(symbol: str, bid: float, ask: float) -> bool:
    """Verifica se houve mudança de preço significativa"""
    prev = previous_prices.get(symbol)
    if prev is None:
        previous_prices[symbol] = (bid, ask)
        return True  # Primeira vez, emite
    
    old_bid = prev[0]
    if abs(bid - old_bid) / old_bid > PRICE_CHANGE_THRESHOLD:
        previous_prices[symbol] = (bid, ask)
        return True
    
    return False

# ── Main Loop (Zero-Copy Emitter) ─────────────────────────────────────────────
running = True

def main_loop():
    """Loop principal de emissão de deltas"""
    global running
    
    # Símbolos BOVESPA (Genial)
    bovespa_symbols = ["PETR4", "VALE3", "ITUB4", "BBDC4", "ABEV3", "WEGE3", "RENT3", "MGLU3"]
    
    # Símbolos Pepperstone (Forex/Índices/Commodities)
    pepperstone_symbols = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"]
    index_symbols = ["US500", "US30", "US100", "GER40", "UK100"]
    commodity_symbols = ["XAUUSD", "XAGUSD", "USOIL", "NATGAS"]
    
    print(f"[Bridge] Iniciando emissão UDP para {GECKOS_UDP_HOST}:{GECKOS_UDP_PORT}")
    print(f"[Bridge] Intervalo: {REFRESH_INTERVAL_MS}ms | Serialização: {'orjson' if USE_ORJSON else 'json'}")
    
    while running:
        try:
            deltas = []
            
            # BOVESPA via Genial
            if CONNECTIONS["mt5"]["connected"] and MT5_AVAILABLE:
                for sym in bovespa_symbols:
                    try:
                        tick = mt5.symbol_info_tick(sym)
                        if tick and tick.bid > 0:
                            if check_delta(sym, tick.bid, tick.ask):
                                deltas.append({
                                    "s": sym, "b": tick.bid, "a": tick.ask,
                                    "e": "BOVESPA", "br": "genial"
                                })
                    except:
                        pass
            
            # Pepperstone (Forex/Índices/Commodities)
            if CONNECTIONS["pepperstone"]["connected"] and MT5_AVAILABLE:
                # Reconecta ao Pepperstone
                mt5.shutdown()
                mt5.initialize(path=CONNECTIONS["pepperstone"]["path"])
                
                for sym in pepperstone_symbols + index_symbols + commodity_symbols:
                    try:
                        tick = mt5.symbol_info_tick(sym)
                        if tick and tick.bid > 0:
                            exchange = "FOREX" if sym in pepperstone_symbols else \
                                       "INDEX" if sym in index_symbols else "COMMODITIES"
                            if check_delta(sym, tick.bid, tick.ask):
                                deltas.append({
                                    "s": sym, "b": tick.bid, "a": tick.ask,
                                    "e": exchange, "br": "pepperstone"
                                })
                    except:
                        pass
                
                # Volta para Genial
                mt5.shutdown()
                mt5.initialize(path=CONNECTIONS["mt5"]["path"])
            
            # Emite deltas se houver mudanças
            if deltas:
                emit_batch(deltas)
                print(f"[Bridge] Emitidos {len(deltas)} deltas")
            
        except Exception as e:
            print(f"[Bridge] Erro: {e}")
        
        time.sleep(REFRESH_INTERVAL_MS / 1000.0)

# ── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("Sentinel UDP Bridge - Zero-Copy Emitter")
    print("=" * 60)
    
    # Conecta aos brokers
    connect_broker("mt5")
    connect_broker("pepperstone")
    
    # Inicia loop em background
    loop_thread = threading.Thread(target=main_loop, daemon=True)
    loop_thread.start()
    
    print("[Bridge] Pressione Ctrl+C para parar")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        running = False
        print("\n[Bridge] Parado.")
        sock.close()
        if MT5_AVAILABLE:
            mt5.shutdown()
