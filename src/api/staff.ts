import { listRequest } from './client'
import { snakeToCamel } from './mapper'
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
