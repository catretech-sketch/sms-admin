import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadExamClassIds, saveExamClassIds, clearExamClassIds } from './examClasses'

describe('examClasses', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('PATCHes class_ids via exam update (no localStorage SoT)', async () => {
    localStorage.setItem('sms_exam_classes:default:EX1', JSON.stringify(['old']))
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          id: 'EX1',
          name: 'Mid',
          type: 'term',
          grades: 'X',
          class_ids: ['c1', 'c2'],
          from_date: '2026-01-01',
          to_date: '2026-01-10',
          subject_count: 1,
          status: 'draft',
          marks_entered_pct: 0,
          published: false,
        },
      }),
      json: async () => ({}),
    } as Response)

    const saved = await saveExamClassIds('EX1', ['c1', 'c2', 'c1'])
    expect(saved).toEqual(['c1', 'c2'])
    expect(String(fetchMock.mock.calls[0][0])).toContain('/exams/EX1')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH')
  })

  it('loadExamClassIds never reads browser storage', () => {
    localStorage.setItem('sms_exam_classes:default:EX1', JSON.stringify(['c9']))
    expect(loadExamClassIds('EX1')).toEqual([])
    expect(loadExamClassIds('missing')).toEqual([])
  })

  it('clearExamClassIds is a no-op for storage', () => {
    localStorage.setItem('sms_exam_classes:default:EX1', JSON.stringify(['c1']))
    clearExamClassIds('EX1')
    expect(localStorage.getItem('sms_exam_classes:default:EX1')).toEqual(JSON.stringify(['c1']))
    expect(loadExamClassIds('EX1')).toEqual([])
  })
})
