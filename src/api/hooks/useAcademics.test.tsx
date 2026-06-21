import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useClasses, useCreateClass } from './useClasses'
import { useSubjects } from './useSubjects'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }
function wrap(qc: QueryClient) { return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useClasses', () => {
  it('resolves mapped classes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'X-A', grade: 'X', section: 'A', teacher_id: 'T1', students: 40, room: 'R1' }], next_cursor: null })))
    const { result } = renderHook(() => useClasses(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ name: 'X-A', teacherId: 'T1' })
  })
})

describe('useCreateClass', () => {
  it('POSTs and invalidates classes', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { name: 'X-B', grade: 'X', section: 'B', teacher_id: '', students: 0, room: 'R2' } })))
    const { result } = renderHook(() => useCreateClass(), { wrapper: wrap(qc) })
    result.current.mutate({ name: 'X-B', grade: 'X', section: 'B', teacherId: '', students: 0, room: 'R2' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['classes'] })
  })
})

describe('useSubjects', () => {
  it('resolves subject names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'English' }], next_cursor: null })))
    const { result } = renderHook(() => useSubjects(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['English'])
  })
})
