from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import os
from datetime import datetime, timedelta, timezone
from typing import List

try:
    import MetaTrader5 as mt5
except Exception:  # pragma: no cover
    mt5 = None


app = FastAPI()


_mt5_ready = False


def _mt5_assert_ready():
    if mt5 is None:
        raise RuntimeError(
            "MetaTrader5 module not available. This service must run on Windows with MetaTrader5 installed."
        )

    if not _mt5_ready:
        raise RuntimeError(
            "MetaTrader5 not initialized. Ensure MT5 terminal is installed and running, then restart service."
        )



def _mt5_ensure_symbol(symbol: str) -> None:
    _mt5_assert_ready()
    ok = bool(mt5.symbol_select(symbol, True))
    if not ok:
        raise RuntimeError(f"symbol_select failed for {symbol}")
    info = mt5.symbol_info(symbol)
    if info is None:
        raise RuntimeError(f"symbol_info missing for {symbol}")


def _normalize_stock_symbol(symbol: str) -> str:
    s = (symbol or "").strip().upper()
    if not s:
        raise ValueError("symbol is required")
    # Accept exchange-qualified forms like BVMF:VALE3, NASDAQ:VALE, etc.
    if ":" in s:
        parts = [p for p in s.split(":") if p]
        if parts:
            s = parts[-1].strip().upper()
    # MT5 symbol names depend on broker. Allow optional suffix/prefix via env.
    prefix = (os.getenv("MT5_STOCK_PREFIX") or "").strip()
    suffix = (os.getenv("MT5_STOCK_SUFFIX") or "").strip()
    return f"{prefix}{s}{suffix}"


def _resolve_stock_symbol(symbol: str) -> str:
    base = (symbol or "").strip().upper()
    if not base:
        raise ValueError("symbol is required")

    if ":" in base:
        parts = [p for p in base.split(":") if p]
        if parts:
            base = parts[-1].strip().upper()

    configured = _normalize_stock_symbol(base)

    prefix = (os.getenv("MT5_STOCK_PREFIX") or "").strip()
    suffix = (os.getenv("MT5_STOCK_SUFFIX") or "").strip()

    root = base
    if base and base[-1].isdigit():
        i = len(base) - 1
        while i >= 0 and base[i].isdigit():
            i -= 1
        root = base[: i + 1] or base

    candidates: List[str] = []
    if configured:
        candidates.append(configured)

    # Some brokers use root tickers without the class digits.
    # BUT: for symbols like VALE3/PETR4, falling back to VALE/PETR can point to a
    # completely different market/instrument (e.g., Nasdaq ADS). Make this opt-in.
    allow_root_fallback = (os.getenv("MT5_STOCK_ALLOW_ROOT_FALLBACK") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if allow_root_fallback and root and root != base:
        candidates.append(f"{prefix}{root}{suffix}")

    # Common BR tickers when the request comes without the class suffix.
    if not suffix and base.isalpha():
        candidates.extend(
            [
                f"{prefix}{base}3",
                f"{prefix}{base}4",
                f"{prefix}{base}11",
                f"{prefix}{base}3.SA",
                f"{prefix}{base}4.SA",
                f"{prefix}{base}11.SA",
            ]
        )

    candidates.append(f"{prefix}{base}{suffix}")

    try:
        # Ask MT5 for close matches (broker dependent). The API supports masks, so
        # try a few common wildcard forms.
        queries = [base]
        if base.isalnum():
            queries.extend([f"{base}*", f"*{base}*"])
        if root and root != base and root.isalnum():
            queries.extend([root, f"{root}*", f"*{root}*"])
        if not suffix and base.isalpha():
            queries.extend([f"{base}3*", f"{base}4*", f"{base}11*", f"*{base}3*", f"*{base}4*", f"*{base}11*"])

        seen = set()
        for q in queries:
            if q in seen:
                continue
            seen.add(q)
            items = mt5.symbols_get(q)
            if not items:
                continue
            for s in items:
                name = str(getattr(s, "name", "") or "").strip()
                if name and name not in candidates:
                    candidates.append(name)
    except Exception:
        pass

    for sym in candidates:
        try:
            _mt5_ensure_symbol(sym)
            return sym
        except Exception:
            continue

    raise RuntimeError(
        "no usable stock symbol found; set MT5_STOCK_PREFIX/MT5_STOCK_SUFFIX or request the exact MT5 symbol"
    )


def _normalize_fx_symbol(currency: str) -> str:
    c = (currency or "").strip().upper()
    if c not in ("USD", "EUR"):
        raise ValueError("currency must be USD or EUR")
    if c == "USD":
        return (os.getenv("MT5_FX_USD_SYMBOL") or "USDBRL").strip()
    return (os.getenv("MT5_FX_EUR_SYMBOL") or "EURBRL").strip()


def _resolve_fx_symbol_for_brl(currency: str):
    c = (currency or "").strip().upper()
    if c not in ("USD", "EUR"):
        raise ValueError("currency must be USD or EUR")

    def _symbol_has_rate(sym: str) -> bool:
        try:
            t = mt5.symbol_info_tick(sym)
        except Exception:
            t = None
        if t is not None:
            try:
                bid = float(getattr(t, "bid", 0.0) or 0.0)
                ask = float(getattr(t, "ask", 0.0) or 0.0)
                last = float(getattr(t, "last", 0.0) or 0.0)
                if (bid > 0 and ask > 0) or bid > 0 or ask > 0 or last > 0:
                    return True
            except Exception:
                pass
        try:
            r = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M1, 0, 5)
            if r is not None and len(r) > 0:
                close = float(r[-1]["close"])
                if close > 0:
                    return True
        except Exception:
            pass
        try:
            r = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_D1, 0, 1)
            if r is not None and len(r) > 0:
                close = float(r[-1]["close"])
                if close > 0:
                    return True
        except Exception:
            pass
        return False

    configured = _normalize_fx_symbol(c)
    candidates = []
    if configured:
        candidates.append(configured)

    if c == "USD":
        candidates.extend([
            "USDBRL",
            "USD/BRL",
            "USD.BRL",
            "USD_BRL",
            "USD*BRL*",
            "USDB11",
            "USDB*",
            "BRLUSD",
            "BRLUSD*",
        ])
    else:
        candidates.extend([
            "EURBRL",
            "EUR/BRL",
            "EUR.BRL",
            "EUR_BRL",
            "EUR*BRL*",
            "BRLEUR",
            "BRLEUR*",
        ])

    seen = set()
    for cand in candidates:
        if not cand or cand in seen:
            continue
        seen.add(cand)

        syms_to_try = []
        try:
            if "*" in cand or "?" in cand:
                items = mt5.symbols_get(cand) if mt5 is not None else None
                if items:
                    for s in items:
                        name = str(getattr(s, "name", "") or "").strip()
                        if name:
                            syms_to_try.append(name)
            else:
                syms_to_try.append(cand)
        except Exception:
            syms_to_try = []

        for sym in syms_to_try:
            if not sym:
                continue
            try:
                _mt5_ensure_symbol(sym)
            except Exception:
                continue
            if not _symbol_has_rate(sym):
                continue

            base = (getattr(mt5.symbol_info(sym), "currency_base", "") or "").strip().upper() if mt5 is not None else ""
            profit = (getattr(mt5.symbol_info(sym), "currency_profit", "") or "").strip().upper() if mt5 is not None else ""

            if base == c and profit == "BRL":
                return sym, False
            if base == "BRL" and profit == c:
                return sym, True

            # Some brokers expose USD/BRL as B3-style instruments (e.g., 'USDB11') which may not
            # report currency_base/profit as expected for an FX pair. Treat these as USD/BRL.
            if c == "USD" and sym.upper().startswith("USDB"):
                return sym, False
            if c == "EUR" and sym.upper().startswith("EURB"):
                return sym, False

            if sym.upper().startswith(f"BRL{c}"):
                return sym, True
            if sym.upper().startswith(f"{c}BRL"):
                return sym, False

            if sym.upper().endswith("BRL"):
                return sym, False
            if sym.upper().startswith("BRL"):
                return sym, True

    raise RuntimeError(f"no usable {c}/BRL symbol found; set MT5_FX_{c}_SYMBOL")


def _fx_rate_to_brl(currency: str) -> float:
    c = (currency or "").strip().upper()
    if not c or c == "BRL":
        return 1.0
    if c not in ("USD", "EUR"):
        raise RuntimeError(f"unsupported currency for BRL conversion: {c}")
    sym, invert = _resolve_fx_symbol_for_brl(c)
    t = mt5.symbol_info_tick(sym)
    if t is None:
        raise RuntimeError(f"no fx tick for {sym}")
    bid = float(getattr(t, "bid", 0.0) or 0.0)
    ask = float(getattr(t, "ask", 0.0) or 0.0)
    last = float(getattr(t, "last", 0.0) or 0.0)
    if bid > 0 and ask > 0:
        rate = (bid + ask) / 2.0
    else:
        rate = bid if bid > 0 else (ask if ask > 0 else last)
    if not rate or rate <= 0:
        raise RuntimeError(f"no fx rate for {sym}")
    rate = float(rate)
    if invert:
        if rate == 0:
            raise RuntimeError(f"invalid inverted fx rate for {sym}")
        return float(1.0 / rate)
    return float(rate)


def _symbol_currency_to_brl_rate(symbol: str) -> float:
    info = mt5.symbol_info(symbol)
    if info is None:
        return 1.0
    profit_ccy = (getattr(info, "currency_profit", "") or "").strip().upper()
    base_ccy = (getattr(info, "currency_base", "") or "").strip().upper()
    ccy = profit_ccy or base_ccy
    return _fx_rate_to_brl(ccy) if ccy else 1.0


def _normalize_crypto_symbol(asset: str) -> str:
    a = (asset or "").strip().upper()
    if a != "BTC":
        raise ValueError("asset must be BTC")
    return (os.getenv("MT5_BTC_SYMBOL") or "").strip()


def _resolve_crypto_symbol(asset: str) -> str:
    configured = _normalize_crypto_symbol(asset)
    candidates = []
    if configured:
        candidates.append(configured)
    candidates.extend(["BTCUSD", "BTC", "XBTUSD", "XBT", "BTCUSDT", "BTCUSD.", "BTCUSDm", "BTCUSDz"])

    try:
        items = mt5.symbols_get("BTC")
        if items:
            for s in items:
                name = str(getattr(s, "name", "") or "").strip()
                if name and name not in candidates:
                    candidates.append(name)
    except Exception:
        pass

    for sym in candidates:
        try:
            _mt5_ensure_symbol(sym)
            return sym
        except Exception:
            continue

    raise RuntimeError("no usable BTC symbol found; set MT5_BTC_SYMBOL to a valid MT5 symbol")


def _timeframe_from_interval(interval: str):
    i = (interval or "").strip().lower()
    if mt5 is None:
        return None
    if i in ("1m", "1min", "m1"):
        return mt5.TIMEFRAME_M1
    if i in ("5m", "5min", "m5"):
        return mt5.TIMEFRAME_M5
    if i in ("15m", "15min", "m15"):
        return mt5.TIMEFRAME_M15
    if i in ("30m", "30min", "m30"):
        return mt5.TIMEFRAME_M30
    if i in ("60m", "1h", "h1"):
        return mt5.TIMEFRAME_H1
    if i in ("4h", "h4"):
        return mt5.TIMEFRAME_H4
    if i in ("1d", "d1"):
        return mt5.TIMEFRAME_D1
    raise ValueError("unsupported interval")


def _interval_seconds(interval: str) -> int:
    i = (interval or "").strip().lower()
    if i in ("1m", "1min", "m1"):
        return 60
    if i in ("5m", "5min", "m5"):
        return 5 * 60
    if i in ("15m", "15min", "m15"):
        return 15 * 60
    if i in ("30m", "30min", "m30"):
        return 30 * 60
    if i in ("60m", "1h", "h1"):
        return 60 * 60
    if i in ("4h", "h4"):
        return 4 * 60 * 60
    if i in ("1d", "d1"):
        return 24 * 60 * 60
    return 60


def _copy_rates(symbol: str, tf, range: str, interval: str):
    delta = _range_to_timedelta(range)
    to_dt = datetime.now()
    from_dt = to_dt - delta
    rates = mt5.copy_rates_range(symbol, tf, from_dt, to_dt)
    try:
        n = 0 if rates is None else len(rates)
    except Exception:
        n = 0
    if n > 0:
        return rates
    # fallback: grab last N bars
    secs = max(60, int(delta.total_seconds()))
    itv = max(60, _interval_seconds(interval))
    bars = max(10, min(5000, int(secs / itv) + 10))

    rates2 = mt5.copy_rates_from(symbol, tf, to_dt, bars)
    try:
        n2 = 0 if rates2 is None else len(rates2)
    except Exception:
        n2 = 0
    if n2 > 0:
        return rates2

    # Some brokers return empty for copy_rates_from() but work with positional API.
    return mt5.copy_rates_from_pos(symbol, tf, 1, bars)


def _range_to_timedelta(r: str) -> timedelta:
    rr = (r or "").strip().lower()
    if rr.endswith("d"):
        return timedelta(days=int(rr[:-1] or "1"))
    if rr.endswith("h"):
        return timedelta(hours=int(rr[:-1] or "1"))
    if rr.endswith("mo"):
        return timedelta(days=30 * int(rr[:-2] or "1"))
    if rr.endswith("y"):
        return timedelta(days=365 * int(rr[:-1] or "1"))
    # fallback default
    return timedelta(days=7)


def _candles_from_rates(rates) -> List[dict]:
    if rates is None:
        return []
    out = []
    for r in rates:
        try:
            if isinstance(r, dict):
                ts_sec = int(r["time"])
                o = float(r["open"])
                h = float(r["high"])
                l = float(r["low"])
                c = float(r["close"])
                v = float(r.get("tick_volume")) if "tick_volume" in r else None
            else:
                # MetaTrader5 returns numpy structured arrays (numpy.void per item)
                try:
                    ts_sec = int(r["time"])
                    o = float(r["open"])
                    h = float(r["high"])
                    l = float(r["low"])
                    c = float(r["close"])
                    v = float(r["tick_volume"]) if "tick_volume" in getattr(r, "dtype", {}).names else None
                except Exception:
                    ts_sec = int(getattr(r, "time"))
                    o = float(getattr(r, "open"))
                    h = float(getattr(r, "high"))
                    l = float(getattr(r, "low"))
                    c = float(getattr(r, "close"))
                    v = float(getattr(r, "tick_volume", 0.0)) if hasattr(r, "tick_volume") else None
            if ts_sec <= 0:
                continue
            item = {"time": ts_sec, "open": o, "high": h, "low": l, "close": c}
            if v is not None:
                item["volume"] = v
            out.append(item)
        except Exception:
            continue
    out.sort(key=lambda x: x["time"])
    return out


def _candles_from_ticks(ticks, bucket_seconds: int) -> List[dict]:
    if ticks is None:
        return []
    try:
        n = len(ticks)
    except Exception:
        return []
    if n <= 0:
        return []

    buckets = {}
    for t in ticks:
        try:
            try:
                ts = int(t["time"])
                last = float(t["last"]) if "last" in getattr(t, "dtype", {}).names else 0.0
                bid = float(t["bid"]) if "bid" in getattr(t, "dtype", {}).names else 0.0
                ask = float(t["ask"]) if "ask" in getattr(t, "dtype", {}).names else 0.0
            except Exception:
                ts = int(getattr(t, "time", 0) or 0)
                last = float(getattr(t, "last", 0.0) or 0.0)
                bid = float(getattr(t, "bid", 0.0) or 0.0)
                ask = float(getattr(t, "ask", 0.0) or 0.0)
            if ts <= 0:
                continue
            bucket = ts - (ts % bucket_seconds)
            price = last if last > 0 else ((bid + ask) / 2 if bid > 0 and ask > 0 else (bid if bid > 0 else ask))
            if price <= 0:
                continue

            b = buckets.get(bucket)
            if b is None:
                buckets[bucket] = {
                    "time": bucket,
                    "open": price,
                    "high": price,
                    "low": price,
                    "close": price,
                    "volume": 1,
                }
            else:
                b["high"] = price if price > b["high"] else b["high"]
                b["low"] = price if price < b["low"] else b["low"]
                b["close"] = price
                b["volume"] += 1
        except Exception:
            continue

    out = list(buckets.values())
    out.sort(key=lambda x: x["time"])
    return out


@app.on_event("startup")
def _startup():
    global _mt5_ready
    if mt5 is None:
        _mt5_ready = False
        return
    _mt5_ready = bool(mt5.initialize())


@app.on_event("shutdown")
def _shutdown():
    global _mt5_ready
    if mt5 is None:
        _mt5_ready = False
        return
    try:
        mt5.shutdown()
    finally:
        _mt5_ready = False


@app.get("/health")
def health():
    info = None
    acct = None
    err = None
    try:
        if mt5 is not None and _mt5_ready:
            try:
                info = mt5.terminal_info()
            except Exception:
                info = None
            try:
                acct = mt5.account_info()
            except Exception:
                acct = None
            try:
                err = mt5.last_error()
            except Exception:
                err = None
    except Exception:
        info = None
        acct = None
        err = None

    return {
        "ok": True,
        "mt5": bool(_mt5_ready),
        "terminal": None if info is None else {"community_account": getattr(info, "community_account", None), "connected": getattr(info, "connected", None), "trade_allowed": getattr(info, "trade_allowed", None), "path": getattr(info, "path", None)},
        "account": None if acct is None else {"login": getattr(acct, "login", None), "server": getattr(acct, "server", None), "currency": getattr(acct, "currency", None), "leverage": getattr(acct, "leverage", None)},
        "last_error": err,
    }


@app.get("/api/v1/health")
def api_v1_health():
    return health()


@app.get("/mt5/status")
def mt5_status():
    try:
        _mt5_assert_ready()

        info = None
        acct = None
        try:
            info = mt5.terminal_info()
        except Exception:
            info = None
        try:
            acct = mt5.account_info()
        except Exception:
            acct = None

        return {
            "ready": bool(_mt5_ready),
            "terminal_info": None if info is None else {k: getattr(info, k, None) for k in dir(info) if not k.startswith('_')},
            "account_info": None if acct is None else {k: getattr(acct, k, None) for k in dir(acct) if not k.startswith('_')},
            "last_error": mt5.last_error(),
        }
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 status failed: {str(e)}"})


@app.get("/symbols")
def symbols(q: str = ""):
    try:
        _mt5_assert_ready()
        query = (q or "").strip()
        # MT5 symbols_get can become extremely slow with leading-wildcard masks like '*VALE3*'
        # on brokers with very large symbol catalogs. Prefer prefix-style searches first.
        items = None
        if query:
            q0 = query
            if q0.startswith("*"):
                q0 = q0.lstrip("*")
            candidates = []
            if q0 and "*" in q0:
                base = q0.replace("*", "").strip()
                if base:
                    candidates.append(f"{base}*")
                    candidates.append(base)
                candidates.append(q0)
            else:
                candidates.append(q0)
            seen = set()
            for cand in candidates:
                if not cand or cand in seen:
                    continue
                seen.add(cand)
                try:
                    items = mt5.symbols_get(cand)
                except Exception:
                    items = None
                if items:
                    break
        if items is None:
            items = mt5.symbols_get() if not query else (items or [])
        if items is None:
            items = []
        names = []
        for s in items:
            try:
                names.append(str(getattr(s, "name", "")))
            except Exception:
                continue
        names = [n for n in names if n]
        names.sort()
        # keep response bounded
        if len(names) > 500:
            names = names[:500]
        return {"count": len(names), "symbols": names}
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 symbols failed: {str(e)}"})


@app.get("/tick")
def tick(symbol: str):
    try:
        _mt5_assert_ready()
        sym = (symbol or "").strip()
        if not sym:
            raise HTTPException(status_code=400, detail="symbol is required")
        _mt5_ensure_symbol(sym)
        t = mt5.symbol_info_tick(sym)
        if t is None:
            raise RuntimeError("no tick")
        return {
            "symbol": sym,
            "bid": float(getattr(t, "bid", 0.0) or 0.0),
            "ask": float(getattr(t, "ask", 0.0) or 0.0),
            "last": float(getattr(t, "last", 0.0) or 0.0),
            "time_msc": int(getattr(t, "time_msc", 0) or 0),
        }
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 tick failed: {str(e)}"})


@app.get("/symbol/info")
def symbol_info(symbol: str):
    try:
        _mt5_assert_ready()
        sym = (symbol or "").strip()
        if not sym:
            raise HTTPException(status_code=400, detail="symbol is required")
        info = mt5.symbol_info(sym)
        if info is None:
            raise RuntimeError("symbol not found")
        data = {
            "name": str(getattr(info, "name", "") or ""),
            "path": str(getattr(info, "path", "") or ""),
            "description": str(getattr(info, "description", "") or ""),
            "visible": bool(getattr(info, "visible", False)),
            "select": bool(getattr(info, "select", False)),
            "trade_mode": int(getattr(info, "trade_mode", 0) or 0),
            "currency_base": str(getattr(info, "currency_base", "") or ""),
            "currency_profit": str(getattr(info, "currency_profit", "") or ""),
            "currency_margin": str(getattr(info, "currency_margin", "") or ""),
            "digits": int(getattr(info, "digits", 0) or 0),
            "point": float(getattr(info, "point", 0.0) or 0.0),
            "spread": int(getattr(info, "spread", 0) or 0),
        }
        return data
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 symbol_info failed: {str(e)}"})


@app.post("/symbol/select")
def symbol_select(symbol: str):
    try:
        _mt5_assert_ready()
        sym = (symbol or "").strip()
        if not sym:
            raise HTTPException(status_code=400, detail="symbol is required")
        ok = bool(mt5.symbol_select(sym, True))
        if not ok:
            raise RuntimeError("symbol_select failed")
        info = mt5.symbol_info(sym)
        return {
            "symbol": sym,
            "selected": True,
            "visible": bool(getattr(info, "visible", False)) if info is not None else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 symbol_select failed: {str(e)}"})


@app.get("/symbols/probe")
def symbols_probe(q: str = ""):
    try:
        _mt5_assert_ready()
        query = (q or "").strip()
        if not query:
            raise HTTPException(status_code=400, detail="q is required")

        items = mt5.symbols_get(query) or []
        names = []
        for s in items:
            name = str(getattr(s, "name", "") or "").strip()
            if name:
                names.append(name)
        names = sorted(list(dict.fromkeys(names)))
        if len(names) > 200:
            names = names[:200]

        out = []
        now = datetime.now()
        from_dt = now - timedelta(hours=6)
        from_dt_d1 = now - timedelta(days=30)
        for name in names:
            row = {"symbol": name}
            try:
                row["selected"] = bool(mt5.symbol_select(name, True))
            except Exception:
                row["selected"] = False
            try:
                t = mt5.symbol_info_tick(name)
                if t is None:
                    row["tick"] = None
                else:
                    row["tick"] = {
                        "bid": float(getattr(t, "bid", 0.0) or 0.0),
                        "ask": float(getattr(t, "ask", 0.0) or 0.0),
                        "last": float(getattr(t, "last", 0.0) or 0.0),
                        "time_msc": int(getattr(t, "time_msc", 0) or 0),
                    }
            except Exception:
                row["tick"] = None
            try:
                rates = mt5.copy_rates_range(name, mt5.TIMEFRAME_M1, from_dt, now)
                row["m1_rates"] = 0 if rates is None else int(len(rates))
            except Exception:
                row["m1_rates"] = 0
            try:
                rates = mt5.copy_rates_range(name, mt5.TIMEFRAME_H1, from_dt, now)
                row["h1_rates"] = 0 if rates is None else int(len(rates))
            except Exception:
                row["h1_rates"] = 0
            try:
                rates = mt5.copy_rates_range(name, mt5.TIMEFRAME_D1, from_dt_d1, now)
                row["d1_rates"] = 0 if rates is None else int(len(rates))
            except Exception:
                row["d1_rates"] = 0
            out.append(row)
        return {"count": len(out), "items": out}
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 symbols probe failed: {str(e)}"})


@app.post("/symbol/warmup")
def symbol_warmup(symbol: str):
    try:
        _mt5_assert_ready()
        sym = (symbol or "").strip()
        if not sym:
            raise HTTPException(status_code=400, detail="symbol is required")
        _mt5_ensure_symbol(sym)

        now = datetime.now()
        ranges = {
            "m1": (mt5.TIMEFRAME_M1, now - timedelta(hours=6)),
            "h1": (mt5.TIMEFRAME_H1, now - timedelta(days=7)),
            "d1": (mt5.TIMEFRAME_D1, now - timedelta(days=365)),
        }

        counts = {}
        for k, (tf, start) in ranges.items():
            try:
                rates = mt5.copy_rates_range(sym, tf, start, now)
                counts[k] = 0 if rates is None else int(len(rates))
            except Exception:
                counts[k] = 0

        return {"symbol": sym, "selected": True, "rates": counts}
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 warmup failed: {str(e)}"})


@app.get("/stocks/{symbol}/history")
def stock_history(symbol: str, range: str = "1mo", interval: str = "1d"):
    try:
        _mt5_assert_ready()
        mt5_symbol = _resolve_stock_symbol(symbol)
        fx_rate = _symbol_currency_to_brl_rate(mt5_symbol)
        tf = _timeframe_from_interval(interval)
        rates = _copy_rates(mt5_symbol, tf, range, interval)
        candles = _candles_from_rates(rates)
        if fx_rate != 1.0 and candles:
            for c in candles:
                try:
                    c["open"] = float(c["open"]) * fx_rate
                    c["high"] = float(c["high"]) * fx_rate
                    c["low"] = float(c["low"]) * fx_rate
                    c["close"] = float(c["close"]) * fx_rate
                except Exception:
                    continue
        return {"symbol": symbol.upper(), "mt5Symbol": mt5_symbol, "range": range, "interval": interval, "candles": candles}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 stock history failed: {str(e)}"})


@app.get("/api/v1/stocks/{symbol}/history")
def api_v1_stock_history(symbol: str, range: str = "1mo", interval: str = "1d"):
    return stock_history(symbol=symbol, range=range, interval=interval)


@app.get("/stocks/{symbol}/quote")
def stock_quote(symbol: str):
    try:
        _mt5_assert_ready()
        mt5_symbol = _resolve_stock_symbol(symbol)
        fx_rate = _symbol_currency_to_brl_rate(mt5_symbol)
        tick = mt5.symbol_info_tick(mt5_symbol)
        if tick is None:
            raise RuntimeError("no tick")
        price = float(getattr(tick, "last", 0.0) or 0.0)
        if not price or price <= 0:
            # some brokers use bid/ask
            bid = float(getattr(tick, "bid", 0.0) or 0.0)
            ask = float(getattr(tick, "ask", 0.0) or 0.0)
            price = bid if bid > 0 else ask
        if not price or price <= 0:
            # some feeds (notably certain B3 symbols) expose no last/bid/ask in ticks.
            # fallback to last known close from rates.
            try:
                r = mt5.copy_rates_from_pos(mt5_symbol, mt5.TIMEFRAME_M1, 0, 1)
                if r is not None and len(r) > 0:
                    price = float(r[-1]["close"])
            except Exception:
                price = price
        if not price or price <= 0:
            try:
                r = mt5.copy_rates_from_pos(mt5_symbol, mt5.TIMEFRAME_D1, 0, 1)
                if r is not None and len(r) > 0:
                    price = float(r[-1]["close"])
            except Exception:
                price = price
        if not price or price <= 0:
            raise RuntimeError("no price")
        return {
            "symbol": symbol.upper(),
            "mt5Symbol": mt5_symbol,
            "priceBRL": float(price) * fx_rate,
            "time_msc": int(getattr(tick, "time_msc", 0) or 0),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 stock quote failed: {str(e)}"})


@app.get("/api/v1/stocks/{symbol}/quote")
def api_v1_stock_quote(symbol: str):
    return stock_quote(symbol=symbol)


@app.get("/fx/history")
def fx_history(currency: str = "USD", range: str = "7d", interval: str = "1d"):
    try:
        _mt5_assert_ready()
        mt5_symbol, invert = _resolve_fx_symbol_for_brl(currency)
        tf = _timeframe_from_interval(interval)
        rates = _copy_rates(mt5_symbol, tf, range, interval)
        candles = _candles_from_rates(rates)
        if invert and candles:
            for c in candles:
                try:
                    o = float(c["open"]) if c.get("open") is not None else None
                    h = float(c["high"]) if c.get("high") is not None else None
                    l = float(c["low"]) if c.get("low") is not None else None
                    cl = float(c["close"]) if c.get("close") is not None else None
                    if not o or not h or not l or not cl:
                        continue
                    c["open"] = 1.0 / o
                    c["high"] = 1.0 / l
                    c["low"] = 1.0 / h
                    c["close"] = 1.0 / cl
                except Exception:
                    continue
        return {
            "pair": f"{currency.upper()}BRL",
            "mt5Symbol": mt5_symbol,
            "currency": currency.upper(),
            "range": range,
            "interval": interval,
            "data": candles,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 fx history failed: {str(e)}"})


@app.get("/api/v1/fx/history")
def api_v1_fx_history(currency: str = "USD", range: str = "7d", interval: str = "1d"):
    return fx_history(currency=currency, range=range, interval=interval)


@app.get("/fx/quote")
def fx_quote(currency: str = "USD"):
    try:
        _mt5_assert_ready()
        mt5_symbol, invert = _resolve_fx_symbol_for_brl(currency)
        tick = mt5.symbol_info_tick(mt5_symbol)
        bid = 0.0
        ask = 0.0
        last = 0.0
        if tick is not None:
            bid = float(getattr(tick, "bid", 0.0) or 0.0)
            ask = float(getattr(tick, "ask", 0.0) or 0.0)
            last = float(getattr(tick, "last", 0.0) or 0.0)
        if bid > 0 and ask > 0:
            rate = (bid + ask) / 2.0
        else:
            rate = bid if bid > 0 else (ask if ask > 0 else last)
        if not rate or rate <= 0:
            try:
                r = mt5.copy_rates_from_pos(mt5_symbol, mt5.TIMEFRAME_M1, 0, 5)
                if r is not None and len(r) > 0:
                    rate = float(r[-1]["close"])
            except Exception:
                rate = rate
        if not rate or rate <= 0:
            try:
                r = mt5.copy_rates_from_pos(mt5_symbol, mt5.TIMEFRAME_D1, 0, 1)
                if r is not None and len(r) > 0:
                    rate = float(r[-1]["close"])
            except Exception:
                rate = rate
        if not rate or rate <= 0:
            raise RuntimeError("no rate")
        rate = float(rate)
        if invert:
            rate = 1.0 / rate
        return {
            "pair": f"{currency.upper()}BRL",
            "mt5Symbol": mt5_symbol,
            "currency": currency.upper(),
            "rate": float(rate),
            "time_msc": int(getattr(tick, "time_msc", 0) or 0),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 fx quote failed: {str(e)}"})


@app.get("/api/v1/fx/quote")
def api_v1_fx_quote(currency: str = "USD"):
    return fx_quote(currency=currency)


@app.get("/crypto/{asset}/history")
def crypto_history(asset: str, range: str = "1d", interval: str = "1m"):
    try:
        _mt5_assert_ready()
        mt5_symbol = _resolve_crypto_symbol(asset)
        fx_rate = _symbol_currency_to_brl_rate(mt5_symbol)
        tf = _timeframe_from_interval(interval)
        rates = _copy_rates(mt5_symbol, tf, range, interval)
        candles = _candles_from_rates(rates)
        if not candles:
            delta = _range_to_timedelta(range)
            to_dt = datetime.now()
            from_dt = to_dt - delta
            ticks = mt5.copy_ticks_range(mt5_symbol, from_dt, to_dt, mt5.COPY_TICKS_ALL)
            candles = _candles_from_ticks(ticks, _interval_seconds(interval))
        if fx_rate != 1.0 and candles:
            for c in candles:
                try:
                    c["open"] = float(c["open"]) * fx_rate
                    c["high"] = float(c["high"]) * fx_rate
                    c["low"] = float(c["low"]) * fx_rate
                    c["close"] = float(c["close"]) * fx_rate
                except Exception:
                    continue
        return {"asset": asset.upper(), "mt5Symbol": mt5_symbol, "range": range, "interval": interval, "candles": candles}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 crypto history failed: {str(e)}"})


@app.get("/api/v1/crypto/{asset}/history")
def api_v1_crypto_history(asset: str, range: str = "1d", interval: str = "1m"):
    return crypto_history(asset=asset, range=range, interval=interval)


@app.get("/crypto/{asset}/quote")
def crypto_quote(asset: str):
    try:
        _mt5_assert_ready()
        mt5_symbol = _resolve_crypto_symbol(asset)
        fx_rate = _symbol_currency_to_brl_rate(mt5_symbol)
        tick = mt5.symbol_info_tick(mt5_symbol)
        if tick is None:
            raise RuntimeError("no tick")
        bid = float(getattr(tick, "bid", 0.0) or 0.0)
        ask = float(getattr(tick, "ask", 0.0) or 0.0)
        last = float(getattr(tick, "last", 0.0) or 0.0)
        price = last if last > 0 else (bid if bid > 0 else ask)
        if not price or price <= 0:
            raise RuntimeError("no price")
        return {
            "asset": asset.upper(),
            "mt5Symbol": mt5_symbol,
            "price": float(price) * fx_rate,
            "time_msc": int(getattr(tick, "time_msc", 0) or 0),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return JSONResponse(status_code=503, content={"message": f"mt5 crypto quote failed: {str(e)}"})


@app.get("/api/v1/crypto/{asset}/quote")
def api_v1_crypto_quote(asset: str):
    return crypto_quote(asset=asset)
