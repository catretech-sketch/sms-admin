import { request } from './client'
import { camelToSnake, snakeToCamel } from './mapper'
import type { BulkImportRowPayload } from '@/lib/studentMapping'

export interface BulkImportRowResult {
  rowNumber: number
  studentId: string | null
  status: 'created' | 'skipped'
  error?: string | null
  transportStatus?: string | null
}

export interface BulkImportBatchResult {
  importId: string
  batchIndex: number
  processed: number
  created: number
  skipped: number
  transportPending: number
  rows: BulkImportRowResult[]
}

export async function bulkImportBatch(
  importId: string, batchIndex: number, rows: BulkImportRowPayload[],
): Promise<BulkImportBatchResult> {
  const body = camelToSnake({
    importId,
    batchIndex,
    rows: rows.map((r) => ({
      rowNumber: r.rowNumber,
      createStudentRequest: r.createStudentRequest,
      extrasJson: r.extrasJson,
      transport: r.transport,
    })),
  })
  const wire = await request<Record<string, unknown>>('/students/bulk-import/batch', { method: 'POST', body })
  return snakeToCamel<BulkImportBatchResult>(wire)
}
