import { describe, expect, it } from 'vitest'
import { startOfWeek } from './attendanceTrend'
import {
  dashboardDayWindows,
  dashboardWeekWindows,
  enrollmentByStage,
  enrollmentByStageFromCounts,
  genderCounts,
  loadRangeTrend,
  mapPoolResults,
  pickLatestExam,
  resultBandCounts,
  resultBandCountsFromHistogram,
  trendFromWeekRollups,
  uniqueGradeCount,
} from './dashboardLive'

function student(partial: { grade?: string; gender?: 'M' | 'F' | string }): {
  grade: string
  gender: 'M' | 'F' | string
} {
  return { grade: partial.grade ?? 'V', gender: partial.gender ?? 'M' }
}

describe('enrollmentByStage', () => {
  it('counts live student grades into school stages (not a fixed share)', () => {
    const stages = enrollmentByStage([
      student({ grade: 'Nursery' }),
      student({ grade: 'UKG' }),
      student({ grade: 'III' }),
      student({ grade: 'V' }),
      student({ grade: 'VII' }),
      student({ grade: 'X' }),
      student({ grade: 'XII' }),
    ])
    expect(stages.map((s) => ({ label: s.label, value: s.value }))).toEqual([
      { label: 'Pre-primary', value: 2 },
      { label: 'Primary', value: 2 },
      { label: 'Middle', value: 1 },
      { label: 'Secondary', value: 2 },
    ])
  })

  it('returns empty stages when there are no students', () => {
    expect(enrollmentByStage([]).every((s) => s.value === 0)).toBe(true)
  })

  it('puts unrecognised grades in Other so the donut matches enrolment', () => {
    const stages = enrollmentByStage([student({ grade: 'IB-DP' })])
    expect(stages.find((s) => s.label === 'Other')?.value).toBe(1)
  })
})

describe('enrollmentByStageFromCounts', () => {
  it('matches enrollmentByStage without expanding the roster', () => {
    const students = [
      student({ grade: 'Nursery' }),
      student({ grade: 'UKG' }),
      student({ grade: 'III' }),
      student({ grade: 'V' }),
    ]
    const counts = [
      { grade: 'Nursery', count: 1 },
      { grade: 'UKG', count: 1 },
      { grade: 'III', count: 1 },
      { grade: 'V', count: 1 },
    ]
    expect(enrollmentByStageFromCounts(counts).map((s) => s.value))
      .toEqual(enrollmentByStage(students).map((s) => s.value))
  })
})

describe('genderCounts', () => {
  it('uses recorded gender instead of a 53/47 split', () => {
    expect(genderCounts([
      student({ gender: 'M' }),
      student({ gender: 'M' }),
      student({ gender: 'F' }),
    ])).toEqual({ boys: 2, girls: 1, unspecified: 0 })
  })

  it('does not invent a gender for blank values', () => {
    expect(genderCounts([student({ gender: '' })])).toEqual({ boys: 0, girls: 0, unspecified: 1 })
  })
})

describe('uniqueGradeCount', () => {
  it('counts distinct live grades', () => {
    expect(uniqueGradeCount([
      student({ grade: 'IV' }),
      student({ grade: 'IV' }),
      student({ grade: 'V' }),
    ])).toBe(2)
  })
})

describe('mapPoolResults', () => {
  it('keeps at most N fetches in flight', async () => {
    let current = 0
    let max = 0
    await mapPoolResults([1, 2, 3, 4, 5], 2, async () => {
      current += 1
      max = Math.max(max, current)
      await new Promise((r) => setTimeout(r, 15))
      current -= 1
    })
    expect(max).toBeLessThanOrEqual(2)
  })
})

describe('loadRangeTrend', () => {
  it('fetches week rollups with bounded concurrency instead of all at once', async () => {
    let current = 0
    let max = 0
    const windows = [
      { from: '2026-08-03', to: '2026-08-09', label: '3 Aug' },
      { from: '2026-08-10', to: '2026-08-16', label: '10 Aug' },
      { from: '2026-08-17', to: '2026-08-23', label: '17 Aug' },
    ]
    const points = await loadRangeTrend(windows, async (w) => {
      current += 1
      max = Math.max(max, current)
      await new Promise((r) => setTimeout(r, 15))
      current -= 1
      return {
        totalMarkedPeriods: w.label === '3 Aug' ? 0 : 10,
        present: 9,
        late: 0,
        attendancePercentage: 90,
      }
    }, 2)
    expect(max).toBeLessThanOrEqual(2)
    expect(points[0]).toMatchObject({ empty: true })
    expect(points[1]).toEqual({ label: '10 Aug', value: 90 })
  })
})

describe('dashboardDayWindows', () => {
  it('returns 14 calendar days ending on the given day', () => {
    const windows = dashboardDayWindows(14, new Date('2026-08-26T12:00:00'))
    expect(windows).toHaveLength(14)
    expect(windows[13]).toMatchObject({ from: '2026-08-26', to: '2026-08-26' })
    expect(windows[0]?.from).toBe('2026-08-13')
  })
})

describe('dashboardWeekWindows', () => {
  it('returns 8 weeks ending on the week of the given day', () => {
    const windows = dashboardWeekWindows(8, new Date('2026-08-26T12:00:00'))
    expect(windows).toHaveLength(8)
    expect(windows[7]?.from).toBe('2026-08-24')
    expect(windows[7]?.to).toBe('2026-08-26')
    expect(windows[0]?.from).toBe(isoFrom(startOfWeek(new Date('2026-08-26T12:00:00')), -7 * 7))
  })
})

describe('trendFromWeekRollups', () => {
  it('marks weeks with no period marks as empty instead of inventing a %', () => {
    const points = trendFromWeekRollups(
      [{ label: '3 Aug' }, { label: '10 Aug' }],
      [
        { totalMarkedPeriods: 0, present: 0, late: 0, attendancePercentage: null },
        { totalMarkedPeriods: 40, present: 36, late: 0, attendancePercentage: 90 },
      ],
    )
    expect(points[0]).toMatchObject({ label: '3 Aug', value: 0, empty: true })
    expect(points[1]).toEqual({ label: '10 Aug', value: 90 })
  })
})

describe('resultBandCounts', () => {
  it('counts saved exam letter grades and ignores blank rows', () => {
    const bands = resultBandCounts([
      { grade: 'A1' },
      { grade: 'A1' },
      { grade: 'B2' },
      { grade: '' },
    ])
    expect(bands.find((b) => b.label === 'A1')?.value).toBe(2)
    expect(bands.find((b) => b.label === 'B2')?.value).toBe(1)
    expect(bands.reduce((n, b) => n + b.value, 0)).toBe(3)
  })

  it('returns no bars when no letter grades are saved', () => {
    expect(resultBandCounts([{ grade: '' }, { grade: '  ' }])).toEqual([])
  })
})

describe('resultBandCountsFromHistogram', () => {
  it('matches resultBandCounts without expanding thousands of rows', () => {
    const fromRows = resultBandCounts([{ grade: 'A1' }, { grade: 'A1' }, { grade: 'B2' }])
    const fromHist = resultBandCountsFromHistogram([{ grade: 'A1', count: 2 }, { grade: 'B2', count: 1 }])
    expect(fromHist).toEqual(fromRows)
  })
})

describe('pickLatestExam', () => {
  it('prefers completed exams, then latest end date', () => {
    const latest = pickLatestExam([
      { id: '1', status: 'draft', to: '2026-08-20', published: false },
      { id: '2', status: 'completed', to: '2026-07-01', published: true },
      { id: '3', status: 'marks_entry', to: '2026-08-25', published: true },
    ])
    expect(latest?.id).toBe('2')
  })
})

function isoFrom(d: Date, dayDelta: number): string {
  const x = new Date(d)
  x.setDate(x.getDate() + dayDelta)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
