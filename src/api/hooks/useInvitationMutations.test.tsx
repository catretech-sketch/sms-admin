import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useResendInvitation, useRevokeInvitation } from './useInvitationMutations'
import * as invitationsApi from '../invitations'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.restoreAllMocks() })

describe('useResendInvitation', () => {
  it('calls resendInvitation with the invitation id', async () => {
    const spy = vi.spyOn(invitationsApi, 'resendInvitation').mockResolvedValue(undefined)
    const { result } = renderHook(() => useResendInvitation(), { wrapper })
    result.current.mutate('INV-01')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('INV-01')
  })
})

describe('useRevokeInvitation', () => {
  it('calls revokeInvitation with the invitation id', async () => {
    const spy = vi.spyOn(invitationsApi, 'revokeInvitation').mockResolvedValue(undefined)
    const { result } = renderHook(() => useRevokeInvitation(), { wrapper })
    result.current.mutate('INV-01')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('INV-01')
  })
})
