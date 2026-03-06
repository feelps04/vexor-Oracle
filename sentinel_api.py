#!/usr/bin/env python3
"""
Sentinel API — Servidor local para conectar Dashboard → MetaTrader 5 / Pepperstone
Porta: 8765
"""

import csv
import json
import logging
import struct
import ctypes
from ctypes import wintypes
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    print("[WARN] MetaTrader5 não disponível — instale: pip install MetaTrader5")

# MMF Constants
MMF_RECORD_BYTES = 128
MMF_B3_SLOTS = 8192
MMF_GLOBAL_SLOTS = 16384

# MMF Offsets (from MQ5 scripts)
MMF_BID_OFF = 0
MMF_ASK_OFF = 8
MMF_VOL_OFF = 16
MMF_TS_OFF = 24
MMF_ANO_OFF = 32
MMF_HB_OFF = 36
MMF_WF_OFF = 40
MMF_SYM_OFF = 44
MMF_SYM_BYTES = 16

# Windows API for MMF
kernel32 = ctypes.windll.kernel32
OpenFileMappingW = kernel32.OpenFileMappingW
OpenFileMappingW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
OpenFileMappingW.restype = wintypes.HANDLE

MapViewOfFile = kernel32.MapViewOfFile
MapViewOfFile.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_size_t]
MapViewOfFile.restype = wintypes.LPVOID

UnmapViewOfFile = kernel32.UnmapViewOfFile
UnmapViewOfFile.argtypes = [wintypes.LPCVOID]
UnmapViewOfFile.restype = wintypes.BOOL

CloseHandle = kernel32.CloseHandle
CloseHandle.argtypes = [wintypes.HANDLE]
CloseHandle.restype = wintypes.BOOL

FILE_MAP_READ = 0x0004

# MMF Readers state
MMF_B3_HANDLE = None
MMF_B3_PTR = None
MMF_GLOBAL_HANDLE = None
MMF_GLOBAL_PTR = None

def mmf_connect(name: str, slots: int):
    """Connect to MMF and return (handle, pointer)"""
    try:
        hMap = OpenFileMappingW(FILE_MAP_READ, False, name)
        if not hMap:
            return None, None
        size = slots * MMF_RECORD_BYTES
        ptr = MapViewOfFile(hMap, FILE_MAP_READ, 0, 0, size)
        if not ptr:
            CloseHandle(hMap)
            return None, None
        return hMap, ptr
    except Exception as e:
        log.warning("MMF connect error [%s]: %s", name, e)
        return None, None

def mmf_init():
    """Initialize MMF readers for B3RAM and GLOBALRAM"""
    global MMF_B3_HANDLE, MMF_B3_PTR, MMF_GLOBAL_HANDLE, MMF_GLOBAL_PTR
    
    MMF_B3_HANDLE, MMF_B3_PTR = mmf_connect("Local\\B3RAM", MMF_B3_SLOTS)
    if MMF_B3_PTR:
        log.info("MMF B3RAM conectado (%d slots)", MMF_B3_SLOTS)
    else:
        log.warning("MMF B3RAM não encontrado - execute Sentinel_RAM.mq5 no MT5")
    
    MMF_GLOBAL_HANDLE, MMF_GLOBAL_PTR = mmf_connect("Local\\GLOBALRAM", MMF_GLOBAL_SLOTS)
    if MMF_GLOBAL_PTR:
        log.info("MMF GLOBALRAM conectado (%d slots)", MMF_GLOBAL_SLOTS)
    else:
        log.warning("MMF GLOBALRAM não encontrado - execute SentinelEuropa_RAM.mq5 no MT5")

def mmf_read_slot(ptr, slot: int):
    """Read a single slot from MMF, return dict or None"""
    if not ptr:
        return None
    try:
        offset = slot * MMF_RECORD_BYTES
        # Criar buffer para ler da memória
        buf = (ctypes.c_ubyte * MMF_RECORD_BYTES)()
        ctypes.memmove(buf, ptr + offset, MMF_RECORD_BYTES)
        
        # Read write_flag first (offset 40)
        wf = struct.unpack_from('<i', buf, MMF_WF_OFF)[0]
        if wf != 0:  # Being written
            return None
        
        # Read data
        bid = struct.unpack_from('<d', buf, MMF_BID_OFF)[0]
        ask = struct.unpack_from('<d', buf, MMF_ASK_OFF)[0]
        vol = struct.unpack_from('<q', buf, MMF_VOL_OFF)[0]
        ts = struct.unpack_from('<q', buf, MMF_TS_OFF)[0]
        hb = struct.unpack_from('<i', buf, MMF_HB_OFF)[0]
        
        # Read symbol (16 bytes, null-terminated)
        sym_bytes = bytes(buf[MMF_SYM_OFF:MMF_SYM_OFF + MMF_SYM_BYTES])
        symbol = sym_bytes.split(b'\x00')[0].decode('ascii', errors='ignore')
        
        if bid <= 0 and ask <= 0:
            return None
        
        if not symbol:
            return None
        
        return {
            "symbol": symbol,
            "bid": bid,
            "ask": ask,
            "volume": vol,
            "timestamp": ts,
            "heartbeat": hb,
        }
    except Exception as e:
        log.debug("MMF read error slot %d: %s", slot, e)
        return None

def mmf_read_all(ptr, slots: int, source: str):
    """Read all slots from MMF, return dict of symbol -> tick"""
    if not ptr:
        return {}
    
    result = {}
    for slot in range(slots):
        tick = mmf_read_slot(ptr, slot)
        if tick and tick["symbol"]:
            tick["source"] = source
            result[tick["symbol"]] = tick
    return result

def mmf_get_tick(symbol: str):
    """Get tick for a symbol from MMF (search both B3 and Global)"""
    # Search B3RAM
    if MMF_B3_PTR:
        for slot in range(MMF_B3_SLOTS):
            tick = mmf_read_slot(MMF_B3_PTR, slot)
            if tick and tick["symbol"] == symbol:
                tick["source"] = "b3"
                return tick
    
    # Search GLOBALRAM
    if MMF_GLOBAL_PTR:
        for slot in range(MMF_GLOBAL_SLOTS):
            tick = mmf_read_slot(MMF_GLOBAL_PTR, slot)
            if tick and tick["symbol"] == symbol:
                tick["source"] = "global"
                return tick
    
    return None

def mmf_get_ticks_batch(symbols: list):
    """Get ticks for multiple symbols from MMF"""
    result = {}
    for sym in symbols:
        tick = mmf_get_tick(sym)
        if tick:
            result[sym] = tick
    return result

HOST = "localhost"
PORT = 8765
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("sentinel_api")

def load_csv():
    script_dir = Path(__file__).parent
    candidates = [
        script_dir / "sectors_symbols.csv",
        script_dir / ".." / "sectors_symbols.csv",
        Path("sectors_symbols.csv"),
    ]
    for path in candidates:
        if path.exists():
            log.info("Carregando CSV: %s", path)
            rows = []
            with open(path, encoding="utf-8-sig", newline="") as f:
                for row in csv.DictReader(f):
                    rows.append({k.strip(): v.strip() for k, v in row.items()})
            log.info("CSV carregado: %d ativos em %d setores", len(rows),
                     len({r["sector_id"] for r in rows}))
            return rows
    log.warning("sectors_symbols.csv NÃO encontrado.")
    return []

ASSETS = load_csv()

SECTORS, BY_SECTOR, BY_EXCHANGE, BY_TYPE = {}, {}, {}, {}
for a in ASSETS:
    sid = a["sector_id"]
    SECTORS[sid] = a["sector_name"]
    BY_SECTOR.setdefault(sid, []).append(a)
    BY_EXCHANGE.setdefault(a["exchange"], []).append(a)
    BY_TYPE.setdefault(a["type"], []).append(a)

log.info("Índices: %d setores | %d exchanges | %d tipos",
         len(SECTORS), len(BY_EXCHANGE), len(BY_TYPE))

# Inicializar MMF (memória compartilhada do MT5)
mmf_init()

CONNECTIONS = {
    "mt5":         {"connected": False, "account": None},
    "pepperstone": {"connected": False, "account": None},
}

PEPP_MAP = {
    "IBOV":"IBOVESPA","SPX":"SP500","NDX":"NAS100","DJI":"US30","DAX":"GER40",
    "FTSE":"UK100","CAC40":"FRA40","NIKKEI":"JPN225","HSI":"HK50","RUT":"US2000",
    "VIX":"VIX","GC":"XAUUSD","SI":"XAGUSD","CL":"USOIL","BZ":"UKOIL",
    "NG":"NATGAS","HG":"COPPER",
    "BTC":"BTCUSD","ETH":"ETHUSD","XRP":"XRPUSD","SOL":"SOLUSD","BNB":"BNBUSD",
    "ADA":"ADAUSD","DOGE":"DOGEUSD","LINK":"LINKUSD","LTC":"LTCUSD","DOT":"DOTUSD",
    "AVAX":"AVAXUSD","MATIC":"MATICUSD","ATOM":"ATOMUSD","UNI":"UNIUSD",
    "TRX":"TRXUSD","XLM":"XLMUSD","BCH":"BCHUSD","NEAR":"NEARUSD",
}

def resolve_symbol(symbol, broker):
    return PEPP_MAP.get(symbol, symbol) if broker == "pepperstone" else symbol

def get_tf(tf_str):
    if not MT5_AVAILABLE:
        return None
    tf_map = {
        "M1":mt5.TIMEFRAME_M1,"M5":mt5.TIMEFRAME_M5,"M15":mt5.TIMEFRAME_M15,
        "M30":mt5.TIMEFRAME_M30,"H1":mt5.TIMEFRAME_H1,"H4":mt5.TIMEFRAME_H4,
        "D1":mt5.TIMEFRAME_D1,"W1":mt5.TIMEFRAME_W1,"MN1":mt5.TIMEFRAME_MN1,
    }
    return tf_map.get(tf_str.upper(), mt5.TIMEFRAME_H1)

def mt5_connect(login, password, server, path=None, broker="mt5"):
    if not MT5_AVAILABLE:
        return {"error": "MetaTrader5 não instalado. Execute: pip install MetaTrader5"}
    if not isinstance(login, int) or login <= 0:
        return {"error": "Login inválido — deve ser número inteiro positivo."}
    kwargs = {"login": login, "password": password, "server": server}
    if path:
        kwargs["path"] = path
    if not mt5.initialize(**kwargs):
        return {"error": f"Falha ao inicializar MT5: {mt5.last_error()}"}
    info = mt5.account_info()
    if info is None:
        mt5.shutdown()
        return {"error": f"Conta não encontrada: {mt5.last_error()}"}
    CONNECTIONS[broker]["connected"] = True
    CONNECTIONS[broker]["account"] = f"{info.login} | {info.name} | {info.currency} | {info.server}"
    log.info("Connected [%s] %s", broker, CONNECTIONS[broker]["account"])
    return {"ok": True, "account": CONNECTIONS[broker]["account"]}

def mt5_disconnect(broker="mt5"):
    if MT5_AVAILABLE:
        mt5.shutdown()
    CONNECTIONS[broker]["connected"] = False
    CONNECTIONS[broker]["account"] = None
    return {"ok": True}

def mt5_tick(symbol, broker="mt5"):
    # Primeiro tenta ler da MMF (mais rápido)
    mmf_tick = mmf_get_tick(symbol)
    if mmf_tick:
        spread = round((mmf_tick["ask"] - mmf_tick["bid"]) * 10000, 2) if mmf_tick["ask"] and mmf_tick["bid"] else None
        return {
            "symbol": symbol,
            "bid": mmf_tick["bid"],
            "ask": mmf_tick["ask"],
            "last": mmf_tick["bid"],
            "volume": mmf_tick["volume"],
            "spread": spread,
            "time": datetime.fromtimestamp(mmf_tick["timestamp"] / 1000).strftime("%Y-%m-%d %H:%M:%S") if mmf_tick["timestamp"] else None,
            "source": mmf_tick["source"],
        }
    
    # Fallback para MT5 direto
    if not MT5_AVAILABLE:
        return {"error": "MetaTrader5 não disponível e símbolo não encontrado na MMF"}
    if not CONNECTIONS[broker]["connected"]:
        return {"error": f"Não conectado ao broker [{broker}] e símbolo não encontrado na MMF"}
    mt5_sym = resolve_symbol(symbol, broker)
    info = mt5.symbol_info(mt5_sym)
    if info is None:
        return {"error": f"Símbolo '{mt5_sym}' não encontrado"}
    if not info.visible:
        mt5.symbol_select(mt5_sym, True)
    tick = mt5.symbol_info_tick(mt5_sym)
    if tick is None:
        return {"error": f"Sem tick para '{mt5_sym}'"}
    spread = round((tick.ask - tick.bid) * 10000, 2) if tick.ask and tick.bid else None
    return {
        "symbol": symbol, "mt5_symbol": mt5_sym,
        "bid": tick.bid, "ask": tick.ask, "last": tick.last,
        "volume": tick.volume, "spread": spread,
        "time": datetime.fromtimestamp(tick.time).strftime("%Y-%m-%d %H:%M:%S"),
    }

def mt5_ticks_batch(symbols, broker="mt5"):
    # Primeiro tenta MMF
    mmf_ticks = mmf_get_ticks_batch(symbols)
    if mmf_ticks:
        result = {}
        for sym, t in mmf_ticks.items():
            spread = round((t["ask"] - t["bid"]) * 10000, 2) if t["ask"] and t["bid"] else None
            result[sym] = {
                "symbol": sym,
                "bid": t["bid"],
                "ask": t["ask"],
                "last": t["bid"],
                "volume": t["volume"],
                "spread": spread,
                "time": datetime.fromtimestamp(t["timestamp"] / 1000).strftime("%Y-%m-%d %H:%M:%S") if t["timestamp"] else None,
                "source": t["source"],
            }
        return {"ticks": result, "errors": [], "count": len(result)}
    
    # Fallback para MT5
    if not MT5_AVAILABLE:
        return {"error": "MetaTrader5 não disponível"}
    if not CONNECTIONS[broker]["connected"]:
        return {"error": f"Não conectado ao broker [{broker}]"}
    result, errors = {}, []
    for sym in symbols:
        r = mt5_tick(sym, broker)
        if "error" in r:
            errors.append({"symbol": sym, "error": r["error"]})
        else:
            result[sym] = r
    return {"ticks": result, "errors": errors, "count": len(result)}

def mt5_ticks_sector(sector_id, broker="mt5"):
    if not CONNECTIONS[broker]["connected"]:
        return {"error": f"Não conectado ao broker [{broker}]"}
    assets = BY_SECTOR.get(sector_id, [])
    if not assets:
        return {"error": f"Setor '{sector_id}' não encontrado"}
    symbols = list({a["symbol"] for a in assets})
    log.info("Setor %s: buscando %d símbolos [%s]", sector_id, len(symbols), broker)
    result = mt5_ticks_batch(symbols, broker)
    result["sector_id"] = sector_id
    result["sector_name"] = SECTORS.get(sector_id, "")
    result["total_symbols"] = len(symbols)
    return result

def mt5_ticks_all(broker="mt5", exchange=None, sector_id=None, asset_type=None, limit=0):
    if not CONNECTIONS[broker]["connected"]:
        return {"error": f"Não conectado ao broker [{broker}]"}
    pool = ASSETS
    if exchange:
        pool = [a for a in pool if a["exchange"] == exchange]
    if sector_id:
        pool = [a for a in pool if a["sector_id"] == sector_id]
    if asset_type:
        pool = [a for a in pool if a["type"] == asset_type]
    seen, symbols = set(), []
    for a in pool:
        if a["symbol"] not in seen:
            seen.add(a["symbol"])
            symbols.append(a["symbol"])
    if limit > 0:
        symbols = symbols[:limit]
    total = len(symbols)
    log.info("ticks/all: %d símbolos únicos (ex=%s sec=%s type=%s) [%s]",
             total, exchange, sector_id, asset_type, broker)
    result, errors = {}, []
    for sym in symbols:
        r = mt5_tick(sym, broker)
        if "error" in r:
            errors.append({"symbol": sym, "error": r["error"]})
        else:
            result[sym] = r
    return {
        "ticks": result, "errors": errors,
        "count": len(result), "total_requested": total, "failed": len(errors),
        "filters": {"exchange": exchange, "sector_id": sector_id,
                    "type": asset_type, "limit": limit},
    }

def list_symbols(broker="mt5"):
    if not MT5_AVAILABLE:
        return {"error": "MetaTrader5 não disponível"}
    if not CONNECTIONS[broker]["connected"]:
        return {"error": f"Não conectado ao broker [{broker}]"}
    syms = mt5.symbols_get()
    if syms is None:
        return {"error": "Não foi possível listar símbolos"}
    return {"count": len(syms),
            "symbols": [{"name":s.name,"description":s.description,
                          "visible":s.visible,"bid":s.bid,"ask":s.ask} for s in syms]}

def get_sectors():
    sectors = []
    for sid, name in sorted(SECTORS.items()):
        assets = BY_SECTOR.get(sid, [])
        sectors.append({
            "sector_id": sid, "sector_name": name, "count": len(assets),
            "exchanges": sorted({a["exchange"] for a in assets}),
            "types": sorted({a["type"] for a in assets}),
        })
    return {"count": len(sectors), "sectors": sectors}

def get_assets(sector_id=None, exchange=None, asset_type=None, search=None, page=0, page_size=0):
    pool = ASSETS
    if sector_id:  pool = [a for a in pool if a["sector_id"] == sector_id]
    if exchange:   pool = [a for a in pool if a["exchange"] == exchange]
    if asset_type: pool = [a for a in pool if a["type"] == asset_type]
    if search:
        q = search.lower()
        pool = [a for a in pool if q in a["symbol"].lower() or q in a["description"].lower()]
    total = len(pool)
    if page_size > 0:
        pool = pool[page * page_size: page * page_size + page_size]
    return {"total": total, "count": len(pool), "assets": pool}

class SentinelHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        log.info(fmt, *args)

    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        p = lambda k, d=None: qs.get(k, [d])[0]

        if path == "/status":
            self._json({
                "mt5": CONNECTIONS["mt5"]["connected"],
                "pepperstone": CONNECTIONS["pepperstone"]["connected"],
                "mt5_account": CONNECTIONS["mt5"]["account"],
                "pp_account": CONNECTIONS["pepperstone"]["account"],
                "mt5_available": MT5_AVAILABLE,
                "csv_loaded": len(ASSETS) > 0,
                "total_assets": len(ASSETS),
                "total_sectors": len(SECTORS),
            })
        elif path == "/sectors":
            self._json(get_sectors())
        elif path.startswith("/sectors/") and path.endswith("/symbols"):
            # /sectors/{sector_id}/symbols
            sector_id = path.split("/")[2]
            assets = BY_SECTOR.get(sector_id, [])
            self._json({"sector_id": sector_id, "total": len(assets), 
                        "symbols": [{"symbol": a["symbol"], "exchange": a["exchange"], 
                                     "description": a.get("description", "")} for a in assets]})
        elif path == "/symbols":
            # All symbols
            self._json({"total": len(ASSETS), 
                        "symbols": [{"symbol": a["symbol"], "sector_id": a["sector_id"]} for a in ASSETS]})
        elif path == "/sectors/quotes":
            # Bulk quotes for sectors
            limit = int(p("limit") or 25)
            sectors_quotes = []
            for sid in sorted(SECTORS.keys()):
                assets = BY_SECTOR.get(sid, [])[:limit]
                items = []
                for a in assets:
                    items.append({
                        "symbol": a["symbol"],
                        "exchange": a["exchange"],
                        "priceBRL": None,
                        "status": "no_data"
                    })
                sectors_quotes.append({"sectorId": sid, "total": len(BY_SECTOR.get(sid, [])), "items": items})
            self._json({"limit": limit, "sectors": sectors_quotes})
        elif path == "/assets":
            self._json(get_assets(
                sector_id=p("sector"), exchange=p("exchange"),
                asset_type=p("type"), search=p("q"),
                page=int(p("page") or 0), page_size=int(p("size") or 0),
            ))
        elif path == "/assets/count":
            self._json({"total": len(ASSETS), "by_sector": {s: len(v) for s, v in BY_SECTOR.items()}})
        elif path == "/mmf/debug":
            # Debug MMF - mostra primeiros símbolos encontrados
            b3_symbols = []
            global_symbols = []
            if MMF_B3_PTR:
                for slot in range(min(100, MMF_B3_SLOTS)):
                    tick = mmf_read_slot(MMF_B3_PTR, slot)
                    if tick and tick["symbol"]:
                        b3_symbols.append({"slot": slot, "symbol": tick["symbol"], "bid": tick["bid"], "ask": tick["ask"]})
            if MMF_GLOBAL_PTR:
                for slot in range(min(100, MMF_GLOBAL_SLOTS)):
                    tick = mmf_read_slot(MMF_GLOBAL_PTR, slot)
                    if tick and tick["symbol"]:
                        global_symbols.append({"slot": slot, "symbol": tick["symbol"], "bid": tick["bid"], "ask": tick["ask"]})
            self._json({
                "b3_connected": MMF_B3_PTR is not None,
                "global_connected": MMF_GLOBAL_PTR is not None,
                "b3_symbols": b3_symbols[:20],
                "global_symbols": global_symbols[:20],
                "b3_count": len(b3_symbols),
                "global_count": len(global_symbols),
            })
        elif path == "/mmf/simulate":
            # Simular ticks para teste quando MQ5 não está rodando
            import random
            simulated = {}
            for a in ASSETS[:50]:  # Simular 50 primeiros ativos
                sym = a["symbol"]
                base = random.uniform(10, 100)
                spread = random.uniform(0.01, 0.05)
                simulated[sym] = {
                    "symbol": sym,
                    "bid": round(base, 2),
                    "ask": round(base + spread, 2),
                    "last": round(base, 2),
                    "volume": random.randint(1000, 100000),
                    "spread": round(spread * 10000, 2),
                    "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "source": "simulated",
                }
            self._json({"simulated": len(simulated), "ticks": simulated})
        elif path == "/":
            self._html("<h1>Sentinel API - 1901 ativos</h1>")
        else:
            self._json({"error": "Not found"}, 404)

    def do_POST(self):
        b = self._read_body()
        path = urlparse(self.path).path
        routes = {
            "/mt5/connect":            lambda: mt5_connect(b.get("login",0), b.get("password",""), b.get("server",""), b.get("path"), "mt5"),
            "/mt5/disconnect":         lambda: mt5_disconnect("mt5"),
            "/pepperstone/connect":    lambda: mt5_connect(b.get("login",0), b.get("password",""), b.get("server","Pepperstone-MT5"), b.get("path"), "pepperstone"),
            "/pepperstone/disconnect": lambda: mt5_disconnect("pepperstone"),
            "/tick":                   lambda: mt5_tick(b.get("symbol",""), b.get("broker","mt5")),
            "/ticks/batch":            lambda: mt5_ticks_batch(b.get("symbols",[]), b.get("broker","mt5")),
            "/ticks/sector":           lambda: mt5_ticks_sector(b.get("sector_id",""), b.get("broker","mt5")),
            "/ticks/all":              lambda: mt5_ticks_all(b.get("broker","mt5"), b.get("exchange"), b.get("sector_id"), b.get("type"), int(b.get("limit",0))),
            "/symbols/list":           lambda: list_symbols(b.get("broker","mt5")),
        }
        fn = routes.get(path)
        if fn:
            try:
                self._json(fn())
            except Exception as e:
                self._json({"error": str(e)}, 500)
        else:
            self._json({"error": f"Endpoint não encontrado: {path}"}, 404)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except Exception:
            return {}

    def _json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors(); self.end_headers()
        self.wfile.write(payload)

    def _html(self, html):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self._cors(); self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), SentinelHandler)
    log.info("=" * 60)
    log.info("Sentinel API  http://%s:%d", HOST, PORT)
    log.info("MT5 disponível: %s", MT5_AVAILABLE)
    log.info("CSV: %d ativos | %d setores", len(ASSETS), len(SECTORS))
    log.info("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Servidor parado.")
        server.server_close()
