import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../lib/api'
import { getAuth } from '../lib/auth'
import { Link, NavLink, useNavigate, Outlet, useMatch } from 'react-router-dom'

// Types
type AssetItem = {
  symbol: string
  name: string
  price: number
  change: number
  sparkline: number[]
}

type SymbolCheckItem = {
  requested: string
  symbol: string
  status: 'ok' | 'no_data' | 'redis_not_configured'
  priceBRL?: number
  message?: string
}

type ChatMessage = {
  id: string
  user: string
  avatar: string
  message: string
  time: string
  online?: boolean
}

// Sparkline Component
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 60
    const y = 20 - ((val - min) / range) * 20
    return `${x},${y}`
  }).join(' ')

  return (
    <svg className="sparkline" viewBox="0 0 60 20">
      <polyline
        fill="none"
        stroke={positive ? '#3fb950' : '#f85149'}
        strokeWidth="2"
        points={points}
      />
    </svg>
  )
}

// Main Layout Component
export default function TerminalLayout() {
  const auth = getAuth()
  const navigate = useNavigate()
  const groupMatch = useMatch('/app/groups/:group')
  const groupFromRoute = String(groupMatch?.params?.group || '').toUpperCase()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState('VALE3')
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [feedStale, setFeedStale] = useState<boolean>(false)
  const [feedAgeMs, setFeedAgeMs] = useState<number | null>(null)

  const lastClientTickAtRef = useRef<number>(0)

  const wsRef = useRef<WebSocket | null>(null)
  const pendingSymbolsRef = useRef<string>('')
  const pricesRef = useRef<Map<string, number>>(new Map())
  const prevPricesRef = useRef<Map<string, number>>(new Map())
  const flashRef = useRef<Map<string, 'up' | 'down'>>(new Map())
  const [flashKey, setFlashKey] = useState(0)
  const dirtySymbolsRef = useRef<Set<string>>(new Set())

  const lastPricesCacheDirtyRef = useRef<Set<string>>(new Set())
  const lastPricesCacheTimerRef = useRef<number | null>(null)
  const LAST_PRICES_CACHE_KEY = 'terminal:lastPrices:v1'

  const flashMap = useMemo(() => new Map(flashRef.current), [flashKey])

  const accountId = useMemo(() => auth?.accountId || 'acc-1', [auth])

  // Auth check
  useEffect(() => {
    if (!auth?.accessToken) {
      navigate('/login')
    }
  }, [auth, navigate])

  // Load asset universe once from backend
  useEffect(() => {
    let cancelled = false
    async function loadAssets() {
      try {
        let symbols: string[] = []

        if (groupFromRoute) {
          const res = await apiGet<{ group: string; total: number; symbols: string[] }>(
            `/api/v1/market/groups/${encodeURIComponent(groupFromRoute)}/symbols?limit=200`
          )
          symbols = (res.symbols || []).filter(Boolean).slice(0, 200)
        } else {
          const stocksRes = await apiGet<{ symbols: string[] }>('/api/v1/stocks')
          const allSymbols = (stocksRes.symbols || []).filter(Boolean)
          symbols = allSymbols.slice(0, 60)
        }
        
        const assetItems: AssetItem[] = symbols.map((symbol) => ({
          symbol,
          name: getAssetName(symbol),
          price: 0,
          change: 0,
          sparkline: [0, 0, 0, 0, 0],
        }))
        
        setAssets(assetItems)

        const readLastPricesCache = (): Record<string, { price?: unknown; ts?: unknown }> => {
          try {
            const raw = window.localStorage.getItem(LAST_PRICES_CACHE_KEY)
            if (!raw) return {}
            const parsed = JSON.parse(raw) as unknown
            if (!parsed || typeof parsed !== 'object') return {}
            return parsed as Record<string, { price?: unknown; ts?: unknown }>
          } catch {
            return {}
          }
        }

        const flushLastPricesCache = () => {
          try {
            const dirty = lastPricesCacheDirtyRef.current
            if (dirty.size === 0) return
            const cache = readLastPricesCache()
            for (const sym of Array.from(dirty)) {
              const price = pricesRef.current.get(sym)
              if (price == null || !Number.isFinite(price) || price <= 0) continue
              cache[sym] = { price, ts: Date.now() }
            }
            dirty.clear()
            window.localStorage.setItem(LAST_PRICES_CACHE_KEY, JSON.stringify(cache))
          } catch {
            // ignore
          }
        }

        const scheduleLastPricesCacheFlush = () => {
          if (lastPricesCacheTimerRef.current != null) return
          lastPricesCacheTimerRef.current = window.setTimeout(() => {
            lastPricesCacheTimerRef.current = null
            flushLastPricesCache()
          }, 600)
        }

        const applyPrice = (symRaw: string, priceRaw: unknown) => {
          const sym = String(symRaw || '').toUpperCase()
          const price = Number(priceRaw)
          if (!sym || !Number.isFinite(price) || price <= 0) return
          pricesRef.current.set(sym, price)
          dirtySymbolsRef.current.add(sym)
          lastPricesCacheDirtyRef.current.add(sym)
          scheduleLastPricesCacheFlush()
        }

        try {
          const cache = readLastPricesCache()
          for (const s of symbols) {
            const sym = String(s || '').toUpperCase()
            const cached = cache[sym]
            if (!cached) continue
            applyPrice(sym, cached.price)
          }
        } catch {
          // ignore
        }

        try {
          const q = await apiGet<{ items: SymbolCheckItem[] }>(
            `/api/v1/market/symbols/check?symbols=${encodeURIComponent(symbols.join(','))}`
          )
          const items = Array.isArray(q?.items) ? q.items : []
          if (cancelled) return
          for (const it of items) {
            if (!it || it.status !== 'ok') continue
            applyPrice(String(it.symbol || it.requested || ''), it.priceBRL)
          }
        } catch {
          // ignore (batch check is best-effort)
        }

        setFlashKey((x) => x + 1)
        if (assetItems.length > 0) {
          setSelectedAsset((prev) => {
            const stillExists = assetItems.some((a) => a.symbol === prev)
            return stillExists ? prev : assetItems[0].symbol
          })
        }
      } catch (err) {
        console.error('Failed to load assets:', err)
        // No fictitious fallback: keep list empty if backend is unavailable.
        setAssets([])
      } finally {
        setLoadingAssets(false)
      }
    }
    
    void loadAssets()
    return () => {
      cancelled = true
    }
  }, [groupFromRoute])

  const watchSymbols = useMemo(() => {
    const base = ['VALE3', 'PETR4', 'USDB11', 'BTCBRL']
    const s = new Set(base)
    if (selectedAsset) s.add(selectedAsset)
    return Array.from(s)
  }, [selectedAsset])

  const watchSymbolsKey = useMemo(() => watchSymbols.join(','), [watchSymbols])
  const assetSymbolsKey = useMemo(() => assets.map((a) => a.symbol).join(','), [assets])

  const subscribedSymbols = useMemo(() => {
    const watchList = watchSymbolsKey
      .split(',')
      .map((x) => String(x || '').trim().toUpperCase())
      .filter(Boolean)
    const assetList = assetSymbolsKey
      .split(',')
      .map((x) => String(x || '').trim().toUpperCase())
      .filter(Boolean)
    const s = new Set([...watchList, ...assetList])
    return Array.from(s).slice(0, 200)
  }, [assetSymbolsKey, watchSymbolsKey])

  useEffect(() => {
    const STALE_AFTER_MS = 15_000
    const t = window.setInterval(() => {
      const last = lastClientTickAtRef.current
      if (!(Number.isFinite(last) && last > 0)) return
      const age = Math.max(0, Date.now() - last)
      setFeedAgeMs(age)
      setFeedStale(age > STALE_AFTER_MS)
    }, 1000)
    return () => window.clearInterval(t)
  }, [])

  // WebSocket subscription (single connection)
  useEffect(() => {
    const hostRaw = window.location.hostname
    const host = hostRaw === 'localhost' || hostRaw === '::1' ? '127.0.0.1' : hostRaw
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${host}:3000/ws/stocks?mode=feed`

    let closed = false
    try {
      wsRef.current?.close()
    } catch {
      // ignore
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    const sendSetSymbols = () => {
      const next = subscribedSymbols
      const key = next.join(',')
      if (pendingSymbolsRef.current === key) return
      pendingSymbolsRef.current = key
      try {
        ws.send(JSON.stringify({ type: 'set_symbols', symbols: next }))
      } catch {
        // ignore
      }
    }

    ws.onopen = () => {
      sendSetSymbols()
    }

    ws.onmessage = (ev) => {
      let msg: unknown
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }

      if (!msg || typeof msg !== 'object') return
      const m = msg as Record<string, unknown>

      if (m.type === 'feed_status') {
        setFeedStale(Boolean(m.stale))
        const age = m.ageMs
        setFeedAgeMs(typeof age === 'number' && Number.isFinite(age) ? age : null)
        return
      }

      const scheduleLastPricesCacheFlush = () => {
        if (lastPricesCacheTimerRef.current != null) return
        lastPricesCacheTimerRef.current = window.setTimeout(() => {
          lastPricesCacheTimerRef.current = null
          try {
            const dirty = lastPricesCacheDirtyRef.current
            if (dirty.size === 0) return
            const raw = window.localStorage.getItem(LAST_PRICES_CACHE_KEY)
            const base = raw ? (JSON.parse(raw) as unknown) : {}
            const cache: Record<string, { price?: unknown; ts?: unknown }> =
              base && typeof base === 'object' ? (base as Record<string, { price?: unknown; ts?: unknown }>) : {}
            for (const sym of Array.from(dirty)) {
              const price = pricesRef.current.get(sym)
              if (price == null || !Number.isFinite(price) || price <= 0) continue
              cache[sym] = { price, ts: Date.now() }
            }
            dirty.clear()
            window.localStorage.setItem(LAST_PRICES_CACHE_KEY, JSON.stringify(cache))
          } catch {
            // ignore
          }
        }, 600)
      }

      const applyPrice = (symRaw: unknown, priceRaw: unknown) => {
        const sym = String(symRaw || '').toUpperCase()
        const price = Number(priceRaw)
        if (!sym || !Number.isFinite(price) || price <= 0) return
        pricesRef.current.set(sym, price)
        dirtySymbolsRef.current.add(sym)
        lastPricesCacheDirtyRef.current.add(sym)
        scheduleLastPricesCacheFlush()
      }

      if (m.type === 'init' && m.lastPrices && typeof m.lastPrices === 'object') {
        for (const [sym, p] of Object.entries(m.lastPrices as Record<string, unknown>)) {
          applyPrice(sym, p)
        }
        if (m.feedStatus && typeof m.feedStatus === 'object') {
          const fs = m.feedStatus as Record<string, unknown>
          setFeedStale(Boolean(fs.stale))
          const age = fs.ageMs
          setFeedAgeMs(typeof age === 'number' && Number.isFinite(age) ? age : null)
        }
        setFlashKey((x) => x + 1)
        return
      }

      const applyTick = (raw: unknown) => {
        if (!raw || typeof raw !== 'object') return
        const r = raw as Record<string, unknown>
        const sym = String(r.symbol || '').toUpperCase()
        const price = Number(r.priceBRL)
        if (!sym || !Number.isFinite(price) || price <= 0) return

        lastClientTickAtRef.current = Date.now()
        setFeedStale(false)
        setFeedAgeMs(0)

        const prev = pricesRef.current.get(sym)
        if (prev != null && Number.isFinite(prev) && prev > 0 && prev !== price) {
          prevPricesRef.current.set(sym, prev)
          flashRef.current.set(sym, price > prev ? 'up' : 'down')
          setFlashKey((x) => x + 1)
          window.setTimeout(() => {
            if (closed) return
            flashRef.current.delete(sym)
            setFlashKey((x) => x + 1)
          }, 220)
        }

        applyPrice(sym, price)
      }

      if (m.type === 'tick') {
        applyTick(m)
        return
      }

      if (m.type === 'ticks' && Array.isArray(m.items)) {
        for (const it of m.items) applyTick(it)
      }
    }

    ws.onclose = () => {
      // ignore
    }

    return () => {
      closed = true
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }, [subscribedSymbols])

  // HFT paint loop: only update UI when some symbol changed (dirty set)
  useEffect(() => {
    let raf = 0
    let stopped = false

    const frame = () => {
      if (stopped) return
      const dirty = dirtySymbolsRef.current
      if (dirty.size > 0) {
        const dirtyNow = new Set(dirty)
        dirty.clear()

        setAssets((prev) =>
          prev.map((a) => {
            if (!dirtyNow.has(a.symbol)) return a
            const p = pricesRef.current.get(a.symbol)
            if (p == null || !Number.isFinite(p) || p <= 0) return a
            const prevP = prevPricesRef.current.get(a.symbol)
            const change = prevP && prevP > 0 ? ((p - prevP) / prevP) * 100 : a.change
            const nextChange = Number.isFinite(change) ? change : a.change
            if (a.price === p && a.change === nextChange) return a
            return {
              ...a,
              price: p,
              change: nextChange,
              sparkline: generateSparkline(nextChange),
            }
          })
        )
      }

      raf = window.requestAnimationFrame(frame)
    }

    raf = window.requestAnimationFrame(frame)
    return () => {
      stopped = true
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  function getAssetName(symbol: string): string {
    const names: Record<string, string> = {
      'VALE': 'Vale',
      'VALE3': 'Vale ON',
      'PETR4': 'Petrobras',
      'USDB11': 'USD/BRL',
      'BTCBRL': 'Bitcoin',
      'TSLA': 'Tesla',
      'GOOGL': 'Google',
    }
    return names[symbol] || symbol
  }

  function generateSparkline(change: number): number[] {
    const base = 100
    const trend = change >= 0 ? 1 : -1
    return [
      base,
      base + trend * Math.random() * 2,
      base + trend * Math.random() * 4,
      base + trend * Math.random() * 3,
      base + trend * Math.abs(change)
    ]
  }

  const watchlist = assets.filter(a => ['VALE3', 'PETR4', 'USDB11'].includes(a.symbol))

  return (
    <div className="terminal-container">
      {/* Header */}
      <header className="terminal-header">
        <div className="header-left">
          <button 
            className="menu-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            ☰
          </button>
          <h1 className="logo">Dashboard</h1>
        </div>
        <nav className="header-nav">
          <NavLink to="/app" className="nav-link" end>
            Dashboard
          </NavLink>
          <Link to="groups" className="nav-link">
            Grupos
          </Link>
          <Link to="trading" className="nav-link">
            Trading
          </Link>
          <Link to="market-stress" className="nav-link">
            Market Stress
          </Link>
          <Link to="social" className="nav-link">
            Social
          </Link>
          <Link to="portfolio" className="nav-link">
            Portfolio
          </Link>
          <Link to="contracts" className="nav-link">
            Contracts
          </Link>
        </nav>
        <div className="header-right">
          <span className={`feed-badge ${feedStale ? 'stale' : 'live'}`}
            title={feedAgeMs != null ? `Último tick há ${Math.round(feedAgeMs / 1000)}s` : 'Sem ticks recentes'}>
            {feedStale ? 'STALE' : 'LIVE'}
          </span>
          <span className="account-info">Conta: {accountId}</span>
          <Link to="/logout" className="logout-btn">Sair</Link>
        </div>
      </header>

      {/* Main Layout */}
      <div className="terminal-layout">
        {/* Left Sidebar - Dashboard */}
        <aside className={`sidebar-left ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <DashboardSidebar 
            assets={assets}
            watchlist={watchlist}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
            loading={loadingAssets}
            flashMap={flashMap}
            flashKey={flashKey}
          />
        </aside>

        {/* Center - Main Content */}
        <main className="main-content">
          <Outlet context={{ selectedAsset, setSelectedAsset, assets, accountId }} />
        </main>

        {/* Right Sidebar - Messages */}
        <aside className="sidebar-right">
          <MessagesPanel />
        </aside>
      </div>

      {/* Styles */}
      <style>{`
        .terminal-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%);
          color: #e6edf3;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .terminal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: rgba(13, 17, 23, 0.95);
          border-bottom: 1px solid rgba(48, 54, 61, 0.6);
          backdrop-filter: blur(10px);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .menu-toggle {
          background: none;
          border: none;
          color: #8b949e;
          font-size: 18px;
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .menu-toggle:hover {
          background: rgba(48, 54, 61, 0.4);
          color: #e6edf3;
        }

        .logo {
          font-size: 20px;
          font-weight: 700;
          background: linear-gradient(135deg, #58a6ff 0%, #238636 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-nav {
          display: flex;
          gap: 8px;
        }

        .nav-link {
          color: #8b949e;
          text-decoration: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .nav-link:hover {
          color: #e6edf3;
          background: rgba(48, 54, 61, 0.4);
        }

        .nav-link.active {
          color: #58a6ff;
          background: rgba(88, 166, 255, 0.1);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .feed-badge {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.6px;
          border: 1px solid rgba(240, 246, 252, 0.18);
          user-select: none;
        }

        .feed-badge.live {
          background: rgba(63, 185, 80, 0.14);
          border-color: rgba(63, 185, 80, 0.35);
          color: #3fb950;
        }

        .feed-badge.stale {
          background: rgba(248, 81, 73, 0.12);
          border-color: rgba(248, 81, 73, 0.35);
          color: #f85149;
        }

        .account-info {
          font-size: 13px;
          color: #8b949e;
          background: rgba(48, 54, 61, 0.4);
          padding: 6px 12px;
          border-radius: 20px;
        }

        .logout-btn {
          color: #f85149;
          text-decoration: none;
          font-size: 13px;
          padding: 8px 16px;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .logout-btn:hover {
          background: rgba(248, 81, 73, 0.1);
        }

        .terminal-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .sidebar-left {
          width: 280px;
          background: rgba(13, 17, 23, 0.8);
          border-right: 1px solid rgba(48, 54, 61, 0.4);
          overflow-y: auto;
          transition: width 0.3s ease;
        }

        .sidebar-left.collapsed {
          width: 60px;
        }

        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 20px;
          overflow-y: auto;
        }

        .sidebar-right {
          width: 320px;
          background: rgba(13, 17, 23, 0.8);
          border-left: 1px solid rgba(48, 54, 61, 0.4);
          overflow-y: auto;
        }
      `}</style>
    </div>
  )
}

// Dashboard Sidebar Component
function DashboardSidebar({ 
  assets, 
  watchlist,
  selectedAsset, 
  onSelectAsset,
  loading,
  flashMap,
  flashKey,
}: { 
  assets: AssetItem[]
  watchlist: AssetItem[]
  selectedAsset: string
  onSelectAsset: (symbol: string) => void
  loading: boolean
  flashMap: Map<string, 'up' | 'down'>
  flashKey: number
}) {
  if (loading) {
    return (
      <div className="dashboard-panel">
        <div className="loading-state">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="dashboard-panel" data-flash={flashKey}>
      <div className="dashboard-section">
        <h3 className="section-title">Watchlist</h3>
        <div className="asset-list">
          {watchlist.map(asset => (
            <div 
              key={asset.symbol}
              className={`asset-item ${selectedAsset === asset.symbol ? 'selected' : ''} ${flashMap.get(asset.symbol) === 'up' ? 'flash-up' : flashMap.get(asset.symbol) === 'down' ? 'flash-down' : ''}`}
              onClick={() => onSelectAsset(asset.symbol)}
            >
              <div className="asset-info">
                <span className="asset-symbol">{asset.symbol}</span>
                <span className="asset-name">{asset.name}</span>
              </div>
              <div className="asset-price">
                <span className="price-value">
                  {asset.price > 100 ? `$${asset.price.toFixed(2)}` : `$${asset.price.toFixed(4)}`}
                </span>
                <span className={`price-change ${asset.change >= 0 ? 'positive' : 'negative'}`}>
                  {asset.change >= 0 ? '+' : ''}{asset.change.toFixed(2)}%
                </span>
              </div>
              <Sparkline data={asset.sparkline} positive={asset.change >= 0} />
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-section">
        <h3 className="section-title">Mercado</h3>
        <div className="asset-list">
          {assets.map(asset => (
            <div 
              key={asset.symbol}
              className={`asset-item ${selectedAsset === asset.symbol ? 'selected' : ''} ${flashMap.get(asset.symbol) === 'up' ? 'flash-up' : flashMap.get(asset.symbol) === 'down' ? 'flash-down' : ''}`}
              onClick={() => onSelectAsset(asset.symbol)}
            >
              <div className="asset-info">
                <span className="asset-symbol">{asset.symbol}</span>
                <span className="asset-name">{asset.name}</span>
              </div>
              <div className="asset-price">
                <span className="price-value">
                  {asset.price > 100 ? `$${asset.price.toFixed(2)}` : `$${asset.price.toFixed(4)}`}
                </span>
                <span className={`price-change ${asset.change >= 0 ? 'positive' : 'negative'}`}>
                  {asset.change >= 0 ? '+' : ''}{asset.change.toFixed(2)}%
                </span>
              </div>
              <Sparkline data={asset.sparkline} positive={asset.change >= 0} />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .dashboard-panel {
          padding: 16px;
        }

        .loading-state {
          text-align: center;
          padding: 40px 20px;
          color: #8b949e;
          font-size: 14px;
        }

        .dashboard-section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          color: #8b949e;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
          padding-left: 8px;
        }

        .asset-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .asset-item {
          display: flex;
          flex-direction: column;
          padding: 12px;
          background: rgba(48, 54, 61, 0.2);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .asset-item.flash-up {
          border-color: rgba(63, 185, 80, 0.7);
          box-shadow: 0 0 0 1px rgba(63, 185, 80, 0.25);
        }

        .asset-item.flash-down {
          border-color: rgba(248, 81, 73, 0.7);
          box-shadow: 0 0 0 1px rgba(248, 81, 73, 0.25);
        }

        .asset-item:hover {
          background: rgba(48, 54, 61, 0.4);
          border-color: rgba(88, 166, 255, 0.3);
        }

        .asset-item.selected {
          background: rgba(88, 166, 255, 0.1);
          border-color: rgba(88, 166, 255, 0.5);
        }

        .asset-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .asset-symbol {
          font-weight: 600;
          font-size: 13px;
          color: #e6edf3;
        }

        .asset-name {
          font-size: 11px;
          color: #8b949e;
        }

        .asset-price {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .price-value {
          font-size: 14px;
          font-weight: 600;
          color: #e6edf3;
        }

        .price-change {
          font-size: 11px;
          font-weight: 500;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .price-change.positive {
          color: #3fb950;
          background: rgba(63, 185, 80, 0.15);
        }

        .price-change.negative {
          color: #f85149;
          background: rgba(248, 81, 73, 0.15);
        }

        .sparkline {
          width: 60px;
          height: 20px;
        }
      `}</style>
    </div>
  )
}

// Messages Panel Component
function MessagesPanel() {
  const [messages] = useState<ChatMessage[]>([
    { id: '1', user: 'Rodrigo Santos', avatar: 'RS', message: 'Oi, tudo bem?', time: '10:30', online: true },
    { id: '2', user: 'Mariana Lopes', avatar: 'ML', message: 'Vamos investir em VALE3?', time: '10:25', online: false },
    { id: '3', user: 'Carlos Eduardo', avatar: 'CE', message: 'O dólar está em queda', time: '10:15', online: true },
    { id: '4', user: 'Ana Paula', avatar: 'AP', message: 'Análise técnica disponível', time: '09:50', online: true },
  ])
  const [selectedChat, setSelectedChat] = useState<string | null>(null)

  return (
    <div className="messages-panel">
      <div className="messages-header">
        <h3>Mensagens Diretas</h3>
      </div>
      
      <div className="messages-list">
        {messages.map(msg => (
          <div 
            key={msg.id} 
            className={`message-item ${selectedChat === msg.id ? 'selected' : ''}`}
            onClick={() => setSelectedChat(msg.id)}
          >
            <div className="message-avatar">
              {msg.avatar}
              {msg.online && <span className="online-indicator" />}
            </div>
            <div className="message-preview">
              <span className="message-user">{msg.user}</span>
              <span className="message-text">{msg.message}</span>
              <span className="message-time">{msg.time}</span>
            </div>
          </div>
        ))}
      </div>

      {selectedChat && (
        <div className="chat-window">
          <div className="chat-header">
            <span>Conversa com {messages.find(m => m.id === selectedChat)?.user}</span>
            <button onClick={() => setSelectedChat(null)}>✕</button>
          </div>
          <div className="chat-messages">
            <div className="chat-bubble received">
              <p>Olá! Como posso ajudar?</p>
            </div>
            <div className="chat-bubble sent">
              <p>Quero saber sobre VALE3</p>
            </div>
          </div>
          <div className="chat-input">
            <input type="text" placeholder="Digite sua mensagem..." />
            <button>Enviar</button>
          </div>
        </div>
      )}

      <style>{`
        .messages-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .messages-header {
          padding: 16px;
          border-bottom: 1px solid rgba(48, 54, 61, 0.4);
        }

        .messages-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #e6edf3;
        }

        .messages-list {
          flex: 1;
          overflow-y: auto;
        }

        .message-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .message-item:hover {
          background: rgba(48, 54, 61, 0.3);
        }

        .message-item.selected {
          background: rgba(88, 166, 255, 0.1);
        }

        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #58a6ff 0%, #238636 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: white;
          position: relative;
          flex-shrink: 0;
        }

        .online-indicator {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          background: #3fb950;
          border-radius: 50%;
          border: 2px solid #0d1117;
        }

        .message-preview {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .message-user {
          font-size: 13px;
          font-weight: 600;
          color: #e6edf3;
        }

        .message-text {
          font-size: 12px;
          color: #8b949e;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .message-time {
          font-size: 11px;
          color: #6e7681;
        }

        .chat-window {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 300px;
          background: rgba(13, 17, 23, 0.98);
          border-top: 1px solid rgba(48, 54, 61, 0.6);
          display: flex;
          flex-direction: column;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(48, 54, 61, 0.4);
        }

        .chat-header span {
          font-size: 13px;
          font-weight: 600;
          color: #e6edf3;
        }

        .chat-header button {
          background: none;
          border: none;
          color: #8b949e;
          cursor: pointer;
          font-size: 16px;
        }

        .chat-messages {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chat-bubble {
          max-width: 80%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 13px;
        }

        .chat-bubble.received {
          background: rgba(48, 54, 61, 0.6);
          color: #e6edf3;
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }

        .chat-bubble.sent {
          background: linear-gradient(135deg, #58a6ff 0%, #238636 100%);
          color: white;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }

        .chat-input {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid rgba(48, 54, 61, 0.4);
        }

        .chat-input input {
          flex: 1;
          padding: 10px 14px;
          background: rgba(48, 54, 61, 0.4);
          border: 1px solid rgba(48, 54, 61, 0.6);
          border-radius: 20px;
          color: #e6edf3;
          font-size: 13px;
        }

        .chat-input button {
          padding: 10px 20px;
          background: linear-gradient(135deg, #58a6ff 0%, #238636 100%);
          border: none;
          border-radius: 20px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
