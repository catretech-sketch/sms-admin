import { describe, expect, it } from 'vitest'
import type { AttendanceRecord, AttendanceStatus } from '@/api/attendance'
import { dailyTrend, monthlyTrend, quarterlyTrend, startOfWeek, trendComposition, weeklyTrend } from './attendanceTrend'

function rec(studentId: string, date: string, status: AttendanceStatus): AttendanceRecord {
  return { id: `${studentId}-${date}`, classId: 'c1', studentId, date, status }
}

describe('startOfWeek', () => {
  it('returns the Monday of the week', () => {
    // 2026-07-15 is a Wednesday → Monday is 2026-07-13
    const mon = startOfWeek(new Date('2026-07-15T09:00:00'))
    expect(mon.getFullYear()).toBe(2026)
    expect(mon.getMonth()).toBe(6)
    expect(mon.getDate()).toBe(13)
  })
})

describe('weeklyTrend', () => {
  it('buckets marks by week and computes present+late %', () => {
    const end = new Date('2026-07-16T12:00:00') // Thursday, week of Mon 13 Jul
    const records = [
      rec('s1', '2026-07-13', 'present'),
      rec('s2', '2026-07-13', 'absent'),
      rec('s3', '2026-07-14', 'late'), // late counts as attended
      rec('s4', '2026-07-15', 'present'),
    ]
    const series = weeklyTrend(records, 4, end)
    expect(series).toHaveLength(4)
    const current = series[series.length - 1]
    expect(current.value).toBe(75) // 3 attended of 4
    expect(current.empty).toBeFalsy()
  })

  it('flags weeks without any marks as empty', () => {
    const end = new Date('2026-07-16T12:00:00')
    const series = weeklyTrend([rec('s1', '2026-07-15', 'present')], 3, end)
    expect(series[0].empty).toBe(true)
    expect(series[series.length - 1].empty).toBeFalsy()
  })
})

describe('dailyTrend', () => {
  it('buckets marks by day, oldest → newest, flagging empty days', () => {
    const end = new Date('2026-07-16T12:00:00')
    const records = [
      rec('s1', '2026-07-16', 'present'),
      rec('s2', '2026-07-16', 'absent'),
      rec('s3', '2026-07-15', 'late'),
    ]
    const series = dailyTrend(records, 3, end)
    expect(series).toHaveLength(3)
    expect(series[series.length - 1].value).toBe(50) // 16th: 1 of 2
    expect(series[1].value).toBe(100) // 15th: late counts
    expect(series[0].empty).toBe(true) // 14th: no marks
  })
})

describe('quarterlyTrend', () => {
  it('buckets marks by calendar quarter, oldest → newest', () => {
    const end = new Date('2026-07-16T12:00:00') // Q3 2026
    const records = [
      rec('s1', '2026-07-01', 'present'), // Q3
      rec('s2', '2026-07-02', 'absent'), // Q3
      rec('s3', '2026-05-10', 'present'), // Q2
    ]
    const series = quarterlyTrend(records, 3, end)
    expect(series).toHaveLength(3)
    expect(series[series.length - 1].label).toBe("Q3 '26")
    expect(series[series.length - 1].value).toBe(50) // Q3: 1 of 2
    expect(series[series.length - 2].value).toBe(100) // Q2: 1 of 1
  })
})

describe('trendComposition', () => {
  it('splits present/late/absent within the weekly window', () => {
    const end = new Date('2026-07-16T12:00:00')
    const records = [
      rec('s1', '2026-07-13', 'present'),
      rec('s2', '2026-07-14', 'late'),
      rec('s3', '2026-07-15', 'absent'),
      rec('s4', '2026-07-15', 'present'),
      rec('s5', '2026-01-01', 'present'), // outside 4-week window
    ]
    const comp = trendComposition(records, 'week', 4, end)
    expect(comp.present).toBe(2)
    expect(comp.late).toBe(1)
    expect(comp.absent).toBe(1)
    expect(comp.total).toBe(4)
    expect(comp.pct).toBe(75) // (present + late) / total
  })

  it('splits within the monthly window', () => {
    const end = new Date('2026-07-16T12:00:00')
    const records = [
      rec('s1', '2026-07-01', 'present'),
      rec('s2', '2026-06-15', 'absent'),
      rec('s3', '2026-01-01', 'present'), // outside 3-month window
    ]
    const comp = trendComposition(records, 'month', 3, end)
    expect(comp.total).toBe(2)
    expect(comp.present).toBe(1)
    expect(comp.absent).toBe(1)
    expect(comp.pct).toBe(50)
  })
})

describe('monthlyTrend', () => {
  it('buckets marks by month and orders oldest → newest', () => {
    const end = new Date('2026-07-16T12:00:00')
    const records = [
      rec('s1', '2026-06-10', 'present'),
      rec('s2', '2026-06-11', 'absent'),
      rec('s1', '2026-07-01', 'present'),
      rec('s2', '2026-07-02', 'present'),
    ]
    const series = monthlyTrend(records, 3, end)
    expect(series.map((p) => p.label)).toEqual(['May', 'Jun', 'Jul'])
    expect(series[0].empty).toBe(true) // May has no marks
    expect(series[1].value).toBe(50) // Jun: 1 of 2
    expect(series[2].value).toBe(100) // Jul: 2 of 2
  })
})
