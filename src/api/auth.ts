import { request } from './client'
import { tokenStore } from './auth/tokenStore'
import type { AuthTokens, Me } from './types'

export async function passwordForgot(identifier: string): Promise<{ sent: boolean }> {
  return request('/auth/password/forgot', { method: 'POST', body: { identifier } })
}

export async function passwordReset(identifier: string, code: string, password: string): Promise<void> {
  await request('/auth/password/reset', { method: 'POST', body: { identifier, code, password } })
}

/** Sign in with an email or a mobile number. An '@' routes to the email field, otherwise phone. */
export async function login(identifier: string, password: string): Promise<AuthTokens> {
  const body = identifier.includes('@') ? { email: identifier, password } : { phone: identifier, password }
  const tokens = await request<AuthTokens>('/auth/login', { method: 'POST', body })
  tokenStore.set(tokens)
  // Drop any previous school tenant — a stale X-Tenant-Id on /auth/me causes the API to 403
  // when it does not match the new JWT (TenantResolutionMiddleware).
  tokenStore.setTenantId(null)
  return tokens
}

export async function refresh(): Promise<AuthTokens> {
  const refresh_token = tokenStore.getRefresh()
  const tokens = await request<AuthTokens>('/auth/refresh', { method: 'POST', body: { refresh_token } })
  tokenStore.set(tokens)
  return tokens
}

export async function me(): Promise<Me> {
  const profile = await request<Me>('/auth/me')
  tokenStore.setTenantId(profile.tenant_id)
  return profile
}

export async function logout(): Promise<void> {
  const refresh_token = tokenStore.getRefresh()
  try {
    if (refresh_token) await request('/auth/logout', { method: 'POST', body: { refresh_token } })
  } finally {
    tokenStore.clear()
  }
}

export async function setPassword(password: string): Promise<void> {
  await request('/auth/set-password', { method: 'POST', body: { password } })
}
