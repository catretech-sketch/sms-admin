import { describe, it, expect, beforeEach, vi } from 'vitest'
import { otpRequest, otpVerify, login, me, logout } from './auth'
import { tokenStore } from './auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

describe('auth', () => {
  it('otpRequest posts the identifier and returns {sent}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await otpRequest('a@b.edu')).toEqual({ sent: true })
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ identifier: 'a@b.edu' })
  })

  it('otpVerify stores both tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })))
    await otpVerify('a@b.edu', '123456')
    expect(tokenStore.getAccess()).toBe('a')
    expect(tokenStore.getRefresh()).toBe('r')
  })

  it('login stores tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { access_token: 'a2', refresh_token: 'r2' } })))
    await login('a@b.edu', 'pw')
    expect(tokenStore.getAccess()).toBe('a2')
  })

  it('me persists the tenant id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['admin'] } })))
    const profile = await me()
    expect(profile.tenant_id).toBe('t1')
    expect(tokenStore.getTenantId()).toBe('t1')
  })

  it('logout clears the store even when the call succeeds', async () => {
    tokenStore.set({ access_token: 'a', refresh_token: 'r' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await logout()
    expect(tokenStore.getAccess()).toBeNull()
    expect(tokenStore.getRefresh()).toBeNull()
  })
})
