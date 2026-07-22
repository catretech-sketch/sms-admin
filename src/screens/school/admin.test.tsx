import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as invitationsApi from '@/api/invitations'
import { InvitationsTab } from './admin'
import { ToastProvider } from '@/context/ToastProvider'

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <InvitationsTab />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => { vi.restoreAllMocks() })

describe('InvitationsTab', () => {
  it('shows a loading state, then the list from the API', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([
      {
        id: 'INV-01', email: 'neha.joshi@school.edu', phone: null, roleLabel: 'Teacher',
        invitedAt: '2026-07-20T10:00:00Z', expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
      },
    ])
    renderTab()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('neha.joshi@school.edu')).toBeInTheDocument())
  })

  it('shows an empty state when there are no invitations', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([])
    renderTab()
    await waitFor(() => expect(screen.getByText(/no invitations/i)).toBeInTheDocument())
  })

  it('shows an error state and can retry', async () => {
    const { ApiError } = await import('@/api/ApiError')
    const listSpy = vi.spyOn(invitationsApi, 'listInvitations')
      .mockRejectedValueOnce(new ApiError(500, 'internal_error', 'boom', null))
      .mockResolvedValueOnce([
        {
          id: 'INV-01', email: 'neha.joshi@school.edu', phone: null, roleLabel: 'Teacher',
          invitedAt: '2026-07-20T10:00:00Z', expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
        },
      ])
    renderTab()
    await waitFor(() => expect(screen.getAllByText(/could not load invitations/i).length).toBeGreaterThan(0))
    expect(listSpy).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByText('neha.joshi@school.edu')).toBeInTheDocument())
    expect(listSpy).toHaveBeenCalledTimes(2)
  })

  it('resends an invitation and shows a success toast', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([
      {
        id: 'INV-01', email: 'neha.joshi@school.edu', phone: null, roleLabel: 'Teacher',
        invitedAt: '2026-07-20T10:00:00Z', expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
      },
    ])
    vi.spyOn(invitationsApi, 'resendInvitation').mockResolvedValue(undefined)
    renderTab()
    await waitFor(() => screen.getByText('neha.joshi@school.edu'))
    await userEvent.click(screen.getByRole('button', { name: /resend/i }))
    await waitFor(() => expect(screen.getByText(/invitation resent/i)).toBeInTheDocument())
  })

  it('revokes an invitation and shows a danger toast', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([
      {
        id: 'INV-01', email: 'neha.joshi@school.edu', phone: null, roleLabel: 'Teacher',
        invitedAt: '2026-07-20T10:00:00Z', expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
      },
    ])
    vi.spyOn(invitationsApi, 'revokeInvitation').mockResolvedValue(undefined)
    renderTab()
    await waitFor(() => screen.getByText('neha.joshi@school.edu'))
    await userEvent.click(screen.getByRole('button', { name: /revoke/i }))
    await waitFor(() => expect(screen.getByText(/invitation revoked/i)).toBeInTheDocument())
  })

  it('shows an expired badge and still allows resend', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([
      {
        id: 'INV-02', email: 'old.invite@school.edu', phone: null, roleLabel: 'Admin',
        invitedAt: '2026-06-01T10:00:00Z', expiresAt: '2026-06-02T10:00:00Z', status: 'expired',
      },
    ])
    renderTab()
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument()
  })
})
