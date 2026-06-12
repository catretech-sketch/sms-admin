import { describe, it, expect } from 'vitest'
import { markKey, attKey, marksProgress } from './examData'
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
    const partial = reportFor(stu, undefined, (sid, subject) =>
      subject === 'English' ? 100 : undefined,
    )
    // English overridden to 100; other subjects keep their seeded marks
    expect(partial.rows.find((r) => r.subject === 'English')!.marks).toBe(100)
    const sci = partial.rows.find((r) => r.subject === 'Science')!.marks
    expect(sci).toBe(seeded.rows.find((r) => r.subject === 'Science')!.marks)
  })

  it('classRank applies the override across peers', () => {
    // override keyed by studentId: give exactly one peer a perfect score
    const target = students.find((s) => students.filter((p) => p.cls === s.cls).length > 1)!
    const getMark = (sid: string) => (sid === target.id ? 100 : 0)
    const { rank } = classRank(target, undefined, getMark)
    expect(rank).toBe(1)
  })
})
