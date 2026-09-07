import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bulkImportBatch } from './bulkImportStudents'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('bulkImportBatch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('POSTs to /v1/students/bulk-import/batch with snake_case body and returns camelCase result', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({
      data: {
        import_id: 'import-1', batch_index: 0, processed: 1, created: 1, skipped: 0, transport_pending: 0,
        rows: [{ row_number: 1, student_id: 'stu-1', status: 'created', error: null, transport_status: 'not_applicable' }],
      },
    }))

    const result = await bulkImportBatch('import-1', 0, [
      { createStudentRequest: { name: 'Aarav Sharma' }, extrasJson: '{}', transport: null },
    ])

    expect(result.created).toBe(1)
    expect(result.rows[0].studentId).toBe('stu-1')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(call[0])).toContain('/students/bulk-import/batch')
    const body = JSON.parse(call[1].body)
    expect(body.import_id).toBe('import-1')
    expect(body.batch_index).toBe(0)
    expect(body.rows[0].create_student_request.name).toBe('Aarav Sharma')
  })
})
