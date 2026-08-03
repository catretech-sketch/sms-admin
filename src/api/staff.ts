import { listRequest, request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import { normalizeStaffCategory } from '@/lib/staffCategory'
import { mergeStaffExtras } from './staffExtras'
import type { Staff, ListStaffOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Map one wire record (snake_case) to the UI `Staff` shape.
 *  Generic casing covers date_of_joining/avatar_hue;
 *  only dept/cat/attendance need an explicit rename. */
export function toStaff(wire: Record<string, unknown>): Staff {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { department, category, attendancePct, employeeCode, role, ...rest } = c
  const dept = String(department ?? '')
  const roleStr = String(role ?? '')
  const cat = normalizeStaffCategory(
    category != null ? String(category) : '',
    dept,
    roleStr,
  )
  const base = {
    ...rest,
    role: roleStr,
    dept,
    cat,
    attendance: Number(attendancePct ?? 0),
    code: typeof employeeCode === 'string' ? employeeCode : undefined,
  } as unknown as Staff
  return mergeStaffExtras(base)
}

export async function listStaff(opts: ListStaffOpts = {}): Promise<Staff[]> {
  const query: Record<string, string | undefined> = {}
  if (opts.q) query.q = opts.q
  if (opts.cat && opts.cat !== 'all') query.cat = opts.cat
  const env = await listRequest<ListEnvelope>('/staff', { query })
  return env.data.map(toStaff)
}

export function fromStaff(s: Staff): Record<string, unknown> {
  const snake = camelToSnake(s) as Record<string, unknown>
  const { dept, cat, attendance, id, code, employee_code: _ec, ...rest } = snake
  return {
    ...rest,
    department: dept,
    category: cat,
    attendance_pct: attendance,
    employee_code: s.code?.trim() || undefined,
    email: s.email?.trim() || undefined,
  }
}

export async function getStaff(id: string): Promise<Staff> {
  const wire = await request<Record<string, unknown>>(`/staff/${id}`)
  return toStaff(wire)
}

/** Body for PATCH /staff/{id}. */
export function fromStaffUpdate(s: Staff): Record<string, unknown> {
  return {
    name: s.name,
    role: s.role,
    category: s.cat,
    department: s.dept,
    phone: s.phone,
    shift: s.shift,
    route: s.route,
    status: s.status,
    email: s.email?.trim() || undefined,
  }
}

export async function createStaff(s: Staff): Promise<Staff> {
  const wire = await request<Record<string, unknown>>('/staff', { method: 'POST', body: fromStaff(s) })
  return toStaff(wire)
}

export async function updateStaff(id: string, s: Staff): Promise<Staff> {
  const wire = await request<Record<string, unknown>>(`/staff/${id}`, {
    method: 'PATCH',
    body: fromStaffUpdate(s),
  })
  return toStaff(wire)
}

/** Writes through to the staff member's linked Users row (Users.PhotoUrl — the
 *  same field the teacher app reads), not a staffExtras/localStorage field.
 *  `photoDataUrl: null` clears the photo. Throws `no_linked_user` (409) if this
 *  staff member hasn't accepted their sign-in invite yet — the caller should
 *  treat that as expected and non-fatal, not surface it as a hard failure. */
export async function updateStaffPhoto(id: string, photoDataUrl: string | null): Promise<void> {
  await request(`/staff/${id}`, {
    method: 'PATCH',
    body: { photo_url: photoDataUrl, set_photo: true },
  })
}
