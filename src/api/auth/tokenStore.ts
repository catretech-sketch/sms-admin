import type { AuthTokens } from '../types'

const REFRESH_KEY = 'sms_admin_refresh'
const TENANT_KEY = 'sms_admin_tenant'
let accessToken: string | null = null

export const tokenStore = {
  getAccess(): string | null { return accessToken },
  getRefresh(): string | null { return localStorage.getItem(REFRESH_KEY) },
  getTenantId(): string | null { return localStorage.getItem(TENANT_KEY) },
  setTenantId(id: string | null): void {
    if (id) localStorage.setItem(TENANT_KEY, id)
    else localStorage.removeItem(TENANT_KEY)
  },
  set(tokens: AuthTokens): void {
    accessToken = tokens.access_token
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
  },
  clear(): void {
    accessToken = null
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(TENANT_KEY)
  },
}
