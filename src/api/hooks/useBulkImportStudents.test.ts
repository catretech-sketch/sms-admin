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

  it('reports isRunning true only while a batch loop is actively iterating, and false once it finishes short of total', async () => {
    // Regression test: isRunning must NOT be inferred from `processed < total`. A batch
    // response that under-reports `processed` for the rows actually sent (partial
    // acceptance, a dropped row, an off-by-one) must still leave isRunning false once the
    // loop function returns, so callers relying on it (like the Import drawer) never get
    // stuck thinking a request is outstanding when none is.
    vi.spyOn(api, 'bulkImportBatch').mockResolvedValue({
      importId: 'import-1', batchIndex: 0, processed: 1, created: 1, skipped: 0,
      transportPending: 0, rows: [{ rowNumber: 1, studentId: 'stu-1', status: 'created' }],
    })

    const { result } = renderHook(() => useBulkImportStudents())
    expect(result.current.isRunning).toBe(false)

    await act(async () => { await result.current.runImport([row(1), row(2), row(3)]) })

    expect(result.current.isRunning).toBe(false)
    expect(result.current.progress.processed).toBe(1) // never reaches total (3)
    expect(result.current.pausedAtBatch).toBeNull() // and never paused either
  })

  it('retry() is a no-op while isRunning is already true (defense-in-depth against a double-submit)', async () => {
    let resolveBatch: ((v: {
      importId: string; batchIndex: number; processed: number; created: number; skipped: number
      transportPending: number; rows: BulkImportRowResult[]
    }) => void) | null = null
    const spy = vi.spyOn(api, 'bulkImportBatch').mockImplementation(
      () => new Promise((resolve) => { resolveBatch = resolve }),
    )

    const { result } = renderHook(() => useBulkImportStudents())

    // Start an import without awaiting completion — its batch call is left pending.
    let runPromise: Promise<void> | null = null
    act(() => { runPromise = result.current.runImport([row(1)]) })
    expect(result.current.isRunning).toBe(true)

    // Calling retry() while a loop is already running must be a no-op: no extra
    // bulkImportBatch call, since pausedAtBatch is also still null at this point anyway,
    // and isRunning guards it regardless.
    const callsBefore = spy.mock.calls.length
    await act(async () => { await result.current.retry() })
    expect(spy.mock.calls.length).toBe(callsBefore)

    resolveBatch!({
      importId: 'import-1', batchIndex: 0, processed: 1, created: 1, skipped: 0,
      transportPending: 0, rows: [{ rowNumber: 1, studentId: 'stu-1', status: 'created' }],
    })
    await act(async () => { await runPromise })
    expect(result.current.isRunning).toBe(false)
  })

  it('resetImport() clears progress/pausedAtBatch/lastError/isRunning back to initial state', async () => {
    vi.spyOn(api, 'bulkImportBatch').mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useBulkImportStudents())
    await act(async () => { await result.current.runImport([row(1)]) })
    expect(result.current.pausedAtBatch).toBe(0)
    expect(result.current.lastError).toBe('network error')

    act(() => { result.current.resetImport() })

    expect(result.current.progress).toEqual({ total: 0, processed: 0, created: 0, skipped: 0, transportPending: 0, rowResults: [] })
    expect(result.current.pausedAtBatch).toBeNull()
    expect(result.current.lastError).toBeNull()
    expect(result.current.isRunning).toBe(false)
  })

  it('uses newIdempotencyKey() (not a bare crypto.randomUUID() call) so an insecure context does not throw', async () => {
    // crypto.randomUUID() throws in an insecure context (plain-HTTP LAN origin). Simulate
    // that here to prove runImport survives it via the getRandomValues fallback in
    // newIdempotencyKey(), instead of letting the throw become an unhandled rejection.
    const originalRandomUUID = crypto.randomUUID
    // @ts-expect-error -- deliberately removing the method to simulate an insecure context
    delete crypto.randomUUID
    vi.spyOn(api, 'bulkImportBatch').mockResolvedValue({
      importId: 'import-1', batchIndex: 0, processed: 1, created: 1, skipped: 0,
      transportPending: 0, rows: [{ rowNumber: 1, studentId: 'stu-1', status: 'created' }],
    })

    try {
      const { result } = renderHook(() => useBulkImportStudents())
      await act(async () => { await result.current.runImport([row(1)]) })
      expect(result.current.progress.processed).toBe(1)
      expect(result.current.pausedAtBatch).toBeNull()
    } finally {
      crypto.randomUUID = originalRandomUUID
    }
  })
})
