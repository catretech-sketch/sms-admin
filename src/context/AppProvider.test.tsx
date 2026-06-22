import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AppProvider, useApp } from './AppProvider'
import { tokenStore } from '@/api/auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

const wrapper = ({ children }: { children: React.ReactNode }) => <AppProvider>{children}</AppProvider>

describe('AppProvider auth', () => {
  it('password login authenticates then loads role/tenant from /auth/me', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })) // /auth/login
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['principal'] } }))) // /auth/me
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('p@greenwood.edu', 'pw') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.role).toBe('principal')
    expect(tokenStore.getTenantId()).toBe('t1')
  })

  it('surfaces an auth error on bad credentials and stays logged out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_credentials', message: 'Wrong email or password.' } }, 401)))
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('x@y.edu', 'bad') })
    expect(result.current.loggedIn).toBe(false)
    expect(result.current.authError).toBe('Wrong email or password.')
  })

  it('owner-domain email routes to the owner console', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: null, roles: ['admin'] } })))
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('anil@schoolmate.io', 'pw') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.consoleKind).toBe('owner')
    expect(result.current.view).toBe('owner.dashboard')
  })

  it('an unknown backend role falls back to admin (no crash)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['school_admin'] } })))
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('admin@greenwood.edu', 'pw') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.role).toBe('admin')
  })

  it('logout clears the session and returns to the login screen', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['admin'] } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })))
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('admin@greenwood.edu', 'pw') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    await act(async () => { await result.current.logout() })
    expect(result.current.loggedIn).toBe(false)
  })

  it('establishSession loads role/tenant from /auth/me for an already-verified identifier', async () => {
    tokenStore.set({ access_token: 'a', refresh_token: 'r' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['teacher'] } }))) // /auth/me
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.establishSession('teacher@greenwood.edu') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.role).toBe('teacher')
    expect(tokenStore.getTenantId()).toBe('t1')
  })
})
