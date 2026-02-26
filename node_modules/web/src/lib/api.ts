export type AuthResponse = {
  userId: string
  accountId: string
  accessToken: string
}

const API_BASE = '' // use Vite proxy: /api -> http://localhost:3000

function normalizePath(path: string): string {
  if (!path) return '/'
  return path.startsWith('/') ? path : `/${path}`
}

function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('auth')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { accessToken?: string }
    return parsed?.accessToken || null
  } catch {
    return null
  }
}

function withAuthHeaders(headers?: HeadersInit): HeadersInit {
  const token = getAccessToken()
  if (!token) return headers ?? {}
  return {
    ...(headers ?? {}),
    Authorization: `Bearer ${token}`,
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + normalizePath(path), {
    method: 'GET',
    headers: withAuthHeaders(init?.headers),
    credentials: 'include',
    ...init,
  })

  const raw = await res.text().catch(() => '')
  let data: any = null
  if (raw) {
    try {
      data = JSON.parse(raw) as any
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`
    const snippet = raw && typeof raw === 'string' ? raw.slice(0, 500) : ''
    throw new Error(snippet ? `${msg}: ${snippet}` : msg)
  }
  return (data ?? (raw as any)) as T
}

export async function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + normalizePath(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...withAuthHeaders(init?.headers),
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
    credentials: 'include',
    ...init,
  })

  const raw = await res.text().catch(() => '')
  let data: any = null
  if (raw) {
    try {
      data = JSON.parse(raw) as any
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`
    const snippet = raw && typeof raw === 'string' ? raw.slice(0, 500) : ''
    throw new Error(snippet ? `${msg}: ${snippet}` : msg)
  }
  return (data ?? (raw as any)) as T
}
