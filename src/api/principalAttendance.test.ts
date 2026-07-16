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
        staff: [{ teacher_id: 't1', name: 'Rina', initials: 'R', checked_in: true, check_in_at: '2026-07-16T08:01:00Z', role: 'Teacher' }],
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const data = await getPrincipalAttendance('2026-07-16')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/principal/attendance')
    expect(url).toContain('date=2026-07-16')
    expect(data.presentTotal).toBe(3)
    expect(data.classes[0]).toMatchObject({ classId: 'c1', className: '10-A', present: 2 })
    expect(data.staff[0]).toMatchObject({ teacherId: 't1', checkedIn: true, name: 'Rina' })
  })
})
