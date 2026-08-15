import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTeachers } from './useTeachers'
import { useStaff } from './useStaff'

vi.mock('@/lib/hooks', () => ({ useApp: () => ({ plan: 'platinum' }) }))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useTeachers', () => {
  it('resolves mapped teacher rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'T1', name: 'Meera', department: 'Science', designation: 'HOD', attendance_pct: 97, avatar_hue: 1, subjects: [], class_teacher: null, phone: '', email: '', exp: 1, rating: 4, result: 80, load: 10, status: 'active', gender: 'F', top: false }], next_cursor: null })))
    const { result } = renderHook(() => useTeachers(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ dept: 'Science', desig: 'HOD', attendance: 97 })
  })
})

describe('useStaff', () => {
  it('resolves mapped staff rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'S1', name: 'Ramesh', role: 'Accountant', category: 'admin', department: 'Finance', attendance_pct: 95, avatar_hue: 2, gender: 'M', phone: '', shift: 'day', route: null, status: 'active' }], next_cursor: null })))
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ cat: 'admin', dept: 'Finance', attendance: 95 })
  })
})
