import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listStaff, createStaff, updateStaff, fromStaffUpdate } from './staff'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireStaff = {
  id: 'S-01', name: 'Ramesh', gender: 'M', role: 'Accountant', category: 'admin',
  department: 'Finance', phone: '88', shift: 'day', route: null, attendance_pct: 95,
  status: 'active', avatar_hue: 30,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listStaff', () => {
  it('maps wire snake_case to the camelCase Staff shape (dept/cat/attendance renamed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireStaff], next_cursor: null })))
    const rows = await listStaff()
    expect(rows[0]).toMatchObject({
      id: 'S-01', name: 'Ramesh', role: 'Accountant', cat: 'admin',
      dept: 'Finance', attendance: 95, avatarHue: 30, route: null,
    })
    expect((rows[0] as unknown as Record<string, unknown>).category).toBeUndefined()
    expect((rows[0] as unknown as Record<string, unknown>).department).toBeUndefined()
    expect((rows[0] as unknown as Record<string, unknown>).attendancePct).toBeUndefined()
  })

  it('infers category from department when API category is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ ...wireStaff, category: null, department: 'General Support', role: 'Peon' }],
      next_cursor: null,
    })))
    const rows = await listStaff()
    expect(rows[0].cat).toBe('support')
  })

  it('forwards q/cat as query params and drops "all"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listStaff({ q: 'ramesh', cat: 'admin' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('q=ramesh')
    expect(url).toContain('cat=admin')

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    await listStaff({ cat: 'all' })
    const url2 = fetchMock.mock.calls[0][0] as string
    expect(url2).not.toContain('cat=')
  })
})

describe('createStaff', () => {
  it('POSTs snake_case (dept->department, cat->category, attendance->attendance_pct) and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srvS', name: 'New S', gender: 'M', role: 'Clerk', category: 'admin', department: 'Office', phone: '1', shift: 'Day', route: null, attendance_pct: 0, status: 'active', avatar_hue: 3 } }))
    vi.stubGlobal('fetch', fetchMock)
    const created = await createStaff({ id: 'tmp', name: 'New S', gender: 'M', role: 'Clerk', cat: 'admin', dept: 'Office', phone: '1', shift: 'Day', route: null, attendance: 0, status: 'active', avatarHue: 3 } as Parameters<typeof createStaff>[0])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.department).toBe('Office')
    expect(body.category).toBe('admin')
    expect(body.attendance_pct).toBe(0)
    expect(body.cat).toBeUndefined()
    expect(created).toMatchObject({ cat: 'admin', dept: 'Office' })
  })
})

describe('updateStaff', () => {
  it('PATCHes gender and employee code onto the Staff row', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: wireStaff }))
    vi.stubGlobal('fetch', fetchMock)
    const staff = {
      id: 'S-01', name: 'Ramesh', gender: 'M' as const, role: 'Accountant', cat: 'admin',
      dept: 'Finance', phone: '88', shift: 'day', route: null, attendance: 95,
      status: 'active' as const, avatarHue: 30, code: 'STF/26/0001', email: 'r@s.edu',
    }
    expect(fromStaffUpdate(staff as Parameters<typeof fromStaffUpdate>[0])).toMatchObject({
      gender: 'M',
      employee_code: 'STF/26/0001',
      email: 'r@s.edu',
    })
    await updateStaff('S-01', staff as Parameters<typeof updateStaff>[1])
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.gender).toBe('M')
    expect(body.employee_code).toBe('STF/26/0001')
  })
})
