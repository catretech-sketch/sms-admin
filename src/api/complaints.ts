import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Complaint } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export function toComplaint(wire: Record<string, unknown>): Complaint {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { category, ...rest } = c
  return { ...rest, cat: category } as unknown as Complaint
}

export async function listComplaints(): Promise<Complaint[]> {
  const env = await listRequest<ListEnvelope>('/complaints')
  return env.data.map(toComplaint)
}
