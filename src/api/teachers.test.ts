import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listTeachers } from './teachers'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireTeacher = {
  id: 'T-01', name: 'Meera', gender: 'F', department: 'Science', designation: 'HOD',
  subjects: ['Physics'], class_teacher: '10-A', phone: '99', email: 'm@s.edu', exp: 12,
  rating: 4.6, attendance_pct: 97, result: 88, load: 24, status: 'active', avatar_hue: 180, top: true,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listTeachers', () => {
  it('maps wire snake_case to the camelCase Teacher shape (dept/desig/attendance renamed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireTeacher], next_cursor: null })))
    const rows = await listTeachers()
    expect(rows[0]).toMatchObject({
      id: 'T-01', name: 'Meera', dept: 'Science', desig: 'HOD',
      classTeacher: '10-A', attendance: 97, avatarHue: 180, top: true,
    })
    const raw = rows[0] as unknown as Record<string, unknown>
    expect(raw.department).toBeUndefined()
    expect(raw.designation).toBeUndefined()
    expect(raw.attendancePct).toBeUndefined()
  })

  it('forwards q/dept/status as query params and drops "all"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listTeachers({ q: 'meera', dept: 'Science', status: 'active' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('q=meera')
    expect(url).toContain('dept=Science')
    expect(url).toContain('status=active')

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    await listTeachers({ dept: 'all', status: 'all' })
    const url2 = fetchMock.mock.calls[0][0] as string
    expect(url2).not.toContain('dept=')
    expect(url2).not.toContain('status=')
  })
})
