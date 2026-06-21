import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCreateStudent } from './useStudentMutations'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function makeClient() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useCreateStudent', () => {
  it('POSTs and invalidates the students list on success', async () => {
    const qc = makeClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srv1', admission_no: 'A1', class_label: '1-A', name: 'N', gender: 'M', grade: '1', section: 'A', roll: 1, guardian: 'g', phone: '1', attendance: 0, fee_status: 'due', fee_due: 0, status: 'active', house: 'Ruby', avatar_hue: 1 } })))
    const { result } = renderHook(() => useCreateStudent(), { wrapper })
    result.current.mutate({ id: 't', adm: 'A1', cls: '1-A', name: 'N', gender: 'M', grade: '1', section: 'A', roll: 1, guardian: 'g', phone: '1', attendance: 0, feeStatus: 'due', feeDue: 0, status: 'active', house: 'Ruby', avatarHue: 1 } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['students'] })
  })
})
