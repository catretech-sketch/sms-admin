import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listTeachers, createTeacher, updateTeacher, normalizeSubjects, fromTeacherUpdate } from './teachers'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireTeacher = {
  id: 'T-01', name: 'Meera', gender: 'F', department: 'Science', designation: 'HOD',
  subjects: ['Physics'], class_teacher: '10-A', phone: '99', email: 'm@s.edu', exp: 12,
  rating: 4.6, attendance_pct: 97, result: 88, load: 24, status: 'active', avatar_hue: 180, top: true,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('normalizeSubjects', () => {
  it('parses arrays, comma strings, and JSON strings', () => {
    expect(normalizeSubjects(['Physics', 'Chemistry'])).toEqual(['Physics', 'Chemistry'])
    expect(normalizeSubjects('Physics, Chemistry')).toEqual(['Physics', 'Chemistry'])
    expect(normalizeSubjects('["Physics","Math"]')).toEqual(['Physics', 'Math'])
    expect(normalizeSubjects('')).toEqual([])
    expect(normalizeSubjects(null)).toEqual([])
  })
})

describe('listTeachers', () => {
  it('maps wire snake_case to the camelCase Teacher shape (dept/desig/attendance renamed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireTeacher], next_cursor: null })))
    const rows = await listTeachers()
    expect(rows[0]).toMatchObject({
      id: 'T-01', name: 'Meera', dept: 'Science', desig: 'HOD',
      classTeacher: '10-A', attendance: 97, avatarHue: 180, top: true,
      subjects: ['Physics'],
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

  it('normalizes comma-separated subjects from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ ...wireTeacher, subjects: 'Physics, Chemistry, Biology' }],
      next_cursor: null,
    })))
    const rows = await listTeachers()
    expect(rows[0].subjects).toEqual(['Physics', 'Chemistry', 'Biology'])
  })
})

describe('createTeacher', () => {
  it('POSTs snake_case (dept->department, desig->designation, attendance->attendance_pct) and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srvT', name: 'New T', gender: 'F', department: 'Math', designation: 'Teacher', subjects: [], class_teacher: null, phone: '1', email: 'e', exp: 0, rating: 0, attendance_pct: 0, result: 0, load: 0, status: 'active', avatar_hue: 9, top: false } }))
    vi.stubGlobal('fetch', fetchMock)
    const created = await createTeacher({ id: 'tmp', name: 'New T', gender: 'F', dept: 'Math', desig: 'Teacher', subjects: [], classTeacher: null, phone: '1', email: 'e', exp: 0, rating: 0, attendance: 0, result: 0, load: 0, status: 'active', avatarHue: 9, top: false } as Parameters<typeof createTeacher>[0])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/teachers')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.department).toBe('Math')
    expect(body.designation).toBe('Teacher')
    expect(body.attendance_pct).toBe(0)
    expect(body.dept).toBeUndefined()
    expect(body.desig).toBeUndefined()
    expect(created).toMatchObject({ dept: 'Math', desig: 'Teacher' })
  })
})

describe('updateTeacher', () => {
  it('PATCHes gender, experience, and employee code — not only name/dept/phone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: wireTeacher }))
    vi.stubGlobal('fetch', fetchMock)
    await updateTeacher('T-01', {
      id: 'T-01', name: 'Meera', gender: 'F', dept: 'Science', desig: 'HOD',
      subjects: ['Physics'], classTeacher: '10-A', phone: '99', email: 'm@s.edu',
      exp: 12, rating: 4.6, attendance: 97, result: 88, load: 24, status: 'active',
      avatarHue: 180, top: true, code: 'TCH/26/0001',
    } as Parameters<typeof updateTeacher>[1])
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(fromTeacherUpdate({
      id: 'T-01', name: 'Meera', gender: 'F', dept: 'Science', desig: 'HOD',
      subjects: ['Physics'], classTeacher: '10-A', phone: '99', email: 'm@s.edu',
      exp: 12, rating: 4.6, attendance: 97, result: 88, load: 24, status: 'active',
      avatarHue: 180, top: true, code: 'TCH/26/0001',
    } as Parameters<typeof fromTeacherUpdate>[0])).toMatchObject({
      gender: 'F',
      exp: 12,
      employee_code: 'TCH/26/0001',
    })
    expect(body.gender).toBe('F')
    expect(body.exp).toBe(12)
    expect(body.employee_code).toBe('TCH/26/0001')
  })
})
