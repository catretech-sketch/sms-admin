import { describe, it, expect, beforeEach, vi } from 'vitest'
import { request, listRequest, ApiError, setOnAuthFailure } from './client'
import { tokenStore } from './auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

describe('request', () => {
  it('unwraps the data envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { ok: 1 } })))
    expect(await request<{ ok: number }>('/ping')).toEqual({ ok: 1 })
  })

  it('attaches the bearer token and tenant header when authed', async () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    tokenStore.setTenantId('t9')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await request('/secure')
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer a1')
    expect(headers['X-Tenant-Id']).toBe('t9')
  })

  it('does not send Bearer on auth bootstrap routes', async () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await request('/auth/otp/verify', { method: 'POST', body: {} })
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('throws a typed ApiError on error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'forbidden', message: 'nope', details: null } }, 403)))
    await expect(request('/x')).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    await expect(request('/x')).rejects.toBeInstanceOf(ApiError)
  })

  it('refreshes once on 401 then retries the original request', async () => {
    tokenStore.set({ access_token: 'old', refresh_token: 'r1' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_token', message: 'exp' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'new', refresh_token: 'r2' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await request<{ ok: boolean }>('/secure')).toEqual({ ok: true })
    expect(tokenStore.getAccess()).toBe('new')
    const retryHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>
    expect(retryHeaders.Authorization).toBe('Bearer new')
  })

  it('clears tokens and fires onAuthFailure when refresh fails', async () => {
    tokenStore.set({ access_token: 'old', refresh_token: 'r1' })
    const onFail = vi.fn()
    setOnAuthFailure(onFail)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_token', message: 'exp' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_token', message: 'bad' } }, 401)))
    await expect(request('/secure')).rejects.toBeInstanceOf(ApiError)
    expect(onFail).toHaveBeenCalledOnce()
    expect(tokenStore.getRefresh()).toBeNull()
  })
})

describe('listRequest', () => {
  it('returns the full envelope (no .data unwrap)', async () => {
    const envelope = { data: [{ id: 1 }], next_cursor: 'abc' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(envelope)))
    expect(await listRequest<typeof envelope>('/items')).toEqual(envelope)
  })
})
