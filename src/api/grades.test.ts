import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listGradesForStudent, toGrade } from './grades'

vi.mock('./client', () => ({
  request: vi.fn(),
  listRequest: vi.fn(),
}))

import { request } from './client'

describe('listGradesForStudent', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset()
  })

  it('GETs /grades?student_id= once (no per-paper fan-out)', async () => {
    vi.mocked(request).mockResolvedValue([
      {
        id: 'g1',
        student_id: 's1',
        student_name: 'Ankit',
        exam_paper_id: 'p1',
        marks: 88,
        max_marks: 100,
        grade: 'A',
        gpa: 8,
        pass: true,
        date: '2026-03-01',
        subject: 'Math',
      },
    ])

    const rows = await listGradesForStudent('s1')

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/grades', { query: { student_id: 's1' } })
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'g1',
        studentId: 's1',
        examPaperId: 'p1',
        marks: 88,
        subject: 'Math',
      }),
    ])
  })
})

describe('toGrade', () => {
  it('maps optional subject from student grades payload', () => {
    expect(toGrade({ id: '1', student_id: 's', exam_paper_id: 'p', marks: 10, subject: 'English' }).subject)
      .toBe('English')
  })
})
