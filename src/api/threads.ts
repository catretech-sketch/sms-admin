import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Thread } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listThreads(): Promise<Thread[]> {
  const env = await listRequest<ListEnvelope>('/threads')
  return env.data.map((t) => snakeToCamel<Thread>(t))
}
