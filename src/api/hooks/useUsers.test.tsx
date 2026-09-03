import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSchoolUserByEmail } from './useUsers'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.restoreAllMocks() })

describe('useSchoolUserByEmail', () => {
  it('matches a linked account by email, case-insensitively', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'U1', email: 'Meera@Greenwood.edu', phone: null, status: 'active', created_at: '2026-01-01', roles: ['school.teacher'] }],
    })))
    const { result } = renderHook(() => useSchoolUserByEmail('meera@greenwood.edu'), { wrapper })
    await waitFor(() => expect(result.current?.id).toBe('U1'))
    vi.unstubAllGlobals()
  })

  it('returns undefined when no account matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })))
    const { result } = renderHook(() => useSchoolUserByEmail('nobody@greenwood.edu'), { wrapper })
    await waitFor(() => expect(result.current).toBeUndefined())
    vi.unstubAllGlobals()
  })

  it('returns undefined when email is undefined', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })))
    const { result } = renderHook(() => useSchoolUserByEmail(undefined), { wrapper })
    expect(result.current).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
