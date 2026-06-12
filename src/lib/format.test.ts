import { describe, it, expect } from 'vitest'
import { fmtMoney, fmtNum, gradeFor, gpaFor, reportFor, classRank, overallToppers, classToppers } from './format'
import { students } from '@/data/mockDb'
import type { Student } from '@/types'

describe('format', () => {
  it('formats money in en-IN with currency', () => {
    expect(fmtMoney(150000)).toBe('₹ 1,50,000')
    expect(fmtMoney(1000, 'AED')).toBe('AED 1,000')
  })
  it('formats numbers in en-IN', () => {
    expect(fmtNum(2500000)).toBe('25,00,000')
  })
  it('grades by percentage band', () => {
    expect(gradeFor(95)).toBe('A1')
    expect(gradeFor(85)).toBe('A2')
    expect(gradeFor(35)).toBe('D')
    expect(gradeFor(10)).toBe('E')
  })
  it('maps grade to gpa', () => {
    expect(gpaFor('A1')).toBe(10)
    expect(gpaFor('E')).toBe(3)
  })
  it('builds a deterministic report with PASS/COMPARTMENT', () => {
    const r = reportFor(students[0])
    expect(r.rows.length).toBeGreaterThan(0)
    expect(['PASS', 'COMPARTMENT']).toContain(r.result)
    expect(r.pct).toBe(reportFor(students[0]).pct)
  })
  it('ranks a student within its class (1-based, within class size)', () => {
    const { rank, classSize } = classRank(students[0])
    expect(rank).toBeGreaterThanOrEqual(1)
    expect(rank).toBeLessThanOrEqual(classSize)
  })
})

/* Minimal student factory — only the fields the topper helpers read. */
function mk(id: string, cls: string, attendance: number): Student {
  return {
    id, adm: 'ADM' + id, name: 'S' + id, gender: 'M', grade: cls, section: 'A',
    cls, roll: 1, guardian: 'G', phone: '0', attendance, feeStatus: 'paid',
    feeDue: 0, status: 'active', house: 'Red', avatarHue: 0,
  }
}

describe('topper ranking', () => {
  it('overallToppers sorts by attendance desc and respects the limit', () => {
    const list = [mk('a', 'X', 70), mk('b', 'X', 95), mk('c', 'X', 80)]
    const top = overallToppers(list, 'attendance', 2)
    expect(top.map((t) => t.student.id)).toEqual(['b', 'c'])
    expect(top[0].score).toBe(95)
  })

  it('overallToppers breaks attendance ties by id for determinism', () => {
    const list = [mk('b', 'X', 88), mk('a', 'X', 88)]
    const top = overallToppers(list, 'attendance', 2)
    expect(top.map((t) => t.student.id)).toEqual(['a', 'b'])
  })

  it('overallToppers ranks exam metric deterministically', () => {
    const top = overallToppers(students, 'exam', 5)
    expect(top).toHaveLength(5)
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].score).toBeGreaterThanOrEqual(top[i].score)
    }
    // secondary carries the attendance value for the exam metric
    expect(top[0].secondary).toBe(top[0].student.attendance)
  })

  it('classToppers groups by class and limits per class', () => {
    const list = [
      mk('a', 'X', 90), mk('b', 'X', 80), mk('c', 'X', 70), mk('d', 'X', 60),
      mk('e', 'Y', 95),
    ]
    const groups = classToppers(list, 'attendance', 3)
    const x = groups.find((g) => g.cls === 'X')!
    const y = groups.find((g) => g.cls === 'Y')!
    expect(x.toppers.map((t) => t.student.id)).toEqual(['a', 'b', 'c'])
    expect(y.toppers).toHaveLength(1)
  })

  it('classToppers orders classes naturally', () => {
    const list = [mk('a', 'X-2', 90), mk('b', 'X-10', 90), mk('c', 'X-1', 90)]
    const groups = classToppers(list, 'attendance', 1)
    expect(groups.map((g) => g.cls)).toEqual(['X-1', 'X-2', 'X-10'])
  })
})
