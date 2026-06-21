import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listStudents, getStudent, createStudent } from './students'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireStudent = {
  id: 's1', admission_no: 'A-100', name: 'Asha', gender: 'F', grade: '10', section: 'A',
  class_label: '10-A', roll: 3, guardian: 'Ravi', phone: '99', attendance: 92,
  fee_status: 'paid', fee_due: 0, status: 'active', house: 'Blue', avatar_hue: 210,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listStudents', () => {
  it('maps the snake_case wire to the camelCase Student shape (adm/cls renamed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireStudent], next_cursor: null })))
    const rows = await listStudents()
    expect(rows[0]).toMatchObject({
      id: 's1', adm: 'A-100', cls: '10-A', name: 'Asha',
      feeStatus: 'paid', feeDue: 0, avatarHue: 210,
    })
    expect((rows[0] as unknown as Record<string, unknown>).admission_no).toBeUndefined()
    expect((rows[0] as unknown as Record<string, unknown>).class_label).toBeUndefined()
  })

  it('forwards q/grade/status/fee as query params and drops "all"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listStudents({ q: 'asha', grade: '10', status: 'active', fee: 'paid' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('q=asha')
    expect(url).toContain('grade=10')
    expect(url).toContain('status=active')
    expect(url).toContain('fee=paid')

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    await listStudents({ grade: 'all', status: 'all', fee: 'all' })
    const url2 = fetchMock.mock.calls[0][0] as string
    expect(url2).not.toContain('grade=')
    expect(url2).not.toContain('status=')
    expect(url2).not.toContain('fee=')
  })
})

describe('getStudent', () => {
  it('maps a single record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { ...wireStudent, id: 's2', admission_no: 'A-200', class_label: '9-B', fee_status: 'due', fee_due: 1200 } })))
    const s = await getStudent('s2')
    expect(s).toMatchObject({ id: 's2', adm: 'A-200', cls: '9-B', feeStatus: 'due', feeDue: 1200 })
  })
})

describe('createStudent', () => {
  it('POSTs a snake_case body (adm->admission_no, cls->class_label) and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srv1', admission_no: 'A-9', class_label: '8-C', name: 'New Kid', gender: 'M', grade: '8', section: 'C', roll: 5, guardian: 'G', phone: '7', attendance: 0, fee_status: 'due', fee_due: 0, status: 'active', house: 'Ruby', avatar_hue: 50 } }))
    vi.stubGlobal('fetch', fetchMock)
    const created = await createStudent({ id: 'tmp', adm: 'A-9', cls: '8-C', name: 'New Kid', gender: 'M', grade: '8', section: 'C', roll: 5, guardian: 'G', phone: '7', attendance: 0, feeStatus: 'due', feeDue: 0, status: 'active', house: 'Ruby', avatarHue: 50 } as Parameters<typeof createStudent>[0])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/students')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.admission_no).toBe('A-9')
    expect(body.class_label).toBe('8-C')
    expect(body.fee_status).toBe('due')
    expect(body.adm).toBeUndefined()
    expect(body.cls).toBeUndefined()
    expect(created).toMatchObject({ id: 'srv1', adm: 'A-9', cls: '8-C' })
  })
})
