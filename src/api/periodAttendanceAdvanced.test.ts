import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listPeriodAttendanceAdvanced } from './periodAttendanceAdvanced'

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
