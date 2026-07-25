import { describe, it, expect, beforeEach } from 'vitest'
import { loadExamClassIds, saveExamClassIds, clearExamClassIds } from './examClasses'

beforeEach(() => { localStorage.clear() })

describe('examClasses storage', () => {
  it('saves and loads class ids for an exam', () => {
    saveExamClassIds('EX1', ['c1', 'c2', 'c1'])
    expect(loadExamClassIds('EX1')).toEqual(['c1', 'c2'])
  })

  it('returns empty when missing', () => {
    expect(loadExamClassIds('missing')).toEqual([])
  })

  it('clears stored ids', () => {
    saveExamClassIds('EX1', ['c1'])
    clearExamClassIds('EX1')
    expect(loadExamClassIds('EX1')).toEqual([])
  })
})
