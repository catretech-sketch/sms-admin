import { describe, it, expect } from 'vitest'
import { fmtMoney, fmtNum, gradeFor, gpaFor, reportFor, classRank } from './format'
import { students } from '@/data/mockDb'

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
