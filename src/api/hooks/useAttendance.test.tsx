import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSaveAttendance } from './useAttendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useSaveAttendance', () => {
  it('POSTs and invalidates the class attendance', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: {} })))
    const { result } = renderHook(() => useSaveAttendance(), { wrapper })
    result.current.mutate({ classId: 'X-A', period: 1, marks: [{ studentId: 's1', status: 'present' }] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['attendance', 'X-A'] })
  })
})
