import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from './ApiError'
import {
  getAttendanceRollCall,
  listAttendance,
  listClassDayTimetable,
  saveAttendance,
  savePeriodAttendance,
  listCachedAttendanceRange,
  clearAttendanceMemory,
} from './attendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)
}
beforeEach(() => {
  localStorage.clear()
  clearAttendanceMemory()
  vi.restoreAllMocks()
})

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

  it('throws when the list API is 404 (fail closed — no local fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()))
    await expect(listAttendance('c1', '2026-07-16')).rejects.toBeInstanceOf(ApiError)
    expect(listCachedAttendanceRange('c1', '2026-07-01', '2026-07-31')).toHaveLength(0)
  })
})

describe('getAttendanceRollCall', () => {
  it('GETs /classes/{id}/attendance/roll-call?date= and maps can_mark', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        date: '2026-08-12',
        day: 'Wed',
        period: 1,
        subject: 'Math',
        can_mark: true,
        reason: 'first_period',
        marked: false,
      },
    })))
    const row = await getAttendanceRollCall('c1', '2026-08-12')
    expect(row.canMark).toBe(true)
    expect(row.period).toBe(1)
    expect(row.reason).toBe('first_period')
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

  it('throws when the save API is missing (no local success path)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()))
    await expect(saveAttendance('c1', {
      date: '2026-07-16',
      records: [
        { studentId: 's1', status: 'present' },
        { studentId: 's2', status: 'absent' },
      ],
    })).rejects.toBeInstanceOf(ApiError)
    expect(listCachedAttendanceRange('c1', '2026-07-01', '2026-07-31')).toHaveLength(0)
  })

  it('mirrors marks in session memory only after a successful API save', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null })))
    await saveAttendance('c1', {
      date: '2026-07-16',
      records: [{ studentId: 's1', status: 'late' }],
    })
    expect(listCachedAttendanceRange('c1', '2026-07-16', '2026-07-16')).toHaveLength(1)
  })
})

describe('listAttendance empty server', () => {
  it('returns an empty list when the server has no marks (ignores stale localStorage)', async () => {
    localStorage.setItem('sms_attendance:default', JSON.stringify([{
      id: 'local-c1-2026-07-16-s1',
      classId: 'c1',
      studentId: 's1',
      date: '2026-07-16',
      status: 'present',
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })))
    const rows = await listAttendance('c1', '2026-07-16')
    expect(rows).toEqual([])
  })
})

describe('period attendance API', () => {
  it('GETs /classes/{id}/timetable/day and maps slots', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'slot1',
        period: 1,
        subject: 'Music',
        subject_id: 'sub1',
        start_time: '08:00',
        end_time: '08:40',
        teacher_id: 't1',
        teacher_name: 'Amit',
        is_current: true,
        marked: false,
        can_mark: true,
      }],
    })))
    const slots = await listClassDayTimetable('c1', '2026-08-13')
    expect(slots[0]).toMatchObject({
      id: 'slot1',
      period: 1,
      subject: 'Music',
      isCurrent: true,
      canMark: true,
    })
  })

  it('POSTs /classes/{id}/attendance/periods for upsert', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }))
    vi.stubGlobal('fetch', fetchMock)
    await savePeriodAttendance('c1', {
      date: '2026-08-13',
      period: 1,
      subject: 'Music',
      subjectId: 'sub1',
      periodId: 'slot1',
      records: [{ studentId: 's1', status: 'present' }],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/classes/c1/attendance/periods')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.period).toBe(1)
    expect(body.subject).toBe('Music')
    expect(body.records[0]).toEqual({ student_id: 's1', status: 'present' })
  })
})
