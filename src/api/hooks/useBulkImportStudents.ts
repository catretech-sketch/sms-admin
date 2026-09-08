import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { bulkImportBatch, type BulkImportRowResult } from '../bulkImportStudents'
import { ApiError } from '../ApiError'
import { invalidateStudentQueries } from './useStudentMutations'
import type { BulkImportRowPayload } from '@/lib/studentMapping'
import { newIdempotencyKey } from '@/lib/idempotencyKey'

export const BATCH_SIZE = 200
const MAX_RETRIES_PER_BATCH = 3

/** A batch rejected for authorization can NEVER succeed by trying again — bulk import's
 *  backend policy is stricter than single Add's, so a role that can add one student may
 *  still be refused here. Retrying it 3× and then offering a Retry Import button is
 *  actively misleading, so these statuses short-circuit the retry loop. */
function permissionMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null
  if (err.status === 403) {
    return 'You do not have permission to bulk import students. Ask a school admin or the principal to run this import.'
  }
  if (err.status === 401) {
    return 'Your session has expired. Sign in again and restart the import.'
  }
  return null
}

export interface BulkImportProgress {
  total: number
  processed: number
  created: number
  skipped: number
  transportPending: number
  /** Rows the server created but whose transport mapping FAILED outright (distinct from
   *  "pending", which means created-and-awaiting-a-bus). The student exists; the transport
   *  assignment does not, and the row carries a real explanatory `error`. */
  transportFailed: number
  rowResults: BulkImportRowResult[]
}

const INITIAL_PROGRESS: BulkImportProgress = {
  total: 0, processed: 0, created: 0, skipped: 0, transportPending: 0, transportFailed: 0, rowResults: [],
}

/** The one place the "this created row's transport did not get mapped" rule lives. */
export function isTransportFailedRow(r: BulkImportRowResult): boolean {
  return r.status !== 'skipped' && (r.transportStatus ?? '').toLowerCase() === 'failed'
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function useBulkImportStudents() {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<BulkImportProgress>(INITIAL_PROGRESS)
  const [pausedAtBatch, setPausedAtBatch] = useState<number | null>(null)
  // Surfaced to the UI alongside "Import paused at batch N/M" so the admin sees WHY it
  // paused (e.g. a real network/server message) instead of only the generic pause banner —
  // the try/catch below previously swallowed the actual error object.
  const [lastError, setLastError] = useState<string | null>(null)
  // True when the pause was caused by an authorization failure rather than a transient
  // one. The UI must NOT offer Retry Import in that state — see permissionMessage above.
  const [permissionDenied, setPermissionDenied] = useState(false)
  // Explicit "the import loop is actively iterating batches" signal — set true the moment
  // runFrom starts (from either runImport or retry) and false only once runFrom's loop
  // function returns (whether it ran out of batches to process, or paused on a failure).
  // Deliberately NOT derived from `processed < total`: a server response that reports
  // `processed` less than the rows actually sent in a batch (partial acceptance, a
  // dropped row, an off-by-one) would otherwise leave that comparison stuck true forever
  // even though no request is outstanding, permanently locking the UI with no way to
  // detect completion.
  const [isRunning, setIsRunning] = useState(false)
  const importIdRef = useRef<string>('')
  const batchesRef = useRef<BulkImportRowPayload[][]>([])

  const runFrom = useCallback(async (startBatchIndex: number) => {
    setIsRunning(true)
    // Counted locally (not read back from the async `progress` state) so the
    // invalidate-on-finish decision below sees this run's real outcome.
    let createdThisRun = 0
    try {
      const batches = batchesRef.current
      for (let i = startBatchIndex; i < batches.length; i++) {
        let attempt = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const result = await bulkImportBatch(importIdRef.current, i, batches[i])
            createdThisRun += result.created
            setProgress((prev) => ({
              total: prev.total,
              processed: prev.processed + result.processed,
              created: prev.created + result.created,
              skipped: prev.skipped + result.skipped,
              transportPending: prev.transportPending + result.transportPending,
              transportFailed: prev.transportFailed + result.rows.filter(isTransportFailedRow).length,
              rowResults: [...prev.rowResults, ...result.rows],
            }))
            setPausedAtBatch(null)
            setLastError(null)
            setPermissionDenied(false)
            break
          } catch (err) {
            const denied = permissionMessage(err)
            if (denied) {
              // Not retryable, at all: stop immediately with a clear message and no
              // Retry affordance, instead of 3 pointless round-trips and a raw 403 string.
              setPermissionDenied(true)
              setLastError(denied)
              setPausedAtBatch(i)
              return
            }
            attempt += 1
            setLastError(err instanceof Error ? err.message : String(err))
            if (attempt >= MAX_RETRIES_PER_BATCH) {
              setPausedAtBatch(i)
              return
            }
          }
        }
      }
    } finally {
      setIsRunning(false)
      // Students really were created — every roster/headcount consumer is now stale,
      // exactly as after a single-student create. Includes this drawer's own roster query,
      // so an immediate "Import Another File" run does duplicate detection against a
      // post-import roster rather than the pre-import snapshot.
      if (createdThisRun > 0) void invalidateStudentQueries(qc)
    }
  }, [qc])

  const runImport = useCallback(async (rows: BulkImportRowPayload[]) => {
    importIdRef.current = newIdempotencyKey()
    batchesRef.current = chunk(rows, BATCH_SIZE)
    setProgress({ ...INITIAL_PROGRESS, total: rows.length })
    setPausedAtBatch(null)
    setLastError(null)
    setPermissionDenied(false)
    await runFrom(0)
  }, [runFrom])

  const retry = useCallback(async () => {
    if (pausedAtBatch == null || isRunning || permissionDenied) return
    await runFrom(pausedAtBatch)
  }, [pausedAtBatch, isRunning, permissionDenied, runFrom])

  const resetImport = useCallback(() => {
    setProgress(INITIAL_PROGRESS)
    setPausedAtBatch(null)
    setLastError(null)
    setPermissionDenied(false)
    setIsRunning(false)
    importIdRef.current = ''
    batchesRef.current = []
  }, [])

  /** Whether offering a Retry Import control makes any sense right now. */
  const canRetry = pausedAtBatch != null && !permissionDenied

  return { runImport, retry, resetImport, progress, pausedAtBatch, lastError, isRunning, permissionDenied, canRetry }
}
