import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Teacher, ListTeachersOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Map one wire record (snake_case) to the UI `Teacher` shape.
 *  Generic casing covers class_teacher/date_of_joining/avatar_hue;
 *  only dept/desig/attendance need an explicit rename. */
export function toTeacher(wire: Record<string, unknown>): Teacher {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { department, designation, attendancePct, ...rest } = c
  return { ...rest, dept: department, desig: designation, attendance: attendancePct } as unknown as Teacher
}

export async function listTeachers(opts: ListTeachersOpts = {}): Promise<Teacher[]> {
  const query: Record<string, string | undefined> = {}
  if (opts.q) query.q = opts.q
  if (opts.dept && opts.dept !== 'all') query.dept = opts.dept
  if (opts.status && opts.status !== 'all') query.status = opts.status
  const env = await listRequest<ListEnvelope>('/teachers', { query })
  return env.data.map(toTeacher)
}
