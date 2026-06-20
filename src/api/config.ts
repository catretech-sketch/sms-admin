const apiBaseUrl = import.meta.env.VITE_API_BASE ?? 'http://localhost:5162/v1'

export const config = { apiBaseUrl } as const
