import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useExams, useCreateExam, useUpdateExam } from './useExams'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }
function wrap(qc: QueryClient) { return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
const wireExam = { id: 'EX1', name: 'T1', type: 'Term', grades: 'VI', from: '1', to: '2', subjects: 6, status: 'scheduled', marks_entered_pct: 0, published: false }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useExams', () => {
  it('resolves mapped exams', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireExam], next_cursor: null })))
    const { result } = renderHook(() => useExams(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 'EX1', marksEntered: 0 })
  })
})

describe('useCreateExam', () => {
  it('POSTs and invalidates exams', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: wireExam })))
    const { result } = renderHook(() => useCreateExam(), { wrapper: wrap(qc) })
    result.current.mutate({ id: 't', name: 'T1', type: 'Term', grades: 'VI', from: '1', to: '2', subjects: 6, status: 'scheduled', marksEntered: 0, published: false })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exams'] })
  })
})

describe('useUpdateExam', () => {
  it('PUTs and invalidates exams', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { ...wireExam, published: true } })))
    const { result } = renderHook(() => useUpdateExam(), { wrapper: wrap(qc) })
    result.current.mutate({ id: 'EX1', patch: { published: true } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exams'] })
  })
})
