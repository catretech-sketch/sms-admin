import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as invitationsApi from '@/api/invitations'
import * as usersApi from '@/api/users'
import { InvitationsTab, UsersTab } from './admin'
import { AppProvider } from '@/context/AppProvider'
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

function renderUsersTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <UsersTab />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

const ONE_USER: usersApi.SchoolUserDto[] = [
  { id: 'u1', email: 'neha.joshi@school.edu', phone: null, status: 'active', created_at: '2026-01-01T00:00:00Z', roles: ['school.teacher'] },
]

describe('UsersTab — remove access (2-step confirmation)', () => {
  it('requires a Continue click before the confirm step, and blocks Remove access until the name is typed correctly', async () => {
    vi.spyOn(usersApi, 'listSchoolUsers').mockResolvedValue(ONE_USER)
    const removeSpy = vi.spyOn(usersApi, 'removeUserAccess').mockResolvedValue(undefined)
    renderUsersTab()

    await waitFor(() => screen.getByText('neha.joshi@school.edu'))
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))

    // Step 1: no typing yet — Continue, not an immediate delete.
    expect(screen.getByText('Remove access')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove access/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    // Step 2: the destructive button exists but is disabled until the name matches.
    const confirmBtn = screen.getByRole('button', { name: /remove access/i })
    expect(confirmBtn).toBeDisabled()
    await userEvent.type(screen.getByPlaceholderText('neha.joshi'), 'wrong-name')
    expect(confirmBtn).toBeDisabled()
    expect(removeSpy).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByPlaceholderText('neha.joshi'))
    await userEvent.type(screen.getByPlaceholderText('neha.joshi'), 'neha.joshi')
    expect(confirmBtn).toBeEnabled()
    await userEvent.click(confirmBtn)
    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith('u1'))
  })

  it('resets both steps and the typed text on Cancel', async () => {
    vi.spyOn(usersApi, 'listSchoolUsers').mockResolvedValue(ONE_USER)
    renderUsersTab()

    await waitFor(() => screen.getByText('neha.joshi@school.edu'))
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.type(screen.getByPlaceholderText('neha.joshi'), 'neha.joshi')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByText('Confirm removal')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(screen.getByText('Remove access')).toBeInTheDocument()
  })
})
