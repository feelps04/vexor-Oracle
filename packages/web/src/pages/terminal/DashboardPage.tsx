import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { apiGet } from '../../lib/api'

interface AssetItem {
  symbol: string
  name: string
  price: number
  change: number
}

interface DashboardContext {
  selectedAsset: string
  assets: AssetItem[]
  accountId: string
}

export default function DashboardPage() {
  const { selectedAsset, assets, accountId } = useOutletContext<DashboardContext>()
  const [balance, setBalance] = useState<number | null>(null)
  const [usdBrl, setUsdBrl] = useState<number | null>(null)
  const [btcBrl, setBtcBrl] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fxRetryAtRef = useRef<number>(0)
  const fxBackoffMsRef = useRef<number>(10_000)
  const btcRetryAtRef = useRef<number>(0)
  const btcBackoffMsRef = useRef<number>(10_000)

  // Load real data
  useEffect(() => {
    async function loadData() {
      try {
        setError(null)

        if (accountId) {
          const bal = await apiGet<{ accountId: string; balance: number }>(
            `/api/v1/accounts/${encodeURIComponent(accountId)}/balance`
          )
          setBalance(Number(bal.balance))
        }

        if (Date.now() >= fxRetryAtRef.current) {
          try {
            const fx = await apiGet<{ currency: string; pair: string; rateBRL: number }>(
              `/api/v1/fx/quote?currency=USD`
            )
            setUsdBrl(Number.isFinite(Number(fx?.rateBRL)) ? Number(fx.rateBRL) : null)
            fxBackoffMsRef.current = 10_000
            fxRetryAtRef.current = 0
          } catch {
            setUsdBrl(null)
            const backoff = Math.min(120_000, fxBackoffMsRef.current)
            fxRetryAtRef.current = Date.now() + backoff
            fxBackoffMsRef.current = Math.min(120_000, backoff * 2)
          }
        }

        if (Date.now() >= btcRetryAtRef.current) {
          try {
            const btc = await apiGet<{ symbol: string; priceBRL: number }>(`/api/v1/btc/quote`)
            setBtcBrl(Number.isFinite(Number(btc?.priceBRL)) ? Number(btc.priceBRL) : null)
            btcBackoffMsRef.current = 10_000
            btcRetryAtRef.current = 0
          } catch {
            setBtcBrl(null)
            const backoff = Math.min(120_000, btcBackoffMsRef.current)
            btcRetryAtRef.current = Date.now() + backoff
            btcBackoffMsRef.current = Math.min(120_000, backoff * 2)
          }
        }
      } catch (err) {
        console.error('Failed to load market data:', err)
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    
    void loadData()
    const interval = setInterval(loadData, 10_000)
    return () => clearInterval(interval)
  }, [accountId])

  const selected = useMemo(() => assets.find((a) => a.symbol === selectedAsset) ?? null, [assets, selectedAsset])
  const balanceBr = useMemo(() => {
    if (balance == null) return '—'
    return `R$ ${balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }, [balance])

  return (
    <div className="dashboard-page">
      {/* Welcome Section */}
      <div className="welcome-section">
        <h1>Visão Geral do Mercado</h1>
        <p>Bem-vindo ao seu dashboard de trading</p>
      </div>

      {/* Market Overview Cards */}
      <div className="overview-cards">
        <div className="overview-card">
          <div className="card-icon">📈</div>
          <div className="card-content">
            <span className="card-label">Saldo</span>
            <span className="card-value">{balanceBr}</span>
            {error ? <span className="card-change negative">{error}</span> : <span className="card-change">&nbsp;</span>}
          </div>
        </div>
        <div className="overview-card">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <span className="card-label">Conta</span>
            <span className="card-value">{accountId ? accountId.slice(0, 8) : '—'}</span>
            <span className="card-change">&nbsp;</span>
          </div>
        </div>
        <div className="overview-card">
          <div className="card-icon">🌐</div>
          <div className="card-content">
            <span className="card-label">USD/BRL</span>
            <span className="card-value">{usdBrl ? `R$ ${usdBrl.toFixed(4)}` : '—'}</span>
            <span className="card-change">&nbsp;</span>
          </div>
        </div>
        <div className="overview-card">
          <div className="card-icon">₿</div>
          <div className="card-content">
            <span className="card-label">BTC/BRL</span>
            <span className="card-value">{btcBrl ? `R$ ${btcBrl.toFixed(2)}` : '—'}</span>
            <span className="card-change">&nbsp;</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Selected Asset Preview */}
        <div className="dashboard-card asset-preview">
          <div className="card-header">
            <h3>Ativo Selecionado: {selectedAsset}</h3>
            <Link to="/app/trading" className="btn-trade">Ir para Trading</Link>
          </div>
          <div className="preview-content">
            {selected ? (
              <div className="preview-details">
                <div className="preview-price">
                  <span className="price-label">Preço Atual</span>
                  <span className="price-value">
                    ${selected.price.toFixed(2)}
                  </span>
                </div>
                <div className="preview-change">
                  <span className="change-label">Variação</span>
                  <span className={`change-value ${selected.change >= 0 ? 'positive' : 'negative'}`}>
                    {selected.change >= 0 ? '+' : ''}
                    {selected.change.toFixed(2)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="preview-loading">Carregando dados...</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="dashboard-card recent-activity">
          <div className="card-header">
            <h3>Atividade Recente</h3>
          </div>
          <div className="activity-list">
            <div style={{ padding: 12, color: '#8b949e', fontSize: 14 }}>
              Ainda não há endpoint no backend para listar histórico de ordens/negociações do usuário.
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="dashboard-card quick-links">
          <div className="card-header">
            <h3>Acesso Rápido</h3>
          </div>
          <div className="links-grid">
            <Link to="/app/trading" className="quick-link">
              <span className="link-icon">📊</span>
              <span className="link-text">Trading</span>
            </Link>
            <Link to="/app/portfolio" className="quick-link">
              <span className="link-icon">💼</span>
              <span className="link-text">Portfolio</span>
            </Link>
            <Link to="/app/social" className="quick-link">
              <span className="link-icon">👥</span>
              <span className="link-text">Social</span>
            </Link>
            <Link to="/app/contracts" className="quick-link">
              <span className="link-icon">📄</span>
              <span className="link-text">Contratos</span>
            </Link>
          </div>
        </div>

        {/* Market News */}
        <div className="dashboard-card market-news">
          <div className="card-header">
            <h3>Notícias do Mercado</h3>
          </div>
          <div className="news-list">
            <div style={{ padding: 12, color: '#8b949e', fontSize: 14 }}>
              Para sair do fictício, precisamos integrar com um endpoint real de notícias (ex: <code>/api/v1/news</code>) e renderizar os itens.
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .dashboard-page {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .welcome-section {
          margin-bottom: 24px;
        }

        .welcome-section h1 {
          font-size: 24px;
          font-weight: 600;
          color: #e6edf3;
          margin: 0 0 8px 0;
        }

        .welcome-section p {
          font-size: 14px;
          color: #8b949e;
          margin: 0;
        }

        .overview-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .overview-card {
          background: rgba(48, 54, 61, 0.3);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          border: 1px solid rgba(48, 54, 61, 0.4);
        }

        .card-icon {
          font-size: 28px;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(88, 166, 255, 0.1);
          border-radius: 12px;
        }

        .card-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .card-label {
          font-size: 12px;
          color: #8b949e;
          text-transform: uppercase;
        }

        .card-value {
          font-size: 20px;
          font-weight: 700;
          color: #e6edf3;
        }

        .card-change {
          font-size: 12px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 4px;
          width: fit-content;
        }

        .card-change.positive {
          color: #3fb950;
          background: rgba(63, 185, 80, 0.15);
        }

        .card-change.negative {
          color: #f85149;
          background: rgba(248, 81, 73, 0.15);
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .dashboard-card {
          background: rgba(48, 54, 61, 0.2);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid rgba(48, 54, 61, 0.3);
        }

        .dashboard-card.asset-preview {
          grid-column: span 2;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #e6edf3;
        }

        .btn-trade {
          padding: 8px 16px;
          background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-trade:hover {
          background: linear-gradient(135deg, #2ea043 0%, #3fb950 100%);
        }

        .preview-content {
          display: flex;
          gap: 40px;
        }

        .preview-details {
          display: flex;
          gap: 40px;
        }

        .preview-price, .preview-change {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .price-label, .change-label {
          font-size: 12px;
          color: #8b949e;
        }

        .price-value {
          font-size: 32px;
          font-weight: 700;
          color: #e6edf3;
        }

        .change-value {
          font-size: 24px;
          font-weight: 600;
        }

        .change-value.positive {
          color: #3fb950;
        }

        .change-value.negative {
          color: #f85149;
        }

        .preview-loading {
          color: #8b949e;
          font-size: 14px;
        }

        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .activity-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(48, 54, 61, 0.3);
          border-radius: 8px;
        }

        .activity-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
        }

        .activity-icon.buy {
          background: rgba(63, 185, 80, 0.2);
          color: #3fb950;
        }

        .activity-icon.sell {
          background: rgba(248, 81, 73, 0.2);
          color: #f85149;
        }

        .activity-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .activity-asset {
          font-weight: 600;
          color: #e6edf3;
          font-size: 14px;
        }

        .activity-amount {
          font-size: 12px;
          color: #8b949e;
        }

        .activity-price {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .activity-price .price {
          font-weight: 600;
          color: #e6edf3;
          font-size: 14px;
        }

        .activity-price .time {
          font-size: 11px;
          color: #6e7681;
        }

        .links-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .quick-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: rgba(48, 54, 61, 0.3);
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s;
        }

        .quick-link:hover {
          background: rgba(88, 166, 255, 0.1);
          border-color: rgba(88, 166, 255, 0.3);
        }

        .link-icon {
          font-size: 20px;
        }

        .link-text {
          font-size: 14px;
          color: #e6edf3;
          font-weight: 500;
        }

        .news-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .news-item {
          display: flex;
          gap: 12px;
          padding: 12px;
          background: rgba(48, 54, 61, 0.3);
          border-radius: 8px;
        }

        .news-time {
          font-size: 12px;
          color: #58a6ff;
          font-weight: 600;
          white-space: nowrap;
        }

        .news-text {
          margin: 0;
          font-size: 13px;
          color: #e6edf3;
          line-height: 1.4;
        }

        @media (max-width: 768px) {
          .overview-cards {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
          
          .dashboard-card.asset-preview {
            grid-column: span 1;
          }
        }
      `}</style>
    </div>
  )
}
