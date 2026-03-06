import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type CandlestickData,
} from 'lightweight-charts'
import { apiGet, apiPost } from '../../lib/api'

// Cache global de candles por símbolo (persiste na RAM)
const candlesCache = new Map<string, Map<string, CandlestickData[]>>()

// Conexão global MT5 WebSocket (compartilhada entre todas as instâncias)
let mt5Ws: WebSocket | null = null
let mt5WsCallbacks: Set<(data: any) => void> = new Set()

function getMt5Ws(): WebSocket | null {
  if (mt5Ws && mt5Ws.readyState === WebSocket.OPEN) {
    return mt5Ws
  }
  
  if (!mt5Ws || mt5Ws.readyState === WebSocket.CLOSED) {
    try {
      mt5Ws = new WebSocket('ws://127.0.0.1:8765')
      mt5Ws.onopen = () => {
        console.log('[MT5 WS] Connected to real-time data')
      }
      mt5Ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          mt5WsCallbacks.forEach(cb => cb(data))
        } catch (e) {}
      }
      mt5Ws.onerror = (e) => {
        console.log('[MT5 WS] Error, using fallback data')
      }
      mt5Ws.onclose = () => {
        console.log('[MT5 WS] Disconnected')
      }
    } catch (e) {
      console.log('[MT5 WS] Failed to connect')
    }
  }
  
  return mt5Ws
}

interface AssetItem {
  symbol: string
  name: string
  price: number
  change: number
}

interface TradingContext {
  selectedAsset: string
  assets: AssetItem[]
  accountId: string
}

type L2Level = { price: number; size: number }
type L2Depth = { symbol: string; ts: number; bids: L2Level[]; asks: L2Level[] }
type Trade = { symbol: string; ts: number; priceBRL: number; size: number; side?: 'buy' | 'sell'; tradeId?: string }
type MarketStatus = { ts: number; venue?: string; symbol?: string; status: string; reason?: string }

export default function TradingPage() {
  const { selectedAsset, accountId } = useOutletContext<TradingContext>()
  const chartRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  
  const [range, setRange] = useState('1d')
  const [interval, setInterval] = useState('15m')
  const [loading, setLoading] = useState(false)
  const [quote, setQuote] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Tooltip state - usar ref para atualização instantânea
  const [tooltipData, setTooltipData] = useState<{ time: number; open: number; high: number; low: number; close: number } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const [depth, setDepth] = useState<L2Depth | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null)

  const isBtc = selectedAsset === 'BTCBRL'
  const isFx = selectedAsset === 'USDB11' || selectedAsset.includes('USD') || selectedAsset.includes('EUR')
  const canTrade = !isFx
  const canSell = false

  const wsUrl = useMemo(() => {
    const hostRaw = window.location.hostname
    const host = hostRaw === 'localhost' || hostRaw === '::1' ? '127.0.0.1' : hostRaw
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const base = `${proto}://${host}:3000`
    if (isBtc) return `${base}/ws/btc`
    if (isFx) return `${base}/ws/fx?currency=USD`
    return `${base}/ws/stocks?symbol=${encodeURIComponent(selectedAsset)}`
  }, [isBtc, isFx, selectedAsset])

  function genIdempotencyKey(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    } catch {
      // ignore
    }
    // fallback: uuid-ish
    return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  // Gerar candles simulados consistentes baseados no preço atual
  function generateSimulatedCandles(basePrice: number, rangeStr: string, intervalStr: string): Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }> {
    const now = Math.floor(Date.now() / 1000)
    const intervalMinutes: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '60m': 60, '1h': 60, '1d': 1440 }
    const rangeMinutes: Record<string, number> = { '1d': 1440, '5d': 7200, '1mo': 43200, '3mo': 129600 }
    
    const interval = intervalMinutes[intervalStr] || 15
    const rangeTotal = rangeMinutes[rangeStr] || 1440
    const candleCount = Math.min(Math.floor(rangeTotal / interval), 100)
    
    const candles: Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }> = []
    
    // Usar hash do símbolo para variação consistente
    const symbolHash = selectedAsset.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    const volatility = basePrice * 0.02 // 2% de volatilidade
    
    for (let i = 0; i < candleCount; i++) {
      const time = (now - (candleCount - i) * interval * 60) as UTCTimestamp
      const seed = (symbolHash + i * 17) % 100 / 100
      
      const change = (seed - 0.5) * volatility
      const open = i === 0 ? basePrice : candles[i - 1].close
      const close = Math.max(0.01, open + change)
      const high = Math.max(open, close) + Math.abs(change) * 0.3
      const low = Math.min(open, close) - Math.abs(change) * 0.3
      
      candles.push({ time, open, high, low, close })
    }
    
    return candles
  }

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return
    
    const chart = createChart(chartRef.current, {
      height: 450,
      layout: { 
        background: { color: 'transparent' }, 
        textColor: '#e6edf3' 
      },
      grid: { 
        vertLines: { color: 'rgba(48, 54, 61, 0.3)' }, 
        horzLines: { color: 'rgba(48, 54, 61, 0.3)' } 
      },
      timeScale: { 
        timeVisible: true, 
        secondsVisible: false,
        borderColor: 'rgba(48, 54, 61, 0.5)'
      },
      rightPriceScale: { 
        borderColor: 'rgba(48, 54, 61, 0.5)' 
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(88, 166, 255, 0.5)',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: 'rgba(88, 166, 255, 0.5)',
          width: 1,
          style: 2,
        },
      },
    })

    const series = chart.addCandlestickSeries({
      upColor: '#3fb950',
      downColor: '#f85149',
      borderVisible: false,
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    })

    chartApiRef.current = chart
    seriesRef.current = series

    // Subscribe to crosshair move for tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setTooltipData(null)
        setTooltipPos(null)
        return
      }
      const candleData = param.seriesData.get(series)
      if (candleData && typeof candleData === 'object') {
        const d = candleData as { open: number; high: number; low: number; close: number; time: UTCTimestamp }
        setTooltipData({
          time: d.time as number,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })
        setTooltipPos({ x: param.point.x, y: param.point.y })
      } else {
        setTooltipData(null)
        setTooltipPos(null)
      }
    })

    const handleResize = () => {
      if (chartRef.current) {
        chart.applyOptions({ 
          width: chartRef.current.clientWidth,
          height: chartRef.current.clientHeight 
        })
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      try {
        wsRef.current?.close()
      } catch {
        // ignore
      }
      chart.remove()
    }
  }, [])

  // MT5 Real-time WebSocket connection
  useEffect(() => {
    const handleMt5Data = (data: any) => {
      if (data.type === 'init') {
        // Recebeu estado inicial
        if (data.candles && data.candles[selectedAsset]) {
          const candles = data.candles[selectedAsset].map((c: any) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
          }))
          if (candles.length > 0 && seriesRef.current) {
            seriesRef.current.setData(candles)
            // Atualizar cache
            if (!candlesCache.has(selectedAsset)) {
              candlesCache.set(selectedAsset, new Map())
            }
            candlesCache.get(selectedAsset)!.set(`${selectedAsset}:1d:1m`, candles)
            setQuote(candles[candles.length - 1].close)
          }
        }
        if (data.prices && data.prices[selectedAsset]) {
          setQuote(data.prices[selectedAsset].bid || data.prices[selectedAsset].ask)
        }
      } else if (data.type === 'update') {
        // Atualização em tempo real
        const update = data.data?.[selectedAsset]
        if (update) {
          // Atualizar preço
          if (update.tick) {
            setQuote(update.tick.bid || update.tick.ask)
          }
          // Atualizar candle atual
          if (update.candle && seriesRef.current) {
            seriesRef.current.update({
              time: update.candle.time as UTCTimestamp,
              open: update.candle.open,
              high: update.candle.high,
              low: update.candle.low,
              close: update.candle.close
            })
          }
        }
      }
    }
    
    // Registrar callback
    mt5WsCallbacks.add(handleMt5Data)
    
    // Conectar
    getMt5Ws()
    
    return () => {
      mt5WsCallbacks.delete(handleMt5Data)
    }
  }, [selectedAsset])

  // Load chart data
  useEffect(() => {
    void loadChartData()
  }, [selectedAsset, range, interval])

  async function loadChartData() {
    if (!seriesRef.current) return
    
    const cacheKey = `${selectedAsset}:${range}:${interval}`
    
    // Verificar cache primeiro
    if (candlesCache.has(selectedAsset)) {
      const symbolCache = candlesCache.get(selectedAsset)!
      if (symbolCache.has(cacheKey)) {
        const cachedCandles = symbolCache.get(cacheKey)!
        seriesRef.current.setData(cachedCandles)
        if (cachedCandles.length > 0) {
          setQuote(cachedCandles[cachedCandles.length - 1].close)
        }
        return
      }
    }
    
    setLoading(true)
    setError(null)
    try {
      let candles: Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }> = []
      
      // Primeiro tentar MT5 candles (forex)
      const mt5Res = await apiGet<any>(`/api/v1/mt5/${encodeURIComponent(selectedAsset)}/candles`)
      if (mt5Res?.candles && mt5Res.candles.length > 0) {
        candles = mt5Res.candles.filter((c: any) => {
          if (!c) return false
          const t = Number(c.time)
          if (!Number.isFinite(t) || t <= 0) return false
          const o = Number(c.open)
          const h = Number(c.high)
          const l = Number(c.low)
          const cl = Number(c.close)
          return [o, h, l, cl].every((v) => Number.isFinite(v))
        }).map((c: any) => ({
          time: (Number(c.time) as UTCTimestamp),
          open: Number(c.open) || 0,
          high: Number(c.high) || 0,
          low: Number(c.low) || 0,
          close: Number(c.close) || 0,
        }))
      }
      
      // Se não encontrou no MT5, buscar de outras fontes
      let quoteRes: any = null
      if (candles.length === 0) {
        let url = ''
        if (selectedAsset === 'BTCBRL') {
          url = `/api/v1/btc/history?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`
        } else if (selectedAsset === 'USDB11' || selectedAsset.includes('USD')) {
          url = `/api/v1/fx/history?currency=USD&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`
        } else {
          url = `/api/v1/stocks/${encodeURIComponent(selectedAsset)}/history+quote?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`
        }
        
        const res = await apiGet<any>(url)
        quoteRes = res
        const data = res.data || res.candles || []
        
        candles = data.filter((c: any) => {
          if (!c) return false
          const t = Number(c.time)
          if (!Number.isFinite(t) || t <= 0) return false
          const o = Number(c.open)
          const h = Number(c.high)
          const l = Number(c.low)
          const cl = Number(c.close)
          return [o, h, l, cl].every((v) => Number.isFinite(v))
        }).map((c: any) => ({
          time: (Number(c.time) as UTCTimestamp),
          open: Number(c.open) || 0,
          high: Number(c.high) || 0,
          low: Number(c.low) || 0,
          close: Number(c.close) || 0,
        }))
      }
      
      // Se não há candles reais, gerar candles simulados consistentes baseados no preço atual
      if (candles.length === 0 && quote && Number.isFinite(quote) && quote > 0) {
        candles = generateSimulatedCandles(quote, range, interval)
      }
      
      // Salvar no cache
      if (candles.length > 0) {
        if (!candlesCache.has(selectedAsset)) {
          candlesCache.set(selectedAsset, new Map())
        }
        candlesCache.get(selectedAsset)!.set(cacheKey, candles)
      }
      
      seriesRef.current.setData(candles)
      
      // Update quote with latest price
      if (candles.length > 0) {
        setQuote(candles[candles.length - 1].close)
      }

      // Prefer real quote when available
      if (!isBtc && !isFx && quoteRes?.quote && Number.isFinite(Number(quoteRes.quote.priceBRL))) {
        setQuote(Number(quoteRes.quote.priceBRL))
      }
    } catch (err) {
      console.error('Failed to load chart data:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // connect WS for live ticks
    try {
      wsRef.current?.close()
    } catch {
      // ignore
    }

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    const isStocks = !isBtc && !isFx

    ws.onopen = () => {
      if (!isStocks) return
      try {
        ws.send(
          JSON.stringify({
            type: 'set_symbols',
            symbols: [String(selectedAsset).toUpperCase()],
            streams: ['ticks', 'depth_l2', 'trades', 'status'],
          })
        )
      } catch {
        // ignore
      }
    }

    ws.onmessage = (ev) => {
      let msg: any
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }

      if (!msg || typeof msg !== 'object') return

      if (isBtc) {
        if (msg.type !== 'tick') return
        const p = Number(msg.priceBRL)
        if (Number.isFinite(p) && p > 0) setQuote(p)
        return
      }

      if (isFx) {
        if (msg.type !== 'tick') return
        const r = Number(msg.rate)
        if (Number.isFinite(r) && r > 0) setQuote(r)
        return
      }

      const sym = String(msg.symbol || '').toUpperCase()
      if (sym && sym !== String(selectedAsset).toUpperCase()) return

      if (msg.type === 'init') {
        if (msg?.lastPrices && typeof msg.lastPrices === 'object') {
          const p = Number((msg.lastPrices as any)[String(selectedAsset).toUpperCase()])
          if (Number.isFinite(p) && p > 0) setQuote(p)
        }

        const d = msg?.depthL2?.[String(selectedAsset).toUpperCase()]
        if (d && typeof d === 'object') {
          const bids = Array.isArray(d.bids) ? d.bids : []
          const asks = Array.isArray(d.asks) ? d.asks : []
          setDepth({
            symbol: String(d.symbol || selectedAsset).toUpperCase(),
            ts: Number(d.ts) || Date.now(),
            bids: bids.map((x: any) => ({ price: Number(x?.price), size: Number(x?.size) })).filter((x: any) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.size) && x.size >= 0).slice(0, 10),
            asks: asks.map((x: any) => ({ price: Number(x?.price), size: Number(x?.size) })).filter((x: any) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.size) && x.size >= 0).slice(0, 10),
          })
        }

        const t = msg?.trades?.[String(selectedAsset).toUpperCase()]
        if (Array.isArray(t)) {
          const next = t
            .map((x: any) => ({
              symbol: String(x?.symbol || selectedAsset).toUpperCase(),
              ts: Number(x?.ts) || Date.now(),
              priceBRL: Number(x?.priceBRL ?? x?.price),
              size: Number(x?.size ?? x?.qty),
              side: x?.side === 'buy' || x?.side === 'sell' ? x.side : undefined,
              tradeId: x?.tradeId,
            }))
            .filter((x: any) => Number.isFinite(x.priceBRL) && x.priceBRL > 0 && Number.isFinite(x.size) && x.size > 0)
            .slice(-50)
          setTrades(next)
        }

        const st = msg?.status
        if (st && typeof st === 'object' && typeof st.status === 'string') {
          setMarketStatus({
            ts: Number(st.ts) || Date.now(),
            venue: st.venue,
            symbol: st.symbol ? String(st.symbol).toUpperCase() : undefined,
            status: String(st.status),
            reason: st.reason,
          })
        }

        return
      }

      if (msg.type === 'tick') {
        const p = Number(msg.priceBRL)
        if (Number.isFinite(p) && p > 0) setQuote(p)
        return
      }

      if (msg.type === 'depth_l2') {
        const bids = Array.isArray(msg.bids) ? msg.bids : []
        const asks = Array.isArray(msg.asks) ? msg.asks : []
        setDepth({
          symbol: String(msg.symbol || selectedAsset).toUpperCase(),
          ts: Number(msg.ts) || Date.now(),
          bids: bids.map((x: any) => ({ price: Number(x?.price), size: Number(x?.size) })).filter((x: any) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.size) && x.size >= 0).slice(0, 10),
          asks: asks.map((x: any) => ({ price: Number(x?.price), size: Number(x?.size) })).filter((x: any) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.size) && x.size >= 0).slice(0, 10),
        })
        return
      }

      if (msg.type === 'trade') {
        const price = Number(msg.priceBRL ?? msg.price)
        const size = Number(msg.size ?? msg.qty)
        if (!Number.isFinite(price) || price <= 0) return
        if (!Number.isFinite(size) || size <= 0) return
        const next: Trade = {
          symbol: String(msg.symbol || selectedAsset).toUpperCase(),
          ts: Number(msg.ts) || Date.now(),
          priceBRL: price,
          size,
          side: msg.side === 'buy' || msg.side === 'sell' ? msg.side : undefined,
          tradeId: msg.tradeId,
        }
        setTrades((prev) => {
          const arr = prev.slice()
          arr.push(next)
          while (arr.length > 50) arr.shift()
          return arr
        })
        return
      }

      if (msg.type === 'status') {
        if (typeof msg.status !== 'string') return
        setMarketStatus({
          ts: Number(msg.ts) || Date.now(),
          venue: msg.venue,
          symbol: msg.symbol ? String(msg.symbol).toUpperCase() : undefined,
          status: String(msg.status),
          reason: msg.reason,
        })
      }
    }

    ws.onclose = () => {
      // no auto-reconnect here; history refresh runs by user action
    }

    return () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }, [wsUrl, isBtc, isFx, selectedAsset])

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!canTrade) return
    if (orderType === 'sell') return
    if (!amount) return
    
    setSubmitting(true)
    setError(null)
    try {
      if (!accountId) throw new Error('accountId não encontrado')
      const key = genIdempotencyKey()

      if (isBtc) {
        const amountBtc = Number(String(amount).replace(',', '.'))
        if (!Number.isFinite(amountBtc) || amountBtc <= 0) throw new Error('Quantidade BTC inválida')
        const res = await apiPost<any>('/api/v1/orders/btc', { accountId, amountBtc, idempotencyKey: key })
        alert(`Ordem BTC enviada. Status: ${String(res?.status ?? 'PENDING')}`)
        setAmount('')
        return
      }

      const quantity = Number.parseInt(String(amount), 10)
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantidade inválida')
      const res = await apiPost<any>('/api/v1/orders/stock', { accountId, symbol: selectedAsset, quantity, idempotencyKey: key })
      alert(`Ordem de ação enviada. Status: ${String(res?.status ?? 'PENDING')}`)
      setAmount('')
    } catch (err) {
      console.error('Order failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const total = useMemo(() => {
    if (!quote) return null
    if (isBtc) {
      const qty = Number(String(amount).replace(',', '.'))
      if (!Number.isFinite(qty) || qty <= 0) return null
      return qty * quote
    }
    if (isFx) return null
    const qty = Number.parseInt(String(amount), 10)
    if (!Number.isFinite(qty) || qty <= 0) return null
    return qty * quote
  }, [amount, quote, isBtc, isFx])

  return (
    <div className="trading-page">
      {/* Asset Header */}
      <div className="trading-header">
        <div className="asset-info">
          <h1>{selectedAsset}</h1>
          <span className="asset-subtitle">Trading</span>
        </div>
        <div className="price-display">
          <span className="current-price">
            {quote ? `$${quote.toFixed(2)}` : '—'}
          </span>
          <span className="price-change positive">+0.00%</span>
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: '1px solid rgba(248, 81, 73, 0.3)', background: 'rgba(248, 81, 73, 0.08)', color: '#f85149' }}>
          {error}
        </div>
      ) : null}

      {/* Chart Controls */}
      <div className="chart-controls">
        <div className="time-controls">
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="1h">1H</option>
            <option value="1d">1D</option>
            <option value="1w">1W</option>
            <option value="1mo">1M</option>
          </select>
          <select value={interval} onChange={(e) => setInterval(e.target.value)}>
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
          </select>
        </div>
        <button 
          className="btn-refresh"
          onClick={() => loadChartData()}
          disabled={loading}
        >
          {loading ? 'Carregando...' : '↻ Atualizar'}
        </button>
      </div>

      {/* Chart */}
      <div className="chart-container" style={{ position: 'relative' }}>
        <div ref={chartRef} style={{ height: '100%', width: '100%' }} />
        {tooltipData && tooltipPos && (
          <div 
            ref={tooltipRef}
            className="chart-tooltip"
            style={{
              position: 'absolute',
              left: `${Math.min(tooltipPos.x + 15, (chartRef.current?.clientWidth || 400) - 180)}px`,
              top: `${Math.max(tooltipPos.y - 90, 10)}px`,
              background: 'rgba(22, 27, 34, 0.95)',
              border: '1px solid rgba(48, 54, 61, 0.8)',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#e6edf3',
              pointerEvents: 'none',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              minWidth: '150px',
            }}
          >
            <div style={{ marginBottom: '6px', fontWeight: 'bold', color: '#58a6ff', fontSize: '11px' }}>
              {new Date(tooltipData.time * 1000).toLocaleString('pt-BR')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 16px', fontSize: '12px' }}>
              <span style={{ color: '#8b949e' }}>Abertura:</span>
              <span style={{ color: '#e6edf3' }}>R$ {tooltipData.open.toFixed(2)}</span>
              <span style={{ color: '#8b949e' }}>Máxima:</span>
              <span style={{ color: '#3fb950' }}>R$ {tooltipData.high.toFixed(2)}</span>
              <span style={{ color: '#8b949e' }}>Mínima:</span>
              <span style={{ color: '#f85149' }}>R$ {tooltipData.low.toFixed(2)}</span>
              <span style={{ color: '#8b949e' }}>Fechamento:</span>
              <span style={{ color: tooltipData.close >= tooltipData.open ? '#3fb950' : '#f85149', fontWeight: 'bold' }}>R$ {tooltipData.close.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {!isBtc && !isFx ? (
        <div className="microstructure-grid">
          <div className="micro-panel">
            <div className="micro-title">
              Book L2
              {depth?.ts ? <span className="micro-sub">ts: {new Date(depth.ts).toLocaleTimeString()}</span> : null}
            </div>
            <div className="book-grid">
              <div className="book-col">
                <div className="book-head">Bids</div>
                {(depth?.bids || []).map((l, i) => (
                  <div className="book-row" key={`b-${i}-${l.price}`}> 
                    <span className="book-price bid">{l.price.toFixed(2)}</span>
                    <span className="book-size">{Number.isFinite(l.size) ? l.size : 0}</span>
                  </div>
                ))}
              </div>
              <div className="book-col">
                <div className="book-head">Asks</div>
                {(depth?.asks || []).map((l, i) => (
                  <div className="book-row" key={`a-${i}-${l.price}`}> 
                    <span className="book-price ask">{l.price.toFixed(2)}</span>
                    <span className="book-size">{Number.isFinite(l.size) ? l.size : 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="micro-panel">
            <div className="micro-title">
              Time & Sales
              <span className="micro-sub">últimos {trades.length}</span>
            </div>
            <div className="tape">
              {trades.slice().reverse().map((t, idx) => (
                <div className={`tape-row ${t.side === 'buy' ? 'buy' : t.side === 'sell' ? 'sell' : ''}`} key={`${t.tradeId ?? ''}-${t.ts}-${idx}`}> 
                  <span className="tape-time">{new Date(t.ts).toLocaleTimeString()}</span>
                  <span className="tape-price">{t.priceBRL.toFixed(2)}</span>
                  <span className="tape-size">{t.size}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="micro-panel">
            <div className="micro-title">Market Status</div>
            <div className="status-box">
              <div className="status-row">
                <span className="status-k">Status</span>
                <span className="status-v">{marketStatus?.status ?? '—'}</span>
              </div>
              <div className="status-row">
                <span className="status-k">Reason</span>
                <span className="status-v">{marketStatus?.reason ?? '—'}</span>
              </div>
              <div className="status-row">
                <span className="status-k">Venue</span>
                <span className="status-v">{marketStatus?.venue ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Order Panel */}
      <div className="order-section">
        <div className="order-tabs">
          <button 
            className={`order-tab ${orderType === 'buy' ? 'active' : ''}`}
            onClick={() => setOrderType('buy')}
            disabled={!canTrade}
          >
            Comprar
          </button>
          <button 
            className={`order-tab ${orderType === 'sell' ? 'active' : ''}`}
            onClick={() => setOrderType('sell')}
            disabled={!canSell}
          >
            Vender
          </button>
        </div>

        <form onSubmit={submitOrder} className="order-form">
          <div className="form-row">
            <div className="form-group">
              <label>{isBtc ? 'Quantidade (BTC)' : isFx ? 'Quantidade (indisponível)' : 'Quantidade (ações)'} </label>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                disabled={!canTrade || submitting}
              />
            </div>
            <div className="form-group">
              <label>Preço Atual</label>
              <div className="price-field">
                {quote ? `$${quote.toFixed(2)}` : '—'}
              </div>
            </div>
          </div>

          <div className="order-summary">
            <div className="summary-row">
              <span>Total Estimado:</span>
              <span className="summary-value">
                {total ? `$${total.toFixed(2)}` : '—'}
              </span>
            </div>
          </div>

          <button 
            type="submit" 
            className={`btn-submit ${orderType}`}
            disabled={!canTrade || orderType !== 'buy' || !amount || submitting}
          >
            {isFx
              ? 'Trading indisponível para FX'
              : submitting
                ? 'Enviando...' 
                : `Enviar ordem de compra (${selectedAsset})`}
          </button>
        </form>
      </div>

      <style>{`
        .trading-page {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .trading-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding: 20px;
          background: rgba(48, 54, 61, 0.2);
          border-radius: 12px;
        }

        .asset-info h1 {
          margin: 0 0 4px 0;
          font-size: 24px;
          font-weight: 700;
          color: #e6edf3;
        }

        .asset-subtitle {
          font-size: 12px;
          color: #8b949e;
        }

        .price-display {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }

        .current-price {
          font-size: 28px;
          font-weight: 700;
          color: #e6edf3;
        }

        .price-change {
          font-size: 14px;
          font-weight: 500;
          padding: 4px 8px;
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

        .chart-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .time-controls {
          display: flex;
          gap: 8px;
        }

        .time-controls select {
          background: rgba(48, 54, 61, 0.4);
          border: 1px solid rgba(48, 54, 61, 0.6);
          color: #e6edf3;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }

        .btn-refresh {
          padding: 8px 16px;
          background: rgba(48, 54, 61, 0.4);
          border: 1px solid rgba(48, 54, 61, 0.6);
          color: #e6edf3;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-refresh:hover {
          background: rgba(48, 54, 61, 0.6);
        }

        .chart-container {
          height: 450px;
          background: rgba(48, 54, 61, 0.1);
          border-radius: 12px;
          margin-bottom: 20px;
          overflow: hidden;
        }

        .microstructure-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr 0.8fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        .micro-panel {
          background: rgba(48, 54, 61, 0.2);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid rgba(48, 54, 61, 0.35);
          min-height: 240px;
          display: flex;
          flex-direction: column;
        }

        .micro-title {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          font-size: 12px;
          font-weight: 700;
          color: #e6edf3;
          margin-bottom: 12px;
        }

        .micro-sub {
          font-size: 11px;
          font-weight: 500;
          color: #8b949e;
        }

        .book-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          flex: 1;
        }

        .book-col {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .book-head {
          font-size: 11px;
          color: #8b949e;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          margin-bottom: 4px;
        }

        .book-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          padding: 6px 8px;
          border-radius: 8px;
          background: rgba(13, 17, 23, 0.4);
          border: 1px solid rgba(48, 54, 61, 0.35);
        }

        .book-price.bid { color: #3fb950; }
        .book-price.ask { color: #f85149; }
        .book-size { color: #e6edf3; }

        .tape {
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow: auto;
          flex: 1;
        }

        .tape-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          font-size: 12px;
          padding: 6px 8px;
          border-radius: 8px;
          background: rgba(13, 17, 23, 0.4);
          border: 1px solid rgba(48, 54, 61, 0.35);
        }

        .tape-row.buy { border-color: rgba(63, 185, 80, 0.35); }
        .tape-row.sell { border-color: rgba(248, 81, 73, 0.35); }

        .tape-time { color: #8b949e; }
        .tape-price { color: #e6edf3; font-weight: 600; }
        .tape-size { color: #e6edf3; text-align: right; }

        .status-box {
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
        }

        .status-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(13, 17, 23, 0.4);
          border: 1px solid rgba(48, 54, 61, 0.35);
        }

        .status-k { color: #8b949e; }
        .status-v { color: #e6edf3; font-weight: 600; text-align: right; }

        .order-section {
          background: rgba(48, 54, 61, 0.2);
          border-radius: 12px;
          padding: 20px;
        }

        .order-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
        }

        .order-tab {
          flex: 1;
          padding: 12px;
          background: none;
          border: none;
          color: #8b949e;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .order-tab.active {
          background: rgba(63, 185, 80, 0.2);
          color: #3fb950;
        }

        .order-tab:not(.active):hover {
          background: rgba(48, 54, 61, 0.4);
          color: #e6edf3;
        }

        .order-tab.active[data-type="sell"] {
          background: rgba(248, 81, 73, 0.2);
          color: #f85149;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 12px;
          color: #8b949e;
          text-transform: uppercase;
        }

        .form-group input {
          padding: 12px;
          background: rgba(13, 17, 23, 0.6);
          border: 1px solid rgba(48, 54, 61, 0.6);
          border-radius: 8px;
          color: #e6edf3;
          font-size: 14px;
        }

        .price-field {
          padding: 12px;
          background: rgba(13, 17, 23, 0.6);
          border: 1px solid rgba(48, 54, 61, 0.6);
          border-radius: 8px;
          color: #e6edf3;
          font-size: 14px;
          font-weight: 600;
        }

        .order-summary {
          background: rgba(48, 54, 61, 0.3);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .summary-row span:first-child {
          font-size: 14px;
          color: #8b949e;
        }

        .summary-value {
          font-size: 18px;
          font-weight: 700;
          color: #e6edf3;
        }

        .btn-submit {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-submit.buy {
          background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
          color: white;
        }

        .btn-submit.buy:hover {
          background: linear-gradient(135deg, #2ea043 0%, #3fb950 100%);
        }

        .btn-submit.sell {
          background: linear-gradient(135deg, #f85149 0%, #fa4542 100%);
          color: white;
        }

        .btn-submit.sell:hover {
          background: linear-gradient(135deg, #fa4542 0%, #ff6b6b 100%);
        }

        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
          
          .trading-header {
            flex-direction: column;
            gap: 16px;
            align-items: flex-start;
          }
          
          .price-display {
            align-items: flex-start;
          }

          .microstructure-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
