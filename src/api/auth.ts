import { request } from './client'
import { tokenStore } from './auth/tokenStore'
import type { AuthTokens, Me } from './types'

export async function otpRequest(identifier: string): Promise<{ sent: boolean }> {
  return request('/auth/otp/request', { method: 'POST', body: { identifier } })
}

export async function otpVerify(identifier: string, code: string): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>('/auth/otp/verify', { method: 'POST', body: { identifier, code } })
  tokenStore.set(tokens)
  return tokens
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>('/auth/login', { method: 'POST', body: { email, password } })
  tokenStore.set(tokens)
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
