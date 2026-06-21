import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useStudents, useStudent } from './useStudents'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const wireStudent = {
  id: 's1', admission_no: 'A-100', name: 'Asha', gender: 'F', grade: '10', section: 'A',
  class_label: '10-A', roll: 3, guardian: 'Ravi', phone: '99', attendance: 92,
  fee_status: 'paid', fee_due: 0, status: 'active', house: 'Blue', avatar_hue: 210,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useStudents', () => {
  it('resolves mapped rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireStudent], next_cursor: null })))
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ adm: 'A-100', cls: '10-A' })
  })
})

describe('useStudent', () => {
  it('is disabled without an id and never fetches', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useStudent(null), { wrapper: makeWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches and maps a single student when given an id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { ...wireStudent, id: 's2', admission_no: 'A-200', class_label: '9-B', fee_due: 1200, fee_status: 'due' } })))
    const { result } = renderHook(() => useStudent('s2'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ adm: 'A-200', cls: '9-B', feeDue: 1200 })
  })
})
