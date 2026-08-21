import { createApiClient } from '@cake-pos/api-client'

let accessToken: string | null = null

const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL,
  getAccessToken: () => accessToken,
})

export const apiRequest = client.request
export const getApiUrl = client.getApiUrl

export function setAccessToken(token: string | null) {
  accessToken = token
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ token: string; employee: unknown }>(
    '/api/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
  )
  setAccessToken(result.token)
  return result
}

export async function logout() {
  try {
    if (accessToken)
      await apiRequest<{ ok: boolean }>('/api/logout', { method: 'POST' })
  } finally {
    setAccessToken(null)
  }
}
