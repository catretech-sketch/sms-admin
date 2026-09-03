import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSetUserActive } from './useUserMutations'
import * as usersApi from '../users'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.restoreAllMocks() })

describe('useSetUserActive', () => {
  it('calls setUserActive with the user id and active flag', async () => {
    const spy = vi.spyOn(usersApi, 'setUserActive').mockResolvedValue({
      id: 'U1', email: 'meera@greenwood.edu', phone: null, status: 'inactive', created_at: '2026-01-01', roles: ['school.teacher'],
    })
    const { result } = renderHook(() => useSetUserActive(), { wrapper })
    result.current.mutate({ userId: 'U1', active: false })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('U1', false)
  })
})
