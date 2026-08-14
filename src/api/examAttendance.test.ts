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
  saveExamAttendance,
  clearExamAttendanceMemory,
} from './examAttendance'

const mockedRequest = vi.mocked(request)

describe('examAttendance', () => {
  beforeEach(() => {
    clearExamAttendanceMemory()
    localStorage.clear()
    mockedRequest.mockReset()
  })

  it('mirrors saves to in-memory cache by paper id (no localStorage)', () => {
    saveExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01', {
      s1: 'present',
      s2: 'absent',
    })
    expect(loadExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01')).toEqual({
      s1: 'present',
      s2: 'absent',
    })
    expect(localStorage.length).toBe(0)
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

  it('throws (fail-closed) when attendance API is missing', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(404, 'not_found', 'missing'))
    await expect(listExamPaperAttendance('p1')).rejects.toBeInstanceOf(ApiError)
  })

  it('returns empty map when API returns an empty array', async () => {
    mockedRequest.mockResolvedValueOnce([])
    await expect(listExamPaperAttendance('p1')).resolves.toEqual({})
  })

  it('saves via API and caches in memory only after success', async () => {
    mockedRequest.mockResolvedValueOnce({})
    await saveExamPaperAttendance('p1', 'ex1', 'Math', '2026-07-01', {
      s1: 'absent',
    })
    expect(loadExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01')).toEqual({ s1: 'absent' })
    expect(localStorage.length).toBe(0)
    expect(mockedRequest).toHaveBeenCalledWith(
      '/exam-papers/p1/attendance',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('throws and does not cache when PUT attendance is not supported', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(404, 'not_found', 'nope'))
    await expect(saveExamPaperAttendance('p1', 'ex1', 'Math', '2026-07-01', {
      s1: 'present',
    })).rejects.toBeInstanceOf(ApiError)
    expect(loadExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01')).toEqual({})
  })

  it('throws on 5xx without caching', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(503, 'unavailable', 'down'))
    await expect(saveExamPaperAttendance('p1', 'ex1', 'Math', '2026-07-01', {
      s1: 'present',
    })).rejects.toMatchObject({ status: 503 })
    expect(loadExamAttendanceLocal('ex1', 'p1', 'Math', '2026-07-01')).toEqual({})
  })

  it('saveExamAttendance throws — remote save required', () => {
    expect(() => saveExamAttendance('ex1', 'Math', '2026-07-01', { s1: 'present' }))
      .toThrow(/saveExamPaperAttendance/)
  })
})
