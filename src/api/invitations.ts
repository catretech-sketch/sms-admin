import { request } from './client'

export interface InvitationDto {
  id: string
  email: string | null
  phone: string | null
  role_label: string
  invited_at: string
  expires_at: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
}

export interface Invitation {
  id: string
  email: string | null
  phone: string | null
  roleLabel: string
  invitedAt: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
}

function toInvitation(d: InvitationDto): Invitation {
  return {
    id: d.id,
    email: d.email,
    phone: d.phone,
    roleLabel: d.role_label,
    invitedAt: d.invited_at,
    expiresAt: d.expires_at,
    status: d.status,
  }
}

export async function listInvitations(): Promise<Invitation[]> {
  const data = await request<InvitationDto[]>('/invitations')
  return (data ?? []).map(toInvitation)
}

export async function resendInvitation(id: string): Promise<void> {
  await request(`/invitations/${id}/resend`, { method: 'POST' })
}

export async function revokeInvitation(id: string): Promise<void> {
  await request(`/invitations/${id}/revoke`, { method: 'POST' })
}
