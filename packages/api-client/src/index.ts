export type ApiClient = {
  request: <T>(path: string, options?: RequestInit) => Promise<T>
  getApiUrl: () => string
}

type ApiClientOptions = {
  baseUrl?: string
  getAccessToken?: () => string | null
}

/**
 * Builds the same JSON/error-handling pipeline for every frontend. Authentication
 * remains an injected concern: staff clients provide a Bearer token callback,
 * while the Telegram shop sends signed initData in request bodies.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl || '').replace(/\/$/, '')

  return {
    getApiUrl: () => baseUrl || 'Same-origin /api (Vite proxy in development)',
    request: async <T>(
      path: string,
      requestOptions: RequestInit = {},
    ): Promise<T> => {
      const headers = new Headers(requestOptions.headers)
      headers.set('Accept', 'application/json')

      if (requestOptions.body && !(requestOptions.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json')
      }

      const token = options.getAccessToken?.()
      if (token) headers.set('Authorization', `Bearer ${token}`)

      const requestPath = path.startsWith('/') ? path : `/${path}`
      const response = await fetch(`${baseUrl}${requestPath}`, {
        ...requestOptions,
        headers,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          payload?.message || `API request failed (${response.status})`,
        )
      }

      if (response.status === 204) return undefined as T
      return response.json() as Promise<T>
    },
  }
}
