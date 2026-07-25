import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({
  request: vi.fn(),
}))
vi.mock('./auth/tokenStore', () => ({
  tokenStore: { getTenantId: () => 't1' },
}))

import { ApiError } from './ApiError'
import { request } from './client'
import {
  listExamPaperAttendance,
  loadExamAttendanceLocal,
  saveExamAttendanceLocal,
  saveExamPaperAttendance,
} from './examAttendance'

const mockedRequest = vi.mocked(request)

describe('examAttendance', () => {
  beforeEach(() => {
    localStorage.clear()
    mockedRequest.mockReset()
  })

  it('mirrors saves to local storage by paper id', () => {
    saveExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01', {
      s1: 'present',
      s2: 'absent',
    })
    expect(loadExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01')).toEqual({
      s1: 'present',
      s2: 'absent',
    })
  })

  it('lists attendance from API when available', async () => {
    mockedRequest.mockResolvedValueOnce([
      { student_id: 's1', status: 'absent' },
      { student_id: 's2', status: 'present' },
    ])
    await expect(listExamPaperAttendance('p1')).resolves.toEqual({
      s1: 'absent',
      s2: 'present',
    })
    expect(mockedRequest).toHaveBeenCalledWith('/exam-papers/p1/attendance')
  })

  it('returns empty map when attendance API is missing', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(404, 'not_found', 'missing'))
    await expect(listExamPaperAttendance('p1')).resolves.toEqual({})
  })

  it('saves via API and always keeps a local copy', async () => {
    mockedRequest.mockResolvedValueOnce({})
    const mode = await saveExamPaperAttendance('p1', 'ex1', 'Math', '2026-07-01', {
      s1: 'absent',
    })
    expect(mode).toBe('api')
    expect(loadExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01')).toEqual({ s1: 'absent' })
    expect(mockedRequest).toHaveBeenCalledWith(
      '/exam-papers/p1/attendance',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('falls back to local when PUT attendance is not supported', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(404, 'not_found', 'nope'))
    const mode = await saveExamPaperAttendance('p1', 'ex1', 'Math', '2026-07-01', {
      s1: 'present',
    })
    expect(mode).toBe('local')
    expect(loadExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01')).toEqual({ s1: 'present' })
  })
})
