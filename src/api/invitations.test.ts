import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listInvitations, resendInvitation, revokeInvitation } from './invitations'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireInvitation = {
  id: 'INV-01',
  email: 'neha.joshi@school.edu',
  phone: null,
  role_label: 'Teacher',
  invited_at: '2026-07-20T10:00:00Z',
  expires_at: '2026-07-21T10:00:00Z',
  status: 'pending',
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listInvitations', () => {
  it('maps wire snake_case (role_label/invited_at/expires_at) to camelCase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireInvitation] })))
    const rows = await listInvitations()
    expect(rows[0]).toMatchObject({
      id: 'INV-01', email: 'neha.joshi@school.edu', phone: null,
      roleLabel: 'Teacher', invitedAt: '2026-07-20T10:00:00Z',
      expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
    })
  })

  it('returns an empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null })))
    expect(await listInvitations()).toEqual([])
  })
})

describe('resendInvitation', () => {
  it('POSTs to /invitations/{id}/resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { resent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await resendInvitation('INV-01')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/invitations/INV-01/resend')
    expect((init as RequestInit).method).toBe('POST')
  })
})

describe('revokeInvitation', () => {
  it('POSTs to /invitations/{id}/revoke', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { revoked: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await revokeInvitation('INV-01')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/invitations/INV-01/revoke')
    expect((init as RequestInit).method).toBe('POST')
  })
})
