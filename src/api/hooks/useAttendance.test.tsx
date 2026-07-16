import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useClassAttendance, useSaveAttendance } from './useAttendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

function makeWrapper(qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

describe('useClassAttendance', () => {
  it('GETs attendance for class + date', async () => {
    const { wrapper } = makeWrapper()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'r1', class_id: 'c1', student_id: 's1', date: '2026-07-16', status: 'late' }],
    })))
    const { result } = renderHook(() => useClassAttendance('c1', '2026-07-16'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ studentId: 's1', status: 'late' })
  })
})

describe('useSaveAttendance', () => {
  it('POSTs and invalidates the class attendance for that date', async () => {
    const { qc, wrapper } = makeWrapper()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: {} })))
    const { result } = renderHook(() => useSaveAttendance(), { wrapper })
    result.current.mutate({
      classId: 'c1',
      date: '2026-07-16',
      records: [{ studentId: 's1', status: 'present' }],
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['attendance'] })
  })
})
