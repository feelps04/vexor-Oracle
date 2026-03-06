#!/usr/bin/env python3
"""
MT5 Real-time Collector - Coleta dados em tempo real do MT5
Envia via WebSocket para a API e frontend
"""
import MetaTrader5 as mt5
import json
import csv
import os
import asyncio
import websockets
from datetime import datetime, timedelta
from threading import Thread
import time

# Configuração
PEPPERSTONE_PATH = r"C:\Program Files\Pepperstone MetaTrader 5\terminal64.exe"
GENIAL_PATH = r"C:\Users\Bete\Desktop\migracao\genial\terminal64.exe"
CSV_PATH = r"C:\Users\Bete\Desktop\projeto-sentinel\sectors_symbols.csv"
OUTPUT_PRICES = r"C:\Users\Bete\Desktop\projeto-sentinel\mt5_prices.json"
OUTPUT_CANDLES = r"C:\Users\Bete\Desktop\projeto-sentinel\mt5_candles.json"
WS_PORT = 8765

# Símbolos para monitorar - carregados do CSV
SYMBOLS_FOREX = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", 
                 "NZDUSD", "EURGBP", "EURAUD", "GBPJPY", "EURJPY", "AUDJPY"]
SYMBOLS_ALL = []  # Todos os símbolos do CSV

# Cache de preços e candles
PRICES = {}
CANDLES = {}
CANDLES_1M = {}  # Candles 1 minuto para tempo real
LAST_MINUTE = {}

# WebSocket clients
WS_CLIENTS = set()

def load_all_symbols():
    """Carrega TODOS os símbolos do CSV + Forex"""
    global SYMBOLS_ALL
    symbols = set()
    
    # Forex sempre incluído
    symbols.update(SYMBOLS_FOREX)
    
    # Carregar do CSV
    try:
        with open(CSV_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                sym = row.get('symbol', '').strip().upper()
                if sym:
                    symbols.add(sym)
        print(f"Loaded {len(symbols)} total symbols from CSV + Forex")
    except Exception as e:
        print(f"Error loading CSV: {e}")
    
    SYMBOLS_ALL = list(symbols)
    return SYMBOLS_ALL

def init_mt5():
    """Inicializa conexão com MT5"""
    ok = mt5.initialize(PEPPERSTONE_PATH)
    if ok:
        acct = mt5.account_info()
        if acct:
            print(f"MT5 Connected: {acct.server} (login: {acct.login})")
            return True
    print(f"MT5 Failed: {mt5.last_error()}")
    return False

def subscribe_symbols(symbols):
    """Subscreve aos símbolos para receber ticks"""
    for sym in symbols:
        mt5.symbol_select(sym, True)
    print(f"Subscribed to {len(symbols)} symbols")

def get_tick(symbol):
    """Obtém tick atual do símbolo"""
    tick = mt5.symbol_info_tick(symbol)
    if tick:
        return {
            "symbol": symbol,
            "bid": float(tick.bid) if tick.bid else 0,
            "ask": float(tick.ask) if tick.ask else 0,
            "last": float(tick.last) if tick.last else 0,
            "time": int(tick.time) if tick.time else 0,
            "time_msc": int(tick.time_msc) if tick.time_msc else 0
        }
    return None

def update_candle_1m(symbol, tick):
    """Atualiza candle de 1 minuto com novo tick"""
    global CANDLES_1M, LAST_MINUTE
    
    if not tick or tick["bid"] <= 0:
        return None
    
    # Timestamp arredondado para minuto
    ts = tick["time"]
    minute_ts = (ts // 60) * 60
    price = tick["bid"]  # Usar bid como preço
    
    if symbol not in CANDLES_1M:
        CANDLES_1M[symbol] = []
        LAST_MINUTE[symbol] = 0
    
    # Se é um novo minuto, criar novo candle
    if minute_ts > LAST_MINUTE[symbol]:
        # Salvar candle anterior se existe
        if CANDLES_1M[symbol]:
            # Manter apenas últimos 100 candles
            if len(CANDLES_1M[symbol]) > 100:
                CANDLES_1M[symbol] = CANDLES_1M[symbol][-100:]
        
        # Criar novo candle
        new_candle = {
            "time": minute_ts,
            "open": price,
            "high": price,
            "low": price,
            "close": price
        }
        CANDLES_1M[symbol].append(new_candle)
        LAST_MINUTE[symbol] = minute_ts
    else:
        # Atualizar candle atual
        if CANDLES_1M[symbol]:
            current = CANDLES_1M[symbol][-1]
            current["high"] = max(current["high"], price)
            current["low"] = min(current["low"], price)
            current["close"] = price
    
    return CANDLES_1M[symbol][-1] if CANDLES_1M[symbol] else None

async def broadcast_data(data):
    """Envia dados para todos os clientes WebSocket"""
    if WS_CLIENTS:
        msg = json.dumps(data)
        await asyncio.gather(*[client.send(msg) for client in WS_CLIENTS])

async def ws_handler(websocket, path):
    """Handler para conexões WebSocket"""
    WS_CLIENTS.add(websocket)
    print(f"WS client connected. Total: {len(WS_CLIENTS)}")
    
    try:
        # Enviar estado atual
        await websocket.send(json.dumps({"type": "init", "prices": PRICES, "candles": CANDLES_1M}))
        
        # Manter conexão aberta
        async for msg in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        WS_CLIENTS.discard(websocket)
        print(f"WS client disconnected. Total: {len(WS_CLIENTS)}")

async def ws_server():
    """Inicia servidor WebSocket"""
    async with websockets.serve(ws_handler, "127.0.0.1", WS_PORT):
        print(f"WebSocket server started on port {WS_PORT}")
        await asyncio.Future()  # Run forever

def collect_loop():
    """Loop de coleta de ticks em tempo real de TODOS os símbolos"""
    global SYMBOLS_ALL
    print(f"Starting real-time collection for {len(SYMBOLS_ALL)} symbols...")
    
    # Inicializar candles existentes para todos os símbolos
    initialized = 0
    for sym in SYMBOLS_ALL:
        try:
            rates = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M1, 0, 100)
            if rates is not None and len(rates) > 0:
                CANDLES_1M[sym] = []
                for r in rates:
                    CANDLES_1M[sym].append({
                        "time": int(r["time"]),
                        "open": float(r["open"]),
                        "high": float(r["high"]),
                        "low": float(r["low"]),
                        "close": float(r["close"])
                    })
                LAST_MINUTE[sym] = int(rates[-1]["time"])
                initialized += 1
        except:
            pass
    print(f"Initialized candles for {initialized} symbols")
    
    last_broadcast = time.time()
    last_save = time.time()
    
    while True:
        try:
            # Coletar ticks de TODOS os símbolos
            updates = {}
            for sym in SYMBOLS_ALL:
                tick = get_tick(sym)
                if tick and (tick["bid"] > 0 or tick["ask"] > 0 or tick["last"] > 0):
                    PRICES[sym] = tick
                    
                    # Atualizar candle 1m
                    price = tick["bid"] if tick["bid"] > 0 else tick["ask"]
                    if price > 0:
                        candle = update_candle_1m(sym, {**tick, "bid": price})
                        if candle:
                            updates[sym] = {"tick": tick, "candle": candle}
            
            # Broadcast a cada 500ms
            now = time.time()
            if updates and (now - last_broadcast) > 0.5:
                asyncio.run(broadcast_data({"type": "update", "data": updates}))
                last_broadcast = now
            
            # Salvar candles a cada 30 segundos
            if (now - last_save) > 30:
                with open(OUTPUT_CANDLES, 'w') as f:
                    json.dump(CANDLES_1M, f)
                with open(OUTPUT_PRICES, 'w') as f:
                    json.dump(PRICES, f, indent=2)
                last_save = now
                print(f"Saved {len(PRICES)} prices, {len(CANDLES_1M)} candles")
            
            time.sleep(0.1)  # 100ms entre coletas
            
        except Exception as e:
            print(f"Error in collect loop: {e}")
            time.sleep(1)

async def main():
    print("=" * 60)
    print("MT5 Real-time Collector - ALL Symbols")
    print("=" * 60)
    
    # Carregar TODOS os símbolos do CSV + Forex
    load_all_symbols()
    
    # Inicializar MT5
    if not init_mt5():
        return
    
    # Subscrever TODOS os símbolos
    subscribe_symbols(SYMBOLS_ALL)
    
    # Iniciar loop de coleta em thread separada
    collect_thread = Thread(target=collect_loop, daemon=True)
    collect_thread.start()
    
    # Iniciar servidor WebSocket
    await ws_server()

if __name__ == "__main__":
    asyncio.run(main())
