import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiPost, type AuthResponse } from '../lib/api'
import { setAuth, toStoredAuth } from '../lib/auth'

export default function RegisterPage() {
  const nav = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await apiPost<AuthResponse>('/api/v1/auth/register', { email, password })
      setAuth(toStoredAuth(email, r))
      nav('/app', { replace: true })
    } catch (err: any) {
      const msg = err?.message || 'Erro ao cadastrar'
      if (String(msg).toLowerCase().includes('já cadastrado') || String(msg).toLowerCase().includes('cadastrado')) {
        nav(`/login?email=${encodeURIComponent(email)}&reason=exists`, { replace: true })
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Criar conta</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>Crie sua conta e ganhe uma conta individual.</p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Senha</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} required />
        </label>

        {error ? <div style={{ color: '#ef4444' }}>{error}</div> : null}

        <button type="submit" disabled={loading}>
          {loading ? 'Criando...' : 'Cadastrar'}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  )
}
