import { describe, it, expect, vi, afterEach } from 'vitest'
import { groupExamTimetable, autoBuildExamSlots, buildExamPeriodGrid, orderSubjectsBy, shuffleWithSeed, printExamTimetable } from './examTimetable'

describe('shuffleWithSeed', () => {
  it('is deterministic for the same seed', () => {
    const input = ['A', 'B', 'C', 'D', 'E']
    expect(shuffleWithSeed(input, 42)).toEqual(shuffleWithSeed(input, 42))
  })

  it('keeps the same members and does not mutate input', () => {
    const input = ['A', 'B', 'C', 'D']
    const out = shuffleWithSeed(input, 7)
    expect([...out].sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(input).toEqual(['A', 'B', 'C', 'D'])
  })

  it('usually produces a different order across seeds', () => {
    const input = ['A', 'B', 'C', 'D', 'E', 'F']
    expect(shuffleWithSeed(input, 1)).not.toEqual(shuffleWithSeed(input, 999))
  })
})

describe('orderSubjectsBy', () => {
  it('places listed subjects first in the given order', () => {
    expect(orderSubjectsBy(['Maths', 'English', 'Science'], ['Science', 'Maths']))
      .toEqual(['Science', 'Maths', 'English'])
  })

  it('keeps unlisted subjects at the end in original order', () => {
    expect(orderSubjectsBy(['A', 'B', 'C', 'D'], ['C']))
      .toEqual(['C', 'A', 'B', 'D'])
  })

  it('ignores order entries not present in subjects', () => {
    expect(orderSubjectsBy(['A', 'B'], ['Z', 'B', 'A']))
      .toEqual(['B', 'A'])
  })
})

describe('groupExamTimetable', () => {
  it('groups by date and sorts by start time', () => {
    const days = groupExamTimetable([
      { id: '2', subject: 'Science', date: '2026-09-10', start: '09:30', duration: 180, room: 'H2', inv1: 'A', inv2: '' },
      { id: '1', subject: 'English', date: '2026-09-08', start: '13:00', duration: 120, room: 'H1', inv1: 'B', inv2: '' },
      { id: '3', subject: 'Maths', date: '2026-09-08', start: '09:30', duration: 180, room: 'H1', inv1: 'C', inv2: 'D' },
    ])
    expect(days.map((d) => d.date)).toEqual(['2026-09-08', '2026-09-10'])
    expect(days[0].papers.map((p) => p.subject)).toEqual(['Maths', 'English'])
    expect(days[1].papers[0].subject).toBe('Science')
  })

  it('keeps class labels on timetable papers', () => {
    const days = groupExamTimetable([
      { id: '1', classId: 'c1', className: 'VI-A', subject: 'Maths', date: '2026-09-08', start: '09:30', duration: 180, room: 'H1', inv1: '', inv2: '' },
    ])
    expect(days[0].papers[0]).toMatchObject({ classId: 'c1', className: 'VI-A' })
  })

  it('skips papers without a date', () => {
    expect(groupExamTimetable([
      { id: '1', subject: 'X', date: '', start: '09:00', duration: 60, room: '', inv1: '', inv2: '' },
    ])).toEqual([])
  })
})

describe('buildExamPeriodGrid', () => {
  it('uses sessions as rows and dates as columns', () => {
    const grid = buildExamPeriodGrid([
      { id: '1', subject: 'Maths', date: '2026-09-08', start: '09:30', duration: 180, room: 'H1', inv1: '', inv2: '' },
      { id: '2', subject: 'English', date: '2026-09-08', start: '13:30', duration: 120, room: 'H1', inv1: '', inv2: '' },
      { id: '3', subject: 'Science', date: '2026-09-09', start: '09:30', duration: 180, room: 'H2', inv1: '', inv2: '' },
    ])
    expect(grid.dates).toEqual(['2026-09-08', '2026-09-09'])
    expect(grid.dayCols.every((d) => d.hasExam)).toBe(true)
    expect(grid.sessions.map((s) => s.label)).toEqual(['Morning · 09:30', 'Afternoon · 13:30'])
    expect(grid.cell('2026-09-08', '09:30')[0].subject).toBe('Maths')
    expect(grid.cell('2026-09-09', '13:30')).toEqual([])
    expect(grid.cell('2026-09-09', '09:30')[0].subject).toBe('Science')
  })

  it('fills gap days between exam dates and marks exam vs gap', () => {
    const grid = buildExamPeriodGrid([
      { id: '1', subject: 'A', date: '2026-09-07', start: '09:30', duration: 180, room: 'H1', inv1: '', inv2: '' },
      { id: '2', subject: 'B', date: '2026-09-09', start: '09:30', duration: 180, room: 'H1', inv1: '', inv2: '' },
    ])
    expect(grid.dates).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
    expect(grid.dayCols.map((d) => d.hasExam)).toEqual([true, false, true])
    expect(grid.cell('2026-09-08', '09:30')).toEqual([])
  })

  it('labels a single session as Session', () => {
    const grid = buildExamPeriodGrid([
      { id: '1', subject: 'A', date: '2026-09-08', start: '09:30', duration: 180, room: '', inv1: '', inv2: '' },
    ])
    expect(grid.sessions[0].label).toBe('Session · 09:30')
    expect(grid.dayCols[0]).toEqual({ date: '2026-09-08', hasExam: true })
  })
})

describe('autoBuildExamSlots', () => {
  it('places one subject per day for a single session', () => {
    const slots = autoBuildExamSlots({
      subjects: ['English', 'Maths', 'Science'],
      startDate: '2026-09-07', // Monday
      sessions: [{ start: '09:30', label: 'Morning' }],
      duration: 180,
    })
    expect(slots.map((s) => s.date)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
    expect(slots.every((s) => s.start === '09:30' && s.duration === 180)).toBe(true)
    expect(slots.map((s) => s.subject)).toEqual(['English', 'Maths', 'Science'])
  })

  it('fills two sessions on the same day', () => {
    const slots = autoBuildExamSlots({
      subjects: ['A', 'B', 'C'],
      startDate: '2026-09-07',
      sessions: [{ start: '09:30' }, { start: '13:30' }],
      duration: 120,
    })
    expect(slots[0]).toMatchObject({ date: '2026-09-07', start: '09:30' })
    expect(slots[1]).toMatchObject({ date: '2026-09-07', start: '13:30' })
    expect(slots[2]).toMatchObject({ date: '2026-09-08', start: '09:30' })
  })

  it('applies a gap between exam days', () => {
    const slots = autoBuildExamSlots({
      subjects: ['A', 'B'],
      startDate: '2026-09-07',
      sessions: [{ start: '09:30' }],
      duration: 180,
      gapDays: 1,
    })
    expect(slots.map((s) => s.date)).toEqual(['2026-09-07', '2026-09-09'])
  })

  it('skips Sundays when configured', () => {
    const slots = autoBuildExamSlots({
      subjects: ['A', 'B'],
      startDate: '2026-09-12', // Saturday
      sessions: [{ start: '09:30' }],
      duration: 180,
      skipSunday: true,
    })
    // Sat 12 -> Sun 13 skipped -> Mon 14
    expect(slots.map((s) => s.date)).toEqual(['2026-09-12', '2026-09-14'])
  })

  it('carries class assignment onto generated slots', () => {
    const slots = autoBuildExamSlots({
      subjects: ['A'],
      startDate: '2026-09-07',
      sessions: [{ start: '09:30' }],
      duration: 180,
      classId: 'c1',
      className: 'VI-A',
      room: 'Hall 1',
    })
    expect(slots[0]).toMatchObject({ classId: 'c1', className: 'VI-A', room: 'Hall 1' })
  })

  it('returns [] when nothing to place', () => {
    expect(autoBuildExamSlots({ subjects: [], startDate: '2026-09-07', sessions: [{ start: '09:30' }], duration: 180 })).toEqual([])
    expect(autoBuildExamSlots({ subjects: ['A'], startDate: '', sessions: [{ start: '09:30' }], duration: 180 })).toEqual([])
  })
})

describe('printExamTimetable', () => {
  const baseOpts = {
    schoolName: 'Demo School',
    examName: 'Unit Test 1',
    grades: 'VI–X',
    from: '2026-09-07',
    to: '2026-09-09',
    days: groupExamTimetable([
      { id: '1', subject: 'Maths', date: '2026-09-07', start: '09:30', duration: 180, room: 'H1', inv1: '', inv2: '' },
    ]),
    autoPrint: false,
  }

  afterEach(() => {
    vi.restoreAllMocks()
    document.querySelectorAll('iframe').forEach((f) => f.remove())
  })

  it('writes the timetable HTML into an opened window', () => {
    const writes: string[] = []
    const fakeWin = {
      document: { open: vi.fn(), write: (h: string) => writes.push(h), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(fakeWin)
    expect(printExamTimetable(baseOpts)).toBe(true)
    expect(writes.join('')).toContain('Unit Test 1')
    expect(writes.join('')).toContain('Maths')
  })

  it('falls back to a hidden iframe when the pop-up is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(document.querySelectorAll('iframe').length).toBe(0)
    const ok = printExamTimetable(baseOpts)
    expect(ok).toBe(true)
    expect(document.querySelectorAll('iframe').length).toBe(1)
  })
})
