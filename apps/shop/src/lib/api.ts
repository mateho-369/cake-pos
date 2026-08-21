import { createApiClient } from '@cake-pos/api-client'

const client = createApiClient({ baseUrl: import.meta.env.VITE_API_URL })

export const apiRequest = client.request
export const getApiUrl = client.getApiUrl
