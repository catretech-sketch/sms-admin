import { request, listRequest } from './client'

interface ListEnvelope { data: { name: string }[]; next_cursor: string | null }

export async function listSubjects(): Promise<string[]> {
  const env = await listRequest<ListEnvelope>('/subjects')
  return env.data.map((s) => s.name)
}

export async function createSubject(name: string): Promise<string> {
  const created = await request<{ name: string }>('/subjects', { method: 'POST', body: { name } })
  return created.name
}
