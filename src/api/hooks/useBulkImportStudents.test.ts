import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBulkImportStudents } from './useBulkImportStudents'
import * as api from '../bulkImportStudents'
import type { BulkImportRowPayload } from '@/lib/studentMapping'

function row(n: number): BulkImportRowPayload {
  return { rowNumber: n, createStudentRequest: { name: `Student ${n}` }, extrasJson: '{}', transport: null }
}

describe('useBulkImportStudents', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends rows in sequential 200-row batches and accumulates real progress', async () => {
    const spy = vi.spyOn(api, 'bulkImportBatch').mockImplementation(async (_importId, batchIndex, rows) => ({
      importId: 'import-1', batchIndex, processed: rows.length, created: rows.length, skipped: 0,
      transportPending: 0, rows: rows.map((r) => ({ rowNumber: r.rowNumber!, studentId: `stu-${r.rowNumber}`, status: 'created' })),
    }))

    const { result } = renderHook(() => useBulkImportStudents())
    const rows = Array.from({ length: 450 }, (_, i) => row(i + 1)) // 3 batches: 200, 200, 50

    await act(async () => { await result.current.runImport(rows) })

    expect(spy).toHaveBeenCalledTimes(3)
    expect(spy.mock.calls[0][1]).toBe(0)
    expect(spy.mock.calls[0][2]).toHaveLength(200)
    expect(spy.mock.calls[2][2]).toHaveLength(50)
    await waitFor(() => expect(result.current.progress.processed).toBe(450))
    expect(result.current.progress.created).toBe(450)
  })

  it('pauses on repeated batch failure and resumes from the failed batch on retry', async () => {
    let callCount = 0
    const spy = vi.spyOn(api, 'bulkImportBatch').mockImplementation(async (_importId, batchIndex, rows) => {
      callCount += 1
      if (batchIndex === 1 && callCount <= 4) throw new Error('network error') // fail batch 1 repeatedly
      return {
        importId: 'import-1', batchIndex, processed: rows.length, created: rows.length, skipped: 0,
        transportPending: 0, rows: rows.map((r) => ({ rowNumber: r.rowNumber!, studentId: `stu-${r.rowNumber}`, status: 'created' })),
      }
    })

    const { result } = renderHook(() => useBulkImportStudents())
    const rows = Array.from({ length: 450 }, (_, i) => row(i + 1))

    await act(async () => { await result.current.runImport(rows) })
    expect(result.current.pausedAtBatch).toBe(1)

    await act(async () => { await result.current.retry() })
    expect(result.current.pausedAtBatch).toBeNull()
    expect(result.current.progress.processed).toBe(450)
    expect(spy).toHaveBeenCalled()
  })
})
