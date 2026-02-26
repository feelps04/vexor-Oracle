import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useOutletContext } from 'react-router-dom'
import { apiGet } from '../../lib/api'

type SymbolsResponse = { group: string; total: number; symbols: string[] }

type AssetItem = {
  symbol: string
  name: string
  price: number
  change: number
}

type TerminalContext = {
  selectedAsset: string
  setSelectedAsset: (symbol: string) => void
  assets: AssetItem[]
  accountId: string
}

export default function GroupPage() {
  const params = useParams()
  const { selectedAsset, setSelectedAsset, assets } = useOutletContext<TerminalContext>()
  const group = String(params.group || '').toUpperCase()

  const [meta, setMeta] = useState<{ total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const symbolsInMemory = useMemo(() => assets.map((a) => a.symbol), [assets])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const res = await apiGet<SymbolsResponse>(`/api/v1/market/groups/${encodeURIComponent(group)}/symbols?limit=200`)
        if (cancelled) return
        setMeta({ total: Number(res?.total) || 0 })
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setMeta(null)
      }
    }
    if (group) void load()
    return () => {
      cancelled = true
    }
  }, [group])

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{group || 'Grupo'}</h1>
          <div style={{ color: '#8b949e', fontSize: 13 }}>
            {meta ? `${meta.total} símbolos no grupo` : '—'}
          </div>
        </div>
        <Link to="/app/groups" style={{ color: '#58a6ff', textDecoration: 'none' }}>
          Voltar
        </Link>
      </div>

      {error ? (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: '1px solid rgba(248, 81, 73, 0.3)', background: 'rgba(248, 81, 73, 0.08)', color: '#f85149' }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginBottom: 14, color: '#8b949e', fontSize: 13 }}>
        Os preços são atualizados em tempo real e a lista é limitada para evitar sobrecarga.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {assets.map((a) => (
          <button
            key={a.symbol}
            onClick={() => setSelectedAsset(a.symbol)}
            style={{
              textAlign: 'left',
              borderRadius: 12,
              padding: 12,
              border: a.symbol === selectedAsset ? '1px solid rgba(88, 166, 255, 0.6)' : '1px solid rgba(48, 54, 61, 0.35)',
              background: a.symbol === selectedAsset ? 'rgba(88, 166, 255, 0.08)' : 'rgba(48, 54, 61, 0.2)',
              color: '#e6edf3',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontWeight: 800 }}>{a.symbol}</div>
              <div style={{ fontWeight: 700 }}>{Number.isFinite(a.price) && a.price > 0 ? a.price.toFixed(2) : '—'}</div>
            </div>
            <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>{a.name}</div>
          </button>
        ))}
      </div>

      {symbolsInMemory.length === 0 ? (
        <div style={{ marginTop: 16, color: '#8b949e' }}>Nenhum símbolo carregado para este grupo.</div>
      ) : null}
    </div>
  )
}
