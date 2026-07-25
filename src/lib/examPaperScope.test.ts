import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countRealExamPapers,
  isDummyExamPaper,
  isOrphanExamPaper,
  isPaperInExamScope,
} from './examPaperScope'

vi.mock('@/api/classSubjects', () => ({
  getClassSubjects: (classId: string | null | undefined) => {
    if (classId === 'ia') return ['Hindi', 'Mathematics', 'Science']
    if (classId === 'via') return ['Hindi', 'English', 'Mathematics']
    return []
  },
}))

vi.mock('@/api/examClasses', () => ({
  loadExamClassIds: () => [] as string[],
}))

describe('isDummyExamPaper', () => {
  it('marks unmapped class papers as dummy', () => {
    expect(isDummyExamPaper({ classId: 'x', className: 'Nursery-A', subject: 'Hindi' })).toBe(true)
  })

  it('marks catalog subjects not on the class map as dummy', () => {
    expect(isDummyExamPaper({ classId: 'ia', className: 'I-A', subject: 'Biology' })).toBe(true)
  })

  it('keeps mapped subjects', () => {
    expect(isDummyExamPaper({ classId: 'ia', className: 'I-A', subject: 'Hindi' })).toBe(false)
  })
})

describe('exam scope', () => {
  const gradeMap = new Map([['ia', 'I'], ['via', 'VI'], ['ivb', 'IV']])

  it('rejects I-A paper on a VI–X exam', () => {
    expect(isPaperInExamScope(
      { classId: 'ia', className: 'I-A', subject: 'Hindi' },
      { grades: 'VI–X' },
      gradeMap,
    )).toBe(false)
  })

  it('keeps VI-A on VI–X', () => {
    expect(isPaperInExamScope(
      { classId: 'via', className: 'VI-A', subject: 'Hindi' },
      { grades: 'VI–X' },
      gradeMap,
    )).toBe(true)
  })

  it('uses explicit classIds when set', () => {
    expect(isPaperInExamScope(
      { classId: 'via', className: 'VI-A', subject: 'Hindi' },
      { grades: 'Nursery–XII', classIds: ['via'] },
      gradeMap,
    )).toBe(true)
    expect(isPaperInExamScope(
      { classId: 'ia', className: 'I-A', subject: 'Hindi' },
      { grades: 'Nursery–XII', classIds: ['via'] },
      gradeMap,
    )).toBe(false)
  })
})

describe('countRealExamPapers', () => {
  beforeEach(() => { /* mocks already set */ })

  const gradeMap = new Map([['ia', 'I'], ['via', 'VI'], ['ivb', 'IV']])

  it('ignores dummy and out-of-grade papers (the stale "14" case)', () => {
    const papers = [
      { classId: 'ia', className: 'I-A', subject: 'Hindi' },
      { classId: 'ia', className: 'I-A', subject: 'Biology' }, // dummy
      { classId: 'ivb', className: 'IV-B', subject: 'Mathematics' }, // out of VI–X
      { classId: 'via', className: 'VI-A', subject: 'Hindi' },
      { classId: 'via', className: 'VI-A', subject: 'English' },
    ]
    expect(countRealExamPapers(papers, { grades: 'VI–X' }, gradeMap)).toBe(2)
    expect(isOrphanExamPaper(papers[1], { grades: 'VI–X' }, gradeMap)).toBe(true)
    expect(isOrphanExamPaper(papers[2], { grades: 'VI–X' }, gradeMap)).toBe(true)
  })

  it('returns 0 when only catalog / wrong-grade papers exist', () => {
    const papers = Array.from({ length: 14 }, (_, i) => ({
      classId: 'ia',
      className: 'I-A',
      subject: i % 2 ? 'Biology' : 'Hindi',
    }))
    expect(countRealExamPapers(papers, { grades: 'VI–X' }, gradeMap)).toBe(0)
  })
})
