import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listAttendance, saveAttendance } from './attendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listAttendance', () => {
  it('GETs /classes/{classId}/attendance?date= and maps snake_case records', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'r1',
        tenant_id: 't1',
        class_id: 'c1',
        student_id: 's1',
        date: '2026-07-16T00:00:00',
        status: 'present',
        marked_by: null,
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await listAttendance('c1', '2026-07-16')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/classes/c1/attendance')
    expect(url).toContain('date=2026-07-16')
    expect((init as RequestInit).method ?? 'GET').toBe('GET')
    expect(rows).toEqual([{
      id: 'r1',
      tenantId: 't1',
      classId: 'c1',
      studentId: 's1',
      date: '2026-07-16T00:00:00',
      status: 'present',
      markedBy: null,
    }])
  })
})

describe('saveAttendance', () => {
  it('POSTs /classes/{classId}/attendance with date + snake_case records', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }))
    vi.stubGlobal('fetch', fetchMock)
    await saveAttendance('c1', {
      date: '2026-07-16T00:00:00',
      records: [
        { studentId: 's1', status: 'present' },
        { studentId: 's2', status: 'absent' },
      ],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/classes/c1/attendance')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({
      date: '2026-07-16',
      records: [
        { student_id: 's1', status: 'present' },
        { student_id: 's2', status: 'absent' },
      ],
    })
    expect(body.period).toBeUndefined()
    expect(body.marks).toBeUndefined()
  })
})
