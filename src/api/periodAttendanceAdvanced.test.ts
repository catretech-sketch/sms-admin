import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  listPeriodAttendanceAdvanced,
  getPeriodAttendanceClassDaySummary,
  listPeriodAttendanceSubjectSummaries,
  listPeriodAttendanceTeacherSummaries,
  getPeriodAttendanceRangeSummary,
} from './periodAttendanceAdvanced'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const wireRow = {
  id: 'par1',
  class_id: 'c1',
  grade: 'IV',
  section: 'B',
  class_label: 'IV-B',
  student_id: 's1',
  student_name: 'Asha Kumar',
  admission_no: 'STU/26/0001',
  date: '2026-08-13',
  period: 2,
  period_id: 'p2',
  subject: 'Math',
  subject_id: 'sub1',
  start_time: '09:00',
  end_time: '09:40',
  status: 'present',
  assigned_teacher_id: 't1',
  assigned_teacher_name: 'Ravi Sharma',
  marked_by: 'u1',
  marked_by_name: 'Ravi Sharma',
  marked_by_role: 'teacher',
  marked_at: '2026-08-13T09:05:00Z',
  geo_fence_status: 'not_required',
}

describe('listPeriodAttendanceAdvanced', () => {
  it('GETs /attendance/period-records with filter query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        items: [wireRow],
        total_count: 1,
        page: 1,
        page_size: 25,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await listPeriodAttendanceAdvanced({
      preset: 'today',
      from: '2026-08-13',
      to: '2026-08-13',
      classId: 'c1',
      grade: 'IV',
      section: 'B',
      subject: 'Math',
      period: 2,
      assignedTeacherId: 't1',
      markedBy: 'u1',
      markedByRole: 'teacher',
      status: 'present',
      q: 'asha',
      page: 1,
      pageSize: 25,
    })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/attendance/period-records')
    expect(url).toContain('preset=today')
    expect(url).toContain('from=2026-08-13')
    expect(url).toContain('to=2026-08-13')
    expect(url).toContain('classId=c1')
    expect(url).toContain('grade=IV')
    expect(url).toContain('section=B')
    expect(url).toContain('subject=Math')
    expect(url).toContain('period=2')
    expect(url).toContain('assignedTeacherId=t1')
    expect(url).toContain('markedBy=u1')
    expect(url).toContain('markedByRole=teacher')
    expect(url).toContain('status=present')
    expect(url).toContain('q=asha')
    expect(url).toContain('page=1')
    expect(url).toContain('pageSize=25')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method ?? 'GET').toBe('GET')
  })

  it('maps snake_case page envelope to camelCase types', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        items: [wireRow],
        total_count: 42,
        page: 2,
        page_size: 10,
      },
    })))

    const page = await listPeriodAttendanceAdvanced({ page: 2, pageSize: 10 })
    expect(page.totalCount).toBe(42)
    expect(page.page).toBe(2)
    expect(page.pageSize).toBe(10)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      id: 'par1',
      classId: 'c1',
      grade: 'IV',
      section: 'B',
      classLabel: 'IV-B',
      studentId: 's1',
      studentName: 'Asha Kumar',
      admissionNo: 'STU/26/0001',
      date: '2026-08-13',
      period: 2,
      periodId: 'p2',
      subject: 'Math',
      subjectId: 'sub1',
      startTime: '09:00',
      endTime: '09:40',
      status: 'present',
      assignedTeacherId: 't1',
      assignedTeacherName: 'Ravi Sharma',
      markedBy: 'u1',
      markedByName: 'Ravi Sharma',
      markedByRole: 'teacher',
      markedAt: '2026-08-13T09:05:00Z',
      geoFenceStatus: 'not_required',
    })
  })

  it('returns an empty page when items are missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: { items: null, total_count: 0, page: 1, page_size: 25 },
    })))

    const page = await listPeriodAttendanceAdvanced()
    expect(page.items).toEqual([])
    expect(page.totalCount).toBe(0)
  })
})

describe('getPeriodAttendanceClassDaySummary', () => {
  it('GETs the class-day summary and maps snake_case fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        total_students: 30, present: 25, absent: 3, late: 1, leave: 1, not_marked: 0,
        attendance_percentage: 86.67, total_periods: 30, marked_periods: 30, pending_periods: 0,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const summary = await getPeriodAttendanceClassDaySummary('c1', '2026-08-13')

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/attendance/period-records/summary/class')
    expect(url).toContain('classId=c1')
    expect(url).toContain('date=2026-08-13')
    expect(summary).toMatchObject({
      totalStudents: 30, present: 25, absent: 3, late: 1, leave: 1, notMarked: 0,
      attendancePercentage: 86.67, totalPeriods: 30, markedPeriods: 30, pendingPeriods: 0,
    })
  })
})

describe('listPeriodAttendanceSubjectSummaries', () => {
  it('GETs subject summaries for a class + range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        subject: 'Math', teacher_name: 'Ravi Sharma', periods: 20, marked: 18, pending: 2,
        present: 16, absent: 2, late: 0, attendance_percentage: 88.9,
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const rows = await listPeriodAttendanceSubjectSummaries('c1', { preset: 'last_30_days' })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/attendance/period-records/summary/subjects')
    expect(url).toContain('classId=c1')
    expect(url).toContain('preset=last_30_days')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ subject: 'Math', teacherName: 'Ravi Sharma', periods: 20, marked: 18, pending: 2 })
  })

  it('returns an empty array when the response is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null })))
    const rows = await listPeriodAttendanceSubjectSummaries('c1')
    expect(rows).toEqual([])
  })
})

describe('listPeriodAttendanceTeacherSummaries', () => {
  it('GETs teacher summaries for a range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        teacher_id: 't1', teacher_name: 'Ravi Sharma', classes: 3, sections: 4, subjects: 2,
        expected_periods: 40, marked_periods: 38, pending_periods: 2,
        teacher_marked: 30, staff_marked: 5, principal_marked: 2, admin_marked: 1,
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const rows = await listPeriodAttendanceTeacherSummaries({ preset: 'this_week' })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/attendance/period-records/summary/teachers')
    expect(url).toContain('preset=this_week')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ teacherId: 't1', teacherName: 'Ravi Sharma', expectedPeriods: 40, markedPeriods: 38 })
  })
})

describe('getPeriodAttendanceRangeSummary', () => {
  it('GETs the range rollup with combinable filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        total_marked_periods: 120, present: 100, absent: 10, late: 8, leave: 2,
        attendance_percentage: 90,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const rollup = await getPeriodAttendanceRangeSummary({
      preset: 'last_90_days', classId: 'c1', subject: 'Math', teacherId: 't1',
    })

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/attendance/period-records/summary/range')
    expect(url).toContain('preset=last_90_days')
    expect(url).toContain('classId=c1')
    expect(url).toContain('subject=Math')
    expect(url).toContain('teacherId=t1')
    expect(rollup).toMatchObject({ totalMarkedPeriods: 120, present: 100, absent: 10, late: 8, leave: 2, attendancePercentage: 90 })
  })
})
