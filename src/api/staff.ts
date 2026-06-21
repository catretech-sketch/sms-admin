import { listRequest, request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { Staff, ListStaffOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Map one wire record (snake_case) to the UI `Staff` shape.
 *  Generic casing covers date_of_joining/avatar_hue;
 *  only dept/cat/attendance need an explicit rename. */
export function toStaff(wire: Record<string, unknown>): Staff {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { department, category, attendancePct, ...rest } = c
  return { ...rest, dept: department, cat: category, attendance: attendancePct } as unknown as Staff
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
  const { dept, cat, attendance, ...rest } = snake
  return { ...rest, department: dept, category: cat, attendance_pct: attendance }
}

export async function createStaff(s: Staff): Promise<Staff> {
  const wire = await request<Record<string, unknown>>('/staff', { method: 'POST', body: fromStaff(s) })
  return toStaff(wire)
}
