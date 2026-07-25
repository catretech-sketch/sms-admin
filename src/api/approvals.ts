import { listRequest, request } from './client'
import { snakeToCamel } from './mapper'
import type { Approval, Role } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Approvals a role may action. Owner is a super-role and sees every pending item. */
export function approvalsForRole(list: Approval[], role: Role): Approval[] {
  if (role === 'owner') return list
  return list.filter((a) => a.forRoles.includes(role))
}

export async function listApprovals(): Promise<Approval[]> {
  const env = await listRequest<ListEnvelope>('/approvals')
  return env.data.map((a) => snakeToCamel<Approval>(a))
}

export async function actOnApproval(id: string, status: 'approved' | 'rejected'): Promise<void> {
  await request<unknown>(`/approvals/${id}`, { method: 'PATCH', body: { status } })
}
