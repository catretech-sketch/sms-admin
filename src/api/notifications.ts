import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { AppNotification } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listNotifications(): Promise<AppNotification[]> {
  const env = await listRequest<ListEnvelope>('/notifications')
  return env.data.map((n) => snakeToCamel<AppNotification>(n))
}
