import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeeInvoices, generateFeeInvoices } from './feeInvoices'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

const wireInvoice = {
  id: 'inv1',
  student_id: 's1',
  student_name: 'Asha',
  cls: 'X-A',
  grade: 'X',
  academic_year: '2025-26',
  term: 'Term 1',
  lines: [{ head_id: 'h1', head_name: 'Academic', amount: 36000 }],
  total: 36000,
  paid: 0,
  waived: 0,
  due: 36000,
  status: 'due',
  due_date: '2026-07-01',
}

describe('listFeeInvoices', () => {
  it('maps snake_case invoices', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [wireInvoice],
      next_cursor: null,
    })))
    const rows = await listFeeInvoices()
    expect(rows[0]).toMatchObject({
      id: 'inv1',
      studentId: 's1',
      studentName: 'Asha',
      academicYear: '2025-26',
      dueDate: '2026-07-01',
      lines: [{ headId: 'h1', headName: 'Academic', amount: 36000 }],
    })
  })
})

describe('generateFeeInvoices', () => {
  it('POSTs grades/academic_year/term to /fees/invoices/generate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { created: 42 } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateFeeInvoices({
      grades: ['X', 'XI'],
      academicYear: '2025-26',
      term: 'Term 1',
      dueDate: '2026-07-01',
    })
    expect(result).toEqual({ created: 42 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/fees/invoices/generate')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      grades: ['X', 'XI'],
      academic_year: '2025-26',
      term: 'Term 1',
      due_date: '2026-07-01',
    })
  })
})
