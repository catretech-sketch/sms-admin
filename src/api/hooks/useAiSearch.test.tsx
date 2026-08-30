import { describe, it, expect } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAiSearch } from './useAiSearch'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const attendanceHero = { present: 10, marked: 12, absent: 2, pct: 83 }

describe('useAiSearch', () => {
  it('resolves a query against the given students/attendance context', async () => {
    const { result } = renderHook(() => useAiSearch(), { wrapper })
    act(() => {
      result.current.mutate({
        query: 'find Rahul',
        students: [{ id: 's1', name: 'Rahul Sharma', cls: '8', section: 'A', attendance: 91 }],
        attendanceHero,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.intent).toBe('StudentSearch')
    expect(result.current.data?.count).toBe(1)
  })

  it('resolves an unsupported query without throwing', async () => {
    const { result } = renderHook(() => useAiSearch(), { wrapper })
    act(() => {
      result.current.mutate({ query: 'play some music', students: [], attendanceHero })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.intent).toBe('Unsupported')
  })
})
