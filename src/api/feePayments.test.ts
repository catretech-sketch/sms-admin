import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeePayments, payInvoice } from './feePayments'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const wirePayment = { id: 1, student_id: 's1', student_name: 'Asha', cls: 'X-A', fee_type: 'academic', amount: 4800, mode: 'UPI', ref: 'TXN1', date: '2026-06-01' }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listFeePayments', () => {
  it('maps student_id/student_name/fee_type generically', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wirePayment], next_cursor: null })))
    const rows = await listFeePayments()
    expect(rows[0]).toMatchObject({ id: 1, studentId: 's1', studentName: 'Asha', feeType: 'academic', amount: 4800 })
  })
})

describe('payInvoice', () => {
  it('POSTs /fees/invoices/{id}/pay with a snake_case body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: wirePayment }))
    vi.stubGlobal('fetch', fetchMock)
    await payInvoice('INV-9', { id: 0, studentId: 's1', studentName: 'Asha', cls: 'X-A', feeType: 'academic', amount: 4800, mode: 'UPI', ref: 'TXN1', date: '2026-06-01' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/fees/invoices/INV-9/pay')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.student_id).toBe('s1')
    expect(body.fee_type).toBe('academic')
  })

  it('POSTs head_id, note, cheque, and invoice_id when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ...wirePayment, head_id: 'h1', note: 'Term 1' } }))
    vi.stubGlobal('fetch', fetchMock)
    await payInvoice('INV-9', {
      id: 0,
      invoiceId: 'INV-9',
      studentId: 's1',
      studentName: 'Asha',
      cls: 'X-A',
      headId: 'h1',
      amount: 4800,
      mode: 'Cheque',
      ref: 'CHQ-42',
      date: '2026-06-01',
      note: 'Term 1',
      cheque: { number: 'CHQ-42', bank: 'SBI', date: '2026-06-01' },
    })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.head_id).toBe('h1')
    expect(body.note).toBe('Term 1')
    expect(body.invoice_id).toBe('INV-9')
    expect(body.cheque).toMatchObject({ number: 'CHQ-42', bank: 'SBI', date: '2026-06-01' })
    expect(body.fee_type).toBeUndefined()
  })
})
