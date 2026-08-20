const configuredApiUrl = import.meta.env.VITE_API_URL
const API_URL = (configuredApiUrl || (import.meta.env.DEV ? 'https://api.yourdomain.com' : '')).replace(/\/$/, '')

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getApiUrl() {
  return API_URL || 'VITE_API_URL is not configured'
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_URL) {
    throw new Error('VITE_API_URL must be set to the shared API origin at build time')
  }

  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const message = await response.json().catch(() => null)
    throw new Error(message?.message || `API request failed (${response.status})`)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ token: string; employee: unknown }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setAccessToken(result.token)
  return result
}

export function logout() {
  setAccessToken(null)
}
