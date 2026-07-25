import { listRequest, request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
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

export function fromTeacher(t: Teacher): Record<string, unknown> {
  const snake = camelToSnake(t) as Record<string, unknown>
  const { dept, desig, attendance, ...rest } = snake
  return { ...rest, department: dept, designation: desig, attendance_pct: attendance }
}

export async function createTeacher(t: Teacher): Promise<Teacher> {
  const wire = await request<Record<string, unknown>>('/teachers', { method: 'POST', body: fromTeacher(t) })
  return toTeacher(wire)
}

/** Writes through to the teacher's linked Users row (Users.PhotoUrl — the same
 *  field the teacher app reads), not a teacherExtras/localStorage field.
 *  `photoDataUrl: null` clears the photo. Throws `no_linked_user` (409) if this
 *  teacher hasn't accepted their sign-in invite yet — the caller should treat
 *  that as expected and non-fatal, not surface it as a hard failure. */
export async function updateTeacherPhoto(id: string, photoDataUrl: string | null): Promise<void> {
  await request(`/teachers/${id}`, {
    method: 'PATCH',
    body: { photo_url: photoDataUrl, set_photo: true },
  })
}
