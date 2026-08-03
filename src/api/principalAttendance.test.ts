import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getPrincipalAttendance } from './principalAttendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('getPrincipalAttendance', () => {
  it('GETs /principal/attendance?date= and maps snake_case', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        date: '2026-07-16T00:00:00',
        present_total: 3,
        student_total: 7,
        overall_pct: 42.9,
        classes: [{ class_id: 'c1', class_name: '10-A', present: 2, total: 4, pct: 50 }],
        staff: [{ teacher_id: 't1', name: 'Rina', initials: 'R', checked_in: true, check_in_at: '2026-07-16T08:01:00Z', check_out_at: '2026-07-16T14:30:00Z', role: 'Teacher' }],
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const data = await getPrincipalAttendance('2026-07-16')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/principal/attendance')
    expect(url).toContain('date=2026-07-16')
    expect(url).toContain('offset_minutes=')
    expect(data.presentTotal).toBe(3)
    expect(data.classes[0]).toMatchObject({ classId: 'c1', className: '10-A', present: 2 })
    expect(data.staff[0]).toMatchObject({
      teacherId: 't1', checkedIn: true, name: 'Rina',
      checkInAt: '2026-07-16T08:01:00Z',
      checkOutAt: '2026-07-16T14:30:00Z',
    })
  })

  it('maps nested check_out.at when flat check_out_at is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        date: '2026-07-16',
        present_total: 0,
        student_total: 0,
        overall_pct: 0,
        classes: [],
        staff: [{
          teacher_id: 't1', name: 'Rina', initials: 'R', checked_in: true,
          check_in: { at: '2026-07-16T08:01:00Z', kind: 'in' },
          check_out: { at: '2026-07-16T14:30:00Z', kind: 'out' },
        }],
      },
    })))
    const data = await getPrincipalAttendance('2026-07-16')
    expect(data.staff[0].checkOutAt).toBe('2026-07-16T14:30:00Z')
  })

  it('keeps teacher_id when mapping staff rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        date: '2026-07-16',
        present_total: 0,
        student_total: 0,
        overall_pct: 0,
        classes: [],
        staff: [{
          teacher_id: 'B1F2C3D4-E5F6-7890-ABCD-EF1234567890',
          name: 'Rina',
          initials: 'R',
          checked_in: true,
          check_in_at: '2026-07-16T08:01:00Z',
        }],
      },
    })))
    const data = await getPrincipalAttendance('2026-07-16')
    expect(data.staff[0].teacherId).toBe('B1F2C3D4-E5F6-7890-ABCD-EF1234567890')
    expect(data.staff[0].checkedIn).toBe(true)
  })
})
