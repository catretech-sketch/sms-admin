import { useCallback, useRef, useState } from 'react'
import { bulkImportBatch, type BulkImportRowResult } from '../bulkImportStudents'
import type { BulkImportRowPayload } from '@/lib/studentMapping'

export const BATCH_SIZE = 200
const MAX_RETRIES_PER_BATCH = 3

export interface BulkImportProgress {
  total: number
  processed: number
  created: number
  skipped: number
  transportPending: number
  rowResults: BulkImportRowResult[]
}

const INITIAL_PROGRESS: BulkImportProgress = {
  total: 0, processed: 0, created: 0, skipped: 0, transportPending: 0, rowResults: [],
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function useBulkImportStudents() {
  const [progress, setProgress] = useState<BulkImportProgress>(INITIAL_PROGRESS)
  const [pausedAtBatch, setPausedAtBatch] = useState<number | null>(null)
  // Surfaced to the UI alongside "Import paused at batch N/M" so the admin sees WHY it
  // paused (e.g. a real network/server message) instead of only the generic pause banner —
  // the try/catch below previously swallowed the actual error object.
  const [lastError, setLastError] = useState<string | null>(null)
  const importIdRef = useRef<string>('')
  const batchesRef = useRef<BulkImportRowPayload[][]>([])

  const runFrom = useCallback(async (startBatchIndex: number) => {
    const batches = batchesRef.current
    for (let i = startBatchIndex; i < batches.length; i++) {
      let attempt = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const result = await bulkImportBatch(importIdRef.current, i, batches[i])
          setProgress((prev) => ({
            total: prev.total,
            processed: prev.processed + result.processed,
            created: prev.created + result.created,
            skipped: prev.skipped + result.skipped,
            transportPending: prev.transportPending + result.transportPending,
            rowResults: [...prev.rowResults, ...result.rows],
          }))
          setPausedAtBatch(null)
          setLastError(null)
          break
        } catch (err) {
          attempt += 1
          setLastError(err instanceof Error ? err.message : String(err))
          if (attempt >= MAX_RETRIES_PER_BATCH) {
            setPausedAtBatch(i)
            return
          }
        }
      }
    }
  }, [])

  const runImport = useCallback(async (rows: BulkImportRowPayload[]) => {
    importIdRef.current = crypto.randomUUID()
    batchesRef.current = chunk(rows, BATCH_SIZE)
    setProgress({ ...INITIAL_PROGRESS, total: rows.length })
    setPausedAtBatch(null)
    setLastError(null)
    await runFrom(0)
  }, [runFrom])

  const retry = useCallback(async () => {
    if (pausedAtBatch == null) return
    await runFrom(pausedAtBatch)
  }, [pausedAtBatch, runFrom])

  return { runImport, retry, progress, pausedAtBatch, lastError }
}
