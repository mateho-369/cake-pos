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
      // Authenticated POS/admin responses are live state and must not be
      // reused from a browser cache. The backend also emits `no-store` on
      // shift responses; this is the client-side half of that guarantee.
      const requestInit: RequestInit = {
        ...(token ? { cache: 'no-store' as const } : {}),
        ...requestOptions,
        headers,
      }
      const response = await fetch(`${baseUrl}${requestPath}`, requestInit)

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

/**
 * `/api/shifts/current` answers "no open shift" with the JSON literal `null`.
 * Anything else that is not a real shift object must ALSO mean "no shift":
 * the stale production deploy served an empty object `{}` here (and any
 * transforming proxy in front of the API could do the same), and every
 * badge/panel gates on plain truthiness of this value — `{}` is truthy,
 * which is exactly how admin and sale ended up permanently showing an
 * "Open" ghost shift (with an Invalid Date) while `/api/shifts` — the
 * canonical list — said the shift had been closed for hours. A shift is
 * only real when it carries its id.
 */
export function normalizeCurrentShift<T>(
  value: T | null | undefined,
): T | null {
  if (value && typeof value === 'object' && 'id' in value) return value
  return null
}
