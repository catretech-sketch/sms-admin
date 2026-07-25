import { describe, it, expect } from 'vitest'
import { markKey, attKey, marksProgress, endTime, findClashes } from './examData'
import type { PaperSlot } from '@/types'
import { reportFor, classRank } from './format'
import { students } from '@/data/mockDb'

describe('examData', () => {
  it('builds composite keys', () => {
    expect(markKey('EX1', 'S1', 'Mathematics')).toBe('EX1|S1|Mathematics')
    expect(attKey('EX1', 'S1', 'Mathematics')).toBe('EX1|S1|Mathematics')
  })

  it('marksProgress = distinct subjects with marks / paper count', () => {
    const marks = {
      'EX1|S1|English': 80,
      'EX1|S2|English': 70,
      'EX1|S1|Mathematics': 60,
      'EX2|S1|Science': 90, // different exam — ignored
    }
    expect(marksProgress(marks, 'EX1', 6)).toBe(Math.round((100 * 2) / 6))
    expect(marksProgress(marks, 'EX1', 2)).toBe(100)
    expect(marksProgress({}, 'EX1', 6)).toBe(0)
  })
})

describe('reportFor getMark override', () => {
  const stu = students[0]

  it('uses entered marks when provided, else falls back to the seed', () => {
    const all100 = () => 100
    const r = reportFor(stu, undefined, () => all100())
    expect(r.pct).toBe(100)
    expect(r.rows.every((row) => row.marks === 100)).toBe(true)

    const seeded = reportFor(stu)
    const partial = reportFor(stu, undefined, (_sid, subject) =>
      subject === 'English' ? 100 : undefined,
    )
    // English overridden to 100; other subjects keep their seeded marks
    expect(partial.rows.find((r) => r.subject === 'English')!.marks).toBe(100)
    const sci = partial.rows.find((r) => r.subject === 'Science')!.marks
    expect(sci).toBe(seeded.rows.find((r) => r.subject === 'Science')!.marks)
  })

  it('liveOnly omits subjects without saved marks (no dummy seed)', () => {
    const r = reportFor(
      stu,
      'EX1',
      (_sid, subject) => (subject === 'English' ? 80 : undefined),
      ['English', 'Mathematics', 'Science'],
      { liveOnly: true },
    )
    expect(r.rows.map((row) => row.subject)).toEqual(['English'])
    expect(r.rows[0].marks).toBe(80)
    expect(r.pct).toBe(80)
  })

  it('liveOnly with no marks returns an empty report', () => {
    const r = reportFor(stu, 'EX1', () => undefined, ['English'], { liveOnly: true })
    expect(r.rows).toEqual([])
    expect(r.pct).toBe(0)
    expect(r.total).toBe(0)
  })

  it('classRank applies the override across peers', () => {
    // override keyed by studentId: give exactly one peer a perfect score
    const target = students.find((s) => students.filter((p) => p.cls === s.cls).length > 1)!
    const getMark = (sid: string) => (sid === target.id ? 100 : 0)
    const { rank } = classRank(target, undefined, getMark)
    expect(rank).toBe(1)
  })
})

describe('endTime', () => {
  it('adds duration to a HH:MM start', () => {
    expect(endTime('09:30', 180)).toBe('12:30')
    expect(endTime('08:00', 45)).toBe('08:45')
  })
  it('clamps within the same day', () => {
    expect(endTime('23:00', 180)).toBe('23:59')
  })
  it('returns the input unchanged for a blank/invalid start', () => {
    expect(endTime('', 60)).toBe('')
    expect(endTime('nope', 60)).toBe('nope')
  })
})

describe('findClashes', () => {
  const base: PaperSlot = { id: 'p0', subject: 'English', date: '2026-09-08', start: '09:30', duration: 180, room: 'Hall 1', inv1: '', inv2: '' }
  const mk = (over: Partial<PaperSlot>): PaperSlot => ({ ...base, ...over })

  it('flags an invigilator in two overlapping slots on the same date', () => {
    const slots = [
      mk({ id: 'p0', subject: 'English', inv1: 'R. Kumar' }),
      mk({ id: 'p1', subject: 'Hindi', start: '11:00', inv1: 'R. Kumar' }),
    ]
    expect(findClashes(slots).some((m) => m.includes('R. Kumar'))).toBe(true)
  })

  it('does not flag invigilator when times do not overlap', () => {
    const slots = [
      mk({ id: 'p0', subject: 'English', start: '09:00', duration: 60, inv1: 'R. Kumar' }),
      mk({ id: 'p1', subject: 'Hindi', start: '10:30', duration: 60, inv1: 'R. Kumar' }),
    ]
    expect(findClashes(slots).some((m) => m.includes('R. Kumar'))).toBe(false)
  })

  it('does not flag invigilator across different dates', () => {
    const slots = [
      mk({ id: 'p0', subject: 'English', date: '2026-09-08', inv1: 'R. Kumar' }),
      mk({ id: 'p1', subject: 'Hindi', date: '2026-09-09', inv1: 'R. Kumar' }),
    ]
    expect(findClashes(slots).some((m) => m.includes('R. Kumar'))).toBe(false)
  })

  it('flags a double-booked room for overlapping slots', () => {
    const slots = [
      mk({ id: 'p0', subject: 'English', room: 'Hall 1' }),
      mk({ id: 'p1', subject: 'Hindi', start: '10:00', room: 'Hall 1' }),
    ]
    expect(findClashes(slots).some((m) => m.startsWith('Room Hall 1'))).toBe(true)
  })

  it('flags a subject allocated to two papers', () => {
    const slots = [
      mk({ id: 'p0', subject: 'English', date: '2026-09-08' }),
      mk({ id: 'p1', subject: 'English', date: '2026-09-12' }),
    ]
    expect(findClashes(slots).some((m) => m.startsWith('Subject English'))).toBe(true)
  })

  it('allows the same subject for different classes', () => {
    const slots = [
      mk({ id: 'p0', classId: 'c1', className: 'VI-A', subject: 'English', date: '2026-09-08' }),
      mk({ id: 'p1', classId: 'c2', className: 'VII-A', subject: 'English', date: '2026-09-12' }),
    ]
    expect(findClashes(slots).some((m) => m.startsWith('Subject English'))).toBe(false)
  })

  it('returns [] for a clean datesheet', () => {
    const slots = [
      mk({ id: 'p0', subject: 'English', inv1: 'R. Kumar', room: 'Hall 1' }),
      mk({ id: 'p1', subject: 'Hindi', date: '2026-09-10', inv1: 'S. Rao', room: 'Hall 2' }),
    ]
    expect(findClashes(slots)).toEqual([])
  })

  it('stays fast for large datesheets (many classes × subjects)', () => {
    const slots: PaperSlot[] = []
    for (let c = 0; c < 40; c++) {
      for (let s = 0; s < 8; s++) {
        slots.push(mk({
          id: `c${c}-s${s}`,
          classId: `c${c}`,
          className: `G${c}`,
          subject: `Sub${s}`,
          date: `2026-09-${String((s % 28) + 1).padStart(2, '0')}`,
          start: s % 2 === 0 ? '09:30' : '13:30',
          room: `H${c}`,
          inv1: `T${c}`,
        }))
      }
    }
    const t0 = performance.now()
    const clashes = findClashes(slots)
    const ms = performance.now() - t0
    expect(slots).toHaveLength(320)
    expect(clashes).toEqual([])
    expect(ms).toBeLessThan(50)
  })
})
