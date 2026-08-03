import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNotifications } from './useNotifications'
import { useApprovals } from './useApprovals'
import { useActOnApproval } from './useApprovalMutations'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useNotifications', () => {
  it('resolves the notifications list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 1, icon: 'bell', tone: 'brand', title: 'T', body: 'B', time: '1h', unread: true }], next_cursor: null })))
    const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 1, unread: true })
  })
})

describe('useApprovals', () => {
  it('resolves the approvals list with forRoles mapped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'A1', type: 't', module: 'm', cap: 'c', title: 'T', detail: 'D', requester: 'R', role: 'teacher', amount: null, age: '2h', priority: 'low', status: 'pending', for_roles: ['admin'] }], next_cursor: null })))
    const { result } = renderHook(() => useApprovals(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 'A1', forRoles: ['admin'] })
  })
})

describe('useActOnApproval', () => {
  it('PATCHes and invalidates the approvals list', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { result } = renderHook(() => useActOnApproval(), { wrapper })
    result.current.mutate({ id: 'A1', status: 'approved' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['approvals'] })
  })
})
