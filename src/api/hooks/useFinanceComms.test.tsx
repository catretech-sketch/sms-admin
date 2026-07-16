import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useComplaints } from './useComplaints'
import { useFeePayments, usePayInvoice } from './useFeePayments'
import { useFeeHeads, useCreateFeeHead } from './useFeeHeads'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }
function wrap(qc: QueryClient) { return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useComplaints', () => {
  it('resolves mapped complaints', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'C1', subject: 's', from: 'p', category: 'transport', priority: 'high', status: 'open', age: '2d', assignee: 'a', body: 'b' }], next_cursor: null })))
    const { result } = renderHook(() => useComplaints(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 'C1', cat: 'transport' })
  })
})

describe('usePayInvoice', () => {
  it('POSTs and invalidates fee payments', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { id: 1, student_id: 's1', student_name: 'A', cls: 'X', fee_type: 'academic', amount: 1, mode: 'UPI', ref: 'r', date: 'd' } })))
    const { result } = renderHook(() => usePayInvoice(), { wrapper: wrap(qc) })
    result.current.mutate({ invoiceId: 'INV-1', payment: { id: 0, studentId: 's1', studentName: 'A', cls: 'X', feeType: 'academic', amount: 1, mode: 'UPI', ref: 'r', date: 'd' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feePayments'] })
  })
})

describe('useFeePayments', () => {
  it('resolves mapped payments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 1, student_id: 's1', student_name: 'A', cls: 'X', fee_type: 'academic', amount: 1, mode: 'UPI', ref: 'r', date: 'd' }], next_cursor: null })))
    const { result } = renderHook(() => useFeePayments(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ studentId: 's1', feeType: 'academic' })
  })
})

describe('useFeeHeads', () => {
  it('resolves mapped heads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'h1', name: 'Academic', code: 'ACAD', active: true, is_system: true }],
      next_cursor: null,
    })))
    const { result } = renderHook(() => useFeeHeads(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 'h1', name: 'Academic', isSystem: true, active: true })
  })
})

describe('useCreateFeeHead', () => {
  it('POSTs and invalidates fee heads', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'h2', name: 'Lab', active: true } })))
    const { result } = renderHook(() => useCreateFeeHead(), { wrapper: wrap(qc) })
    result.current.mutate({ name: 'Lab' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feeHeads'] })
  })
})
