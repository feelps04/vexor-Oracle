import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiPost, type AuthResponse } from '../lib/api'
import { setAuth, toStoredAuth } from '../lib/auth'

export default function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const from = '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(loc.search)
    const prefill = params.get('email')
    const reason = params.get('reason')
    if (prefill && !email) setEmail(prefill)
    if (reason === 'exists') {
      setInfo('Esse email já está cadastrado. Entre com a senha dessa conta (ou use outro email para criar uma nova).')
    } else {
      setInfo(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.search])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      console.log('Attempting login...')
      const r = await apiPost<AuthResponse>('/api/v1/auth/login', { email, password })
      console.log('Login response:', r)
      const auth = toStoredAuth(email, r)
      console.log('Stored auth:', auth)
      setAuth(auth)
      console.log('Navigating to:', from)
      nav(from, { replace: true })
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err?.message || 'Erro ao logar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">Dashboard</div>
          <h1>Bem-vindo de volta</h1>
          <p>Entre na sua conta para acessar o trading</p>
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <div className="form-group">
            <label>Email</label>
            <input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              type="email" 
              required 
              placeholder="seu@email.com"
            />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <input 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              type="password" 
              required 
              placeholder="••••••••"
            />
          </div>

          {info ? <div className="info-message">{info}</div> : null}
          {error ? <div className="error-message">{error}</div> : null}

          <button type="submit" disabled={loading} className="btn-login">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-footer">
          <p>Não tem conta? <Link to="/register" className="link-register">Cadastre-se</Link></p>
        </div>
      </div>

      <style>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%);
          padding: 20px;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background: rgba(48, 54, 61, 0.2);
          border: 1px solid rgba(48, 54, 61, 0.4);
          border-radius: 16px;
          padding: 40px;
          backdrop-filter: blur(10px);
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .logo {
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, #58a6ff 0%, #238636 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 16px;
        }

        .login-header h1 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #e6edf3;
        }

        .login-header p {
          margin: 0;
          font-size: 14px;
          color: #8b949e;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 500;
          color: #e6edf3;
        }

        .form-group input {
          padding: 14px 16px;
          background: rgba(13, 17, 23, 0.6);
          border: 1px solid rgba(48, 54, 61, 0.6);
          border-radius: 10px;
          color: #e6edf3;
          font-size: 14px;
          transition: all 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #58a6ff;
          box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
        }

        .form-group input::placeholder {
          color: #6e7681;
        }

        .info-message {
          padding: 12px 16px;
          background: rgba(88, 166, 255, 0.1);
          border: 1px solid rgba(88, 166, 255, 0.3);
          border-radius: 8px;
          font-size: 13px;
          color: #58a6ff;
        }

        .error-message {
          padding: 12px 16px;
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid rgba(248, 81, 73, 0.3);
          border-radius: 8px;
          font-size: 13px;
          color: #f85149;
        }

        .btn-login {
          padding: 14px;
          background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 8px;
        }

        .btn-login:hover:not(:disabled) {
          background: linear-gradient(135deg, #2ea043 0%, #3fb950 100%);
          transform: translateY(-1px);
        }

        .btn-login:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-footer {
          text-align: center;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid rgba(48, 54, 61, 0.4);
        }

        .login-footer p {
          margin: 0;
          font-size: 14px;
          color: #8b949e;
        }

        .link-register {
          color: #58a6ff;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }

        .link-register:hover {
          color: #79b8ff;
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .login-card {
            padding: 24px;
          }
        }
      `}</style>
    </div>
  )
}
