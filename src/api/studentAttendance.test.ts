import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  rollupMonthlyAttendance,
  monthlyBreakdown,
  monthlySeries,
  monthlySeriesForKeys,
  academicYearMonthKeys,
  academicYearStart,
  dailyMarksForMonth,
  monthDailyGrid,
  attendancePctByStudent,
  weekdaysBetween,
  listStudentAttendanceHistory,
} from './studentAttendance'
import type { AttendanceRecord } from './attendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { vi.restoreAllMocks() })

describe('weekdaysBetween', () => {
  it('skips weekends', () => {
    const days = weekdaysBetween('2026-07-13', '2026-07-19') /* Mon–Sun */
    expect(days).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
    ])
  })
})

describe('rollupMonthlyAttendance', () => {
  it('computes month % from real day marks only for that student', () => {
    const rows: AttendanceRecord[] = [
      { id: '1', classId: 'c1', studentId: 's1', date: '2026-07-01', status: 'present' },
      { id: '2', classId: 'c1', studentId: 's1', date: '2026-07-02', status: 'absent' },
      { id: '3', classId: 'c1', studentId: 's1', date: '2026-07-03', status: 'late' },
      { id: '4', classId: 'c1', studentId: 's2', date: '2026-07-01', status: 'absent' },
      { id: '5', classId: 'c1', studentId: 's1', date: '2026-06-15', status: 'present' },
    ]
    expect(rollupMonthlyAttendance(rows, 's1')).toEqual([
      { label: 'Jun', value: 100 },
      { label: 'Jul', value: 67 },
    ])
  })

  it('returns empty when no marks', () => {
    expect(rollupMonthlyAttendance([], 's1')).toEqual([])
  })
})

describe('monthlyBreakdown + dailyMarksForMonth (drill-down)', () => {
  const rows: AttendanceRecord[] = [
    { id: '1', classId: 'c1', studentId: 's1', date: '2026-07-01', status: 'present' },
    { id: '2', classId: 'c1', studentId: 's1', date: '2026-07-02', status: 'absent' },
    { id: '3', classId: 'c1', studentId: 's1', date: '2026-07-03', status: 'late' },
    { id: '4', classId: 'c1', studentId: 's2', date: '2026-07-01', status: 'absent' },
    { id: '5', classId: 'c1', studentId: 's1', date: '2026-06-15', status: 'present' },
  ]

  it('keeps YYYY-MM keys and raw counts per month', () => {
    expect(monthlyBreakdown(rows, 's1')).toEqual([
      { key: '2026-06', label: 'Jun', value: 100, present: 1, total: 1 },
      { key: '2026-07', label: 'Jul', value: 67, present: 2, total: 3 },
    ])
  })

  it('lists this student\'s daily marks for a month, sorted, excluding other students', () => {
    expect(dailyMarksForMonth(rows, 's1', '2026-07')).toEqual([
      { date: '2026-07-01', status: 'present' },
      { date: '2026-07-02', status: 'absent' },
      { date: '2026-07-03', status: 'late' },
    ])
    expect(dailyMarksForMonth(rows, 's1', '2026-05')).toEqual([])
  })

  it('monthDailyGrid returns every calendar day, blank where unmarked', () => {
    const grid = monthDailyGrid(rows, 's1', '2026-07')
    expect(grid).toHaveLength(31) // July has 31 days
    expect(grid[0]).toEqual({ date: '2026-07-01', status: 'present', weekend: false })
    expect(grid[1]).toEqual({ date: '2026-07-02', status: 'absent', weekend: false })
    expect(grid[2]).toEqual({ date: '2026-07-03', status: 'late', weekend: false })
    // 2026-07-04 is a Saturday with no mark → blank weekend
    expect(grid[3]).toEqual({ date: '2026-07-04', status: null, weekend: true })
    // a marked-free weekday stays blank
    expect(grid[9]).toEqual({ date: '2026-07-10', status: null, weekend: false })
  })

  it('monthlySeries yields a continuous axis with blank (total 0) months', () => {
    const series = monthlySeries(rows, 's1', { monthsBack: 3, monthsForward: 1, end: new Date('2026-07-15T12:00:00') })
    expect(series.map((m) => m.key)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
    // Jun and Jul have marks; the rest are blank (total 0)
    expect(series.find((m) => m.key === '2026-06')).toMatchObject({ value: 100, total: 1 })
    expect(series.find((m) => m.key === '2026-07')).toMatchObject({ value: 67, total: 3 })
    expect(series.find((m) => m.key === '2026-05')).toMatchObject({ value: 0, total: 0 })
    expect(series.find((m) => m.key === '2026-08')).toMatchObject({ value: 0, total: 0 })
  })

  it('academicYearStart returns the April-based session start year', () => {
    expect(academicYearStart(new Date('2026-07-15T12:00:00'))).toBe(2026) // Jul → 2026-27 session
    expect(academicYearStart(new Date('2026-02-15T12:00:00'))).toBe(2025) // Feb → 2025-26 session
    expect(academicYearStart(new Date('2026-04-01T12:00:00'))).toBe(2026) // Apr → new session
  })

  it('academicYearMonthKeys spans Apr → next Mar (12 months)', () => {
    const keys = academicYearMonthKeys(2026)
    expect(keys).toHaveLength(12)
    expect(keys[0]).toBe('2026-04')
    expect(keys[8]).toBe('2026-12')
    expect(keys[11]).toBe('2027-03')
  })

  it('monthlySeriesForKeys fills an academic-year axis, blank where unmarked', () => {
    const series = monthlySeriesForKeys(rows, 's1', academicYearMonthKeys(2026))
    expect(series).toHaveLength(12)
    expect(series[0].key).toBe('2026-04') // Apr — blank
    expect(series[0]).toMatchObject({ total: 0, value: 0 })
    expect(series.find((m) => m.key === '2026-07')).toMatchObject({ value: 67, total: 3 })
  })

  it('attendancePctByStudent computes present+late over total per student', () => {
    const map = attendancePctByStudent(rows)
    // s1: present(07-01) + late(07-03) + present(06-15) = 3 attended of 4 total = 75%
    expect(map.get('s1')).toBe(75)
    // s2: 0 attended of 1 = 0%
    expect(map.get('s2')).toBe(0)
    expect(map.has('s3')).toBe(false)
  })
})

describe('listStudentAttendanceHistory', () => {
  it('uses GET /students/{id}/attendance when available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'r1', student_id: 's1', class_id: 'c1', date: '2026-07-10', status: 'present' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await listStudentAttendanceHistory('s1', 'c1', { from: '2026-07-01', to: '2026-07-17' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/students/s1/attendance')
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('present')
  })

  it('falls back to class day marks and filters the student', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/students/')) {
        return Promise.resolve(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404))
      }
      if (u.includes('/classes/c1/attendance') && u.includes('from=')) {
        return Promise.resolve(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404))
      }
      if (u.includes('date=2026-07-16')) {
        return Promise.resolve(jsonResponse({
          data: [
            { id: 'a', student_id: 's1', class_id: 'c1', date: '2026-07-16', status: 'present' },
            { id: 'b', student_id: 's2', class_id: 'c1', date: '2026-07-16', status: 'absent' },
          ],
        }))
      }
      return Promise.resolve(jsonResponse({ data: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const rows = await listStudentAttendanceHistory('s1', 'c1', { from: '2026-07-16', to: '2026-07-16' })
    expect(rows).toEqual([expect.objectContaining({ studentId: 's1', status: 'present' })])
  })
})
