import { listRequest, request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import { mergeTeacherExtras } from './teacherExtras'
import type { Teacher, ListTeachersOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Normalize API subjects (array, JSON string, or comma-separated) to a string[]. */
export function normalizeSubjects(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => normalizeSubjects(item))
  }
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return []
    if (text.startsWith('[')) {
      try {
        return normalizeSubjects(JSON.parse(text))
      } catch {
        /* fall through */
      }
    }
    return text.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

/** Map one wire record (snake_case) to the UI `Teacher` shape.
 *  Generic casing covers class_teacher/date_of_joining/avatar_hue;
 *  only dept/desig/attendance need an explicit rename. */
export function toTeacher(wire: Record<string, unknown>): Teacher {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { department, designation, attendancePct, employeeCode, subjects, ...rest } = c
  const base = {
    ...rest,
    subjects: normalizeSubjects(subjects),
    dept: String(department ?? ''),
    desig: String(designation ?? ''),
    attendance: Number(attendancePct ?? 0),
    exp: Number(c.exp ?? 0),
    rating: Number(c.rating ?? 0),
    result: Number(c.result ?? 0),
    load: Number(c.load ?? 0),
    top: Boolean(c.top),
    code: typeof employeeCode === 'string' ? employeeCode : undefined,
  } as unknown as Teacher
  return mergeTeacherExtras(base)
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
  const { dept, desig, attendance, id, code, employee_code: _ec, ...rest } = snake
  return {
    ...rest,
    department: dept,
    designation: desig,
    attendance_pct: attendance,
    employee_code: t.code?.trim() || undefined,
  }
}

export async function getTeacher(id: string): Promise<Teacher> {
  const wire = await request<Record<string, unknown>>(`/teachers/${id}`)
  return toTeacher(wire)
}

/** Body for PATCH /teachers/{id}. */
export function fromTeacherUpdate(t: Teacher): Record<string, unknown> {
  return {
    name: t.name,
    gender: t.gender,
    department: t.dept,
    designation: t.desig,
    subjects: t.subjects,
    class_teacher: t.classTeacher,
    phone: t.phone,
    email: t.email,
    status: t.status,
    exp: t.exp,
    employee_code: t.code?.trim() || undefined,
  }
}

export async function createTeacher(t: Teacher): Promise<Teacher> {
  const wire = await request<Record<string, unknown>>('/teachers', { method: 'POST', body: fromTeacher(t) })
  return toTeacher(wire)
}

export async function updateTeacher(id: string, t: Teacher): Promise<Teacher> {
  const wire = await request<Record<string, unknown>>(`/teachers/${id}`, {
    method: 'PATCH',
    body: fromTeacherUpdate(t),
  })
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
