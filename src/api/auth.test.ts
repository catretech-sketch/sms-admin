import { describe, it, expect, beforeEach, vi } from 'vitest'
import { login, me, logout, passwordForgot, passwordReset } from './auth'
import { tokenStore } from './auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

describe('auth', () => {
  it('login stores tokens and sends an email identifier as { email }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { access_token: 'a2', refresh_token: 'r2' } }))
    vi.stubGlobal('fetch', fetchMock)
    await login('a@b.edu', 'pw')
    expect(tokenStore.getAccess()).toBe('a2')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ email: 'a@b.edu', password: 'pw' })
  })

  it('login sends a mobile identifier as { phone }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { access_token: 'a3', refresh_token: 'r3' } }))
    vi.stubGlobal('fetch', fetchMock)
    await login('+91 98100 10002', 'pw')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ phone: '+91 98100 10002', password: 'pw' })
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

describe('password reset api', () => {
  it('passwordForgot posts the identifier and returns {sent}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await passwordForgot('a@b.edu')).toEqual({ sent: true })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/password/forgot')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ identifier: 'a@b.edu' })
  })

  it('passwordReset posts identifier+code+password and resolves on 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(passwordReset('a@b.edu', '123456', 'newPass123')).resolves.toBeUndefined()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/password/reset')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string))
      .toEqual({ identifier: 'a@b.edu', code: '123456', password: 'newPass123' })
  })

  it('passwordReset rejects with a typed ApiError carrying the error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_code', message: 'bad code' } }, 401)))
    await expect(passwordReset('a@b.edu', '000000', 'newPass123'))
      .rejects.toMatchObject({ status: 401, code: 'invalid_code' })
  })
})
