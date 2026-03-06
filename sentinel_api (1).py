#!/usr/bin/env python3
"""
Sentinel API — Servidor local para conectar Dashboard → MetaTrader 5 / Pepperstone
Porta: 8765
Uso:   python sentinel_api.py

Requer:  pip install MetaTrader5 pandas
OS:      Windows (MetaTrader5 só funciona no Windows)

Endpoints GET:
  /status           → estado das conexões + stats do CSV
  /sectors          → lista todos os 52 setores
  /assets           → todos os 1901 ativos (query: sector, exchange, type, q, page, size)
  /assets/count     → contagem por setor/tipo/exchange

Endpoints POST:
  /mt5/connect | /mt5/disconnect
  /pepperstone/connect | /pepperstone/disconnect
  /tick              { symbol, broker }
  /ticks/batch       { symbols:[], broker }
  /ticks/sector      { sector_id, broker }        ← TODOS ativos de um setor
  /ticks/all         { broker, exchange?, sector_id?, type?, limit? }  ← TODOS 1901
  /ohlcv             { symbol, timeframe, count, broker }
  /symbol/info       { symbol, broker }
  /symbols/list      { broker }
"""

import csv
import json
import logging
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd

# ── Windows-only MT5 import ──────────────────────────────────────────────────
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    print("[WARN] MetaTrader5 não disponível — instale: pip install MetaTrader5")

# ── Config ───────────────────────────────────────────────────────────────────
HOST = "localhost"
PORT = 8765
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("sentinel_api")

# ── Carregar CSV ──────────────────────────────────────────────────────────────
def load_csv():
    script_dir = Path(__file__).parent
    candidates = [
        script_dir / "sectors_symbols.csv",
        script_dir / "projeto-sentinel" / "sectors_symbols.csv",
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

# ── Índices auxiliares ────────────────────────────────────────────────────────
SECTORS, BY_SECTOR, BY_EXCHANGE, BY_TYPE = {}, {}, {}, {}
for a in ASSETS:
    sid = a["sector_id"]
    SECTORS[sid] = a["sector_name"]
    BY_SECTOR.setdefault(sid, []).append(a)
    BY_EXCHANGE.setdefault(a["exchange"], []).append(a)
    BY_TYPE.setdefault(a["type"], []).append(a)

log.info("Índices: %d setores | %d exchanges | %d tipos",
         len(SECTORS), len(BY_EXCHANGE), len(BY_TYPE))

# ── State ────────────────────────────────────────────────────────────────────
CONNECTIONS = {
    "mt5":         {"connected": False, "account": None},
    "pepperstone": {"connected": False, "account": None},
}

# ── Pepperstone symbol map ────────────────────────────────────────────────────
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

# ── MT5 Operations ────────────────────────────────────────────────────────────
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
    if not MT5_AVAILABLE:
        return {"error": "MetaTrader5 não disponível"}
    if not CONNECTIONS[broker]["connected"]:
        return {"error": f"Não conectado ao broker [{broker}]"}
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

def mt5_ohlcv(symbol, timeframe="H1", count=100, broker="mt5"):
    if not MT5_AVAILABLE:
        return {"error": "MetaTrader5 não disponível"}
    if not CONNECTIONS[broker]["connected"]:
        return {"error": f"Não conectado ao broker [{broker}]"}
    mt5_sym = resolve_symbol(symbol, broker)
    tf = get_tf(timeframe)
    info = mt5.symbol_info(mt5_sym)
    if info is None:
        return {"error": f"Símbolo '{mt5_sym}' não encontrado"}
    if not info.visible:
        mt5.symbol_select(mt5_sym, True)
    rates = mt5.copy_rates_from_pos(mt5_sym, tf, 0, count)
    if rates is None or len(rates) == 0:
        return {"error": f"Sem dados OHLCV para '{mt5_sym}' [{timeframe}]"}
    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"], unit="s").dt.strftime("%Y-%m-%d %H:%M")
    data = [{"time":r["time"],"open":r["open"],"high":r["high"],"low":r["low"],
              "close":r["close"],"volume":r["tick_volume"],"spread":r.get("spread")}
            for r in df.to_dict("records")]
    return {"symbol": symbol, "mt5_symbol": mt5_sym, "timeframe": timeframe,
            "count": len(data), "data": data}

def mt5_symbol_info(symbol, broker="mt5"):
    if not MT5_AVAILABLE:
        return {"error": "MetaTrader5 não disponível"}
    if not CONNECTIONS[broker]["connected"]:
        return {"error": f"Não conectado ao broker [{broker}]"}
    mt5_sym = resolve_symbol(symbol, broker)
    info = mt5.symbol_info(mt5_sym)
    if info is None:
        return {"error": f"Símbolo '{mt5_sym}' não encontrado"}
    return {
        "symbol": symbol, "mt5_symbol": mt5_sym,
        "name": info.name, "description": info.description,
        "currency_base": info.currency_base, "currency_profit": info.currency_profit,
        "digits": info.digits, "point": info.point,
        "trade_contract_size": info.trade_contract_size,
        "volume_min": info.volume_min, "volume_max": info.volume_max,
        "bid": info.bid, "ask": info.ask, "visible": info.visible,
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

# ── Assets / Sectors queries ──────────────────────────────────────────────────
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

def get_assets(sector_id=None, exchange=None, asset_type=None,
               search=None, page=0, page_size=0):
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

def get_assets_count():
    return {
        "total": len(ASSETS),
        "by_sector":   {s: len(v) for s, v in BY_SECTOR.items()},
        "by_exchange": {e: len(v) for e, v in BY_EXCHANGE.items()},
        "by_type":     {t: len(v) for t, v in BY_TYPE.items()},
    }

# ── HTTP Handler ──────────────────────────────────────────────────────────────
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
        elif path == "/assets":
            self._json(get_assets(
                sector_id=p("sector"), exchange=p("exchange"),
                asset_type=p("type"), search=p("q"),
                page=int(p("page") or 0), page_size=int(p("size") or 0),
            ))
        elif path == "/assets/count":
            self._json(get_assets_count())
        elif path == "/":
            self._html(INDEX_PAGE)
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
            "/ticks/all":              lambda: mt5_ticks_all(
                                           broker=b.get("broker","mt5"),
                                           exchange=b.get("exchange"),
                                           sector_id=b.get("sector_id"),
                                           asset_type=b.get("type"),
                                           limit=int(b.get("limit",0))),
            "/ohlcv":                  lambda: mt5_ohlcv(b.get("symbol",""), b.get("timeframe","H1"), int(b.get("count",100)), b.get("broker","mt5")),
            "/symbol/info":            lambda: mt5_symbol_info(b.get("symbol",""), b.get("broker","mt5")),
            "/symbols/list":           lambda: list_symbols(b.get("broker","mt5")),
        }
        fn = routes.get(path)
        if fn:
            try:
                self._json(fn())
            except Exception as e:
                log.exception("Handler error")
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
        self.send_header("Content-Length", len(payload))
        self._cors(); self.end_headers()
        self.wfile.write(payload)

    def _html(self, html, status=200):
        payload = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(payload))
        self._cors(); self.end_headers()
        self.wfile.write(payload)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


INDEX_PAGE = """<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Sentinel API</title>
<style>
body{font-family:monospace;background:#080a0e;color:#dde2ef;padding:40px;line-height:1.8;max-width:1100px}
h1{color:#00e5a0}h2{color:#4d9fff;margin-top:28px}h3{color:#ff6535;margin-top:16px}
code{background:#151821;border:1px solid #1c2030;padding:2px 8px;border-radius:4px;color:#00e5a0}
pre{background:#151821;border:1px solid #1c2030;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #1c2030;padding:6px 12px;text-align:left}
th{background:#151821;color:#4d9fff}
</style></head><body>
<h1>🛡 Sentinel API &mdash; localhost:8765</h1>
<p>Servidor ativo. CSV: <strong>1901 ativos</strong> em <strong>52 setores</strong>.</p>
<h2>GET</h2>
<pre>GET /status
GET /sectors
GET /assets[?sector=sector_001&exchange=BOVESPA&type=Ação&q=PETR&page=0&size=100]
GET /assets/count</pre>
<h2>POST</h2>
<table>
<tr><th>Endpoint</th><th>Body</th><th>Retorno</th></tr>
<tr><td>POST /mt5/connect</td><td>{login, password, server, path?}</td><td>{ok, account}</td></tr>
<tr><td>POST /mt5/disconnect</td><td>{}</td><td>{ok}</td></tr>
<tr><td>POST /pepperstone/connect</td><td>{login, password, server, path?}</td><td>{ok, account}</td></tr>
<tr><td>POST /pepperstone/disconnect</td><td>{}</td><td>{ok}</td></tr>
<tr><td>POST /tick</td><td>{symbol, broker}</td><td>bid, ask, last, spread, time</td></tr>
<tr><td>POST /ticks/batch</td><td>{symbols:[], broker}</td><td>{ticks:{}, errors:[]}</td></tr>
<tr><td><b>POST /ticks/sector</b></td><td>{sector_id, broker}</td><td>Todos ativos do setor</td></tr>
<tr><td><b>POST /ticks/all</b></td><td>{broker, exchange?, sector_id?, type?, limit?}</td><td>Todos 1901 ativos</td></tr>
<tr><td>POST /ohlcv</td><td>{symbol, timeframe, count, broker}</td><td>{data:[{t,o,h,l,c,v}]}</td></tr>
<tr><td>POST /symbol/info</td><td>{symbol, broker}</td><td>info completo</td></tr>
<tr><td>POST /symbols/list</td><td>{broker}</td><td>todos símbolos do terminal</td></tr>
</table>
<h2>Exemplos Python</h2>
<h3>Buscar TODOS os 1901 ativos</h3>
<pre>import requests
r = requests.post("http://localhost:8765/ticks/all", json={"broker":"mt5"})
d = r.json()
print(f"OK: {d['count']} | Erros: {d['failed']} de {d['total_requested']}")</pre>
<h3>Buscar todos ativos BOVESPA</h3>
<pre>r = requests.post("http://localhost:8765/ticks/all",
    json={"broker":"mt5","exchange":"BOVESPA"})</pre>
<h3>Buscar todos ativos de um setor</h3>
<pre>r = requests.post("http://localhost:8765/ticks/sector",
    json={"sector_id":"sector_005","broker":"mt5"})
d = r.json()
for sym, tick in d["ticks"].items():
    print(f"{sym}: bid={tick['bid']} ask={tick['ask']}")</pre>
<h3>Listar setores</h3>
<pre>r = requests.get("http://localhost:8765/sectors")
for s in r.json()["sectors"]:
    print(f"{s['sector_id']} | {s['sector_name']} | {s['count']} ativos")</pre>
<h2>Servidores Pepperstone</h2>
<pre>Live: Pepperstone-MT5   Demo: Pepperstone-MT5-Demo   AU: PepperstoneFX-MT5</pre>
<h2>Exchanges no CSV</h2>
<pre>BOVESPA · BMF · NYSE_NASDAQ · COMMODITIES · CRYPTO · FOREX · FX_PAIR · RENDA_FIXA · REF · INDEX</pre>
</body></html>"""

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), SentinelHandler)
    log.info("=" * 60)
    log.info("Sentinel API  http://%s:%d", HOST, PORT)
    log.info("MT5 disponível: %s", MT5_AVAILABLE)
    log.info("CSV: %d ativos | %d setores", len(ASSETS), len(SECTORS))
    log.info("Abra sentinel_dashboard.html no navegador")
    log.info("Ctrl+C para parar")
    log.info("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Servidor parado.")
        server.server_close()
