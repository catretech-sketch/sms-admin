import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Approval } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listApprovals(): Promise<Approval[]> {
  const env = await listRequest<ListEnvelope>('/approvals')
  return env.data.map((a) => snakeToCamel<Approval>(a))
}
