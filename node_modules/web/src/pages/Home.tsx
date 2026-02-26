import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts'
import { apiGet, apiPost } from '../lib/api'
import { getAuth } from '../lib/auth'

type BalanceRes = { accountId: string; balance: number }
type BalanceOpRes = { accountId: string; operation: 'deposit' | 'withdraw'; amount: number; previousBalance: number; newBalance: number }
type BalanceAtRes = { accountId: string; at: string; balanceBrl: number }
type BalanceSeriesRes = { accountId: string; points: Array<{ time: number; balanceBrl: number }> }

function formatBRLFromCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

function brlToCents(input: string): number {
  const normalized = input.replace(',', '.').trim()
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return NaN
  return Math.round(n * 100)
}

export default function HomePage() {
  const auth = getAuth()
  const accountId = auth?.accountId

  const [balance, setBalance] = useState<number | null>(null)
  const [amountBrl, setAmountBrl] = useState('1000')
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [tmAt, setTmAt] = useState<string>(() => {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  })
  const [tmBalance, setTmBalance] = useState<number | null>(null)

  const chartRef = useRef<HTMLDivElement | null>(null)
  const chartApiRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)

  const canUse = useMemo(() => Boolean(accountId), [accountId])

  async function refreshBalance() {
    if (!accountId) return
    const res = await apiGet<BalanceRes>(`/api/v1/accounts/${encodeURIComponent(accountId)}/balance`)
    setBalance(res.balance)
  }

  async function refreshTimeMachine() {
    if (!accountId) return
    const atIso = tmAt ? new Date(tmAt).toISOString() : new Date().toISOString()
    const res = await apiGet<BalanceAtRes>(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/balance-at?at=${encodeURIComponent(atIso)}`
    )
    setTmBalance(res.balanceBrl)
  }

  async function refreshSeries() {
    if (!accountId) return
    const res = await apiGet<BalanceSeriesRes>(`/api/v1/accounts/${encodeURIComponent(accountId)}/balance-series`)
    const data: LineData[] = (res.points || []).map((p) => ({ time: p.time as any, value: p.balanceBrl / 100 }))
    seriesRef.current?.setData(data)
    chartApiRef.current?.timeScale().fitContent()
  }

  async function doOperation(type: 'deposit' | 'withdraw') {
    if (!accountId) return
    setStatus(null)
    const cents = brlToCents(amountBrl)
    if (!Number.isFinite(cents) || cents <= 0) {
      setStatus('Valor inválido')
      return
    }
    setLoading(true)
    try {
      const res = await apiPost<BalanceOpRes>(
        `/api/v1/accounts/${encodeURIComponent(accountId)}/${type}`,
        { amount: cents }
      )
      setBalance(res.newBalance)
      setStatus(`${type === 'deposit' ? 'Depósito' : 'Retirada'} ok. Novo saldo: ${formatBRLFromCents(res.newBalance)}`)
      await Promise.all([refreshSeries(), refreshTimeMachine()])
    } catch (err: any) {
      setStatus(err?.message || 'Erro na operação')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!chartRef.current) return
    if (chartApiRef.current) return

    const chart = createChart(chartRef.current, {
      height: 260,
      layout: { background: { color: 'transparent' }, textColor: '#D9D9D9' },
      grid: { vertLines: { color: 'rgba(42, 46, 57, 0.4)' }, horzLines: { color: 'rgba(42, 46, 57, 0.4)' } },
      timeScale: { timeVisible: true, secondsVisible: true },
    })
    const series = chart.addLineSeries({ color: '#22c55e', lineWidth: 2 })
    chartApiRef.current = chart
    seriesRef.current = series

    const resize = () => {
      if (!chartRef.current) return
      chart.applyOptions({ width: chartRef.current.clientWidth })
    }
    window.addEventListener('resize', resize)
    resize()

    return () => {
      window.removeEventListener('resize', resize)
      chart.remove()
      chartApiRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!accountId) return
    void refreshBalance()
    void refreshTimeMachine()
    void refreshSeries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  return (
    <div>
      <h1>Dashboard</h1>

      {!canUse ? (
        <p style={{ opacity: 0.8 }}>Faça login para acessar seu saldo.</p>
      ) : (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ padding: 16, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}>
              <h2 style={{ marginTop: 0 }}>Saldo</h2>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {balance == null ? '—' : formatBRLFromCents(balance)}
              </div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>Account: {accountId}</div>

              <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Valor (BRL)</span>
                  <input value={amountBrl} onChange={(e) => setAmountBrl(e.target.value)} inputMode="decimal" />
                </label>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button disabled={loading} onClick={() => void doOperation('deposit')}>
                    Depositar (+)
                  </button>
                  <button disabled={loading} onClick={() => void doOperation('withdraw')}>
                    Retirar (-)
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => {
                      setLoading(true)
                      Promise.all([refreshBalance(), refreshTimeMachine(), refreshSeries()]).finally(() => setLoading(false))
                    }}
                  >
                    Atualizar
                  </button>
                </div>

                {status ? <div style={{ opacity: 0.9 }}>{status}</div> : null}
              </div>
            </div>

            <div style={{ padding: 16, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}>
              <h2 style={{ marginTop: 0 }}>Financial Time Machine</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span>Data/Hora</span>
                  <input
                    type="datetime-local"
                    value={tmAt}
                    onChange={(e) => setTmAt(e.target.value)}
                  />
                </label>
                <button disabled={loading} onClick={() => void refreshTimeMachine()}>
                  Consultar
                </button>
                <div>
                  <strong>Saldo no momento:</strong>{' '}
                  {tmBalance == null ? '—' : formatBRLFromCents(tmBalance)}
                </div>
              </div>
            </div>
          </section>

          <section style={{ marginTop: 16, padding: 16, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}>
            <h2 style={{ marginTop: 0 }}>Movimentação</h2>
            <div ref={chartRef} style={{ width: '100%', height: 260 }} />
          </section>
        </>
      )}
    </div>
  )
}
