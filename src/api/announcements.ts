import { request, listRequest } from './client'
import { snakeToCamel } from './mapper'

export interface Announcement {
  id: string
  title: string
  audience: string
  when: string
  reach: number
  ch: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listAnnouncements(): Promise<Announcement[]> {
  const env = await listRequest<ListEnvelope>('/announcements')
  return env.data.map((a) => snakeToCamel<Announcement>(a))
}

export async function createAnnouncement(input: { title: string; audience: string }): Promise<Announcement> {
  const wire = await request<Record<string, unknown>>('/announcements', { method: 'POST', body: input })
  return snakeToCamel<Announcement>(wire)
}
