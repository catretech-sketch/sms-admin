import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listStaff } from './staff'

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
