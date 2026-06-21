import { listRequest, request } from './client'
import { snakeToCamel } from './mapper'
import type { Approval } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listApprovals(): Promise<Approval[]> {
  const env = await listRequest<ListEnvelope>('/approvals')
  return env.data.map((a) => snakeToCamel<Approval>(a))
}

export async function actOnApproval(id: string, status: 'approved' | 'rejected'): Promise<void> {
  await request<unknown>(`/approvals/${id}`, { method: 'PATCH', body: { status } })
}
