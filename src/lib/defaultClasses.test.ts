import { describe, it, expect } from 'vitest'
import { compareClassesAscending, gradeRank } from './defaultClasses'

describe('gradeRank', () => {
  it('orders Nursery → XII ascending toward 12', () => {
    expect(gradeRank('Nursery')).toBeLessThan(gradeRank('LKG'))
    expect(gradeRank('UKG')).toBeLessThan(gradeRank('I'))
    expect(gradeRank('IX')).toBeLessThan(gradeRank('X'))
    expect(gradeRank('XI')).toBeLessThan(gradeRank('XII'))
    expect(gradeRank('10')).toBe(10)
    expect(gradeRank('12')).toBe(12)
    expect(gradeRank('XII')).toBe(12)
  })
})

describe('compareClassesAscending', () => {
  it('sorts classes Nursery…XII then section', () => {
    const list = [
      { name: 'XII-A', grade: 'XII', section: 'A' },
      { name: 'IX-B', grade: 'IX', section: 'B' },
      { name: 'IX-A', grade: 'IX', section: 'A' },
      { name: 'Nursery-A', grade: 'Nursery', section: 'A' },
      { name: '10-A', grade: '10', section: 'A' },
    ]
    const sorted = [...list].sort(compareClassesAscending).map((c) => c.name)
    expect(sorted).toEqual(['Nursery-A', 'IX-A', 'IX-B', '10-A', 'XII-A'])
  })
})
