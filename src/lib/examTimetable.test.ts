import { describe, it, expect } from 'vitest'
import { groupExamTimetable, autoBuildExamSlots } from './examTimetable'

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
