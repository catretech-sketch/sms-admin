import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

export interface SchoolClass {
  name: string
  grade: string
  section: string
  teacherId: string
  students: number
  room: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listClasses(): Promise<SchoolClass[]> {
  const env = await listRequest<ListEnvelope>('/classes')
  return env.data.map((c) => snakeToCamel<SchoolClass>(c))
}

export async function createClass(c: SchoolClass): Promise<SchoolClass> {
  const wire = await request<Record<string, unknown>>('/classes', { method: 'POST', body: camelToSnake(c) })
  return snakeToCamel<SchoolClass>(wire)
}
