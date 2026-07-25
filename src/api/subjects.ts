import { request, listRequest } from './client'
import { snakeToCamel } from './mapper'
import { defaultSubjectNames } from '@/lib/defaultSubjects'

export interface SchoolSubject {
  id: string
  name: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listSubjects(): Promise<SchoolSubject[]> {
  const env = await listRequest<ListEnvelope>('/subjects')
  return env.data.map((s) => snakeToCamel<SchoolSubject>(s))
}

export async function createSubject(name: string): Promise<SchoolSubject> {
  const wire = await request<Record<string, unknown>>('/subjects', { method: 'POST', body: { name } })
  return snakeToCamel<SchoolSubject>(wire)
}

export async function updateSubject(id: string, name: string): Promise<SchoolSubject> {
  const wire = await request<Record<string, unknown>>(`/subjects/${id}`, { method: 'PATCH', body: { name } })
  return snakeToCamel<SchoolSubject>(wire)
}

export async function deleteSubject(id: string): Promise<void> {
  await request<void>(`/subjects/${id}`, { method: 'DELETE' })
}

/**
 * Ensure default subjects exist for the school. Skips names already present.
 * Returns how many subjects were newly created.
 */
export async function ensureDefaultSubjects(existing?: SchoolSubject[]): Promise<number> {
  const current = existing ?? await listSubjects()
  const have = new Set(current.map((s) => s.name.trim().toLowerCase()).filter(Boolean))
  const missing = defaultSubjectNames().filter((n) => !have.has(n.toLowerCase()))
  let created = 0
  for (const name of missing) {
    await createSubject(name)
    created += 1
  }
  return created
}
