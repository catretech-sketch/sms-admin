import { request, listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Student, ListStudentsOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Map one wire record (snake_case) to the UI `Student` shape.
 *  Generic casing covers fee_status/fee_due/avatar_hue; only adm/cls are renamed. */
export function toStudent(wire: Record<string, unknown>): Student {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { admissionNo, classLabel, ...rest } = c
  return { ...rest, adm: admissionNo, cls: classLabel } as unknown as Student
}

export async function listStudents(opts: ListStudentsOpts = {}): Promise<Student[]> {
  const query: Record<string, string | undefined> = {}
  if (opts.q) query.q = opts.q
  if (opts.grade && opts.grade !== 'all') query.grade = opts.grade
  if (opts.status && opts.status !== 'all') query.status = opts.status
  if (opts.fee && opts.fee !== 'all') query.fee = opts.fee
  // next_cursor is read forward-compatibly but a single page is returned today.
  const env = await listRequest<ListEnvelope>('/students', { query })
  return env.data.map(toStudent)
}

export async function getStudent(id: string): Promise<Student> {
  const wire = await request<Record<string, unknown>>(`/students/${id}`)
  return toStudent(wire)
}
