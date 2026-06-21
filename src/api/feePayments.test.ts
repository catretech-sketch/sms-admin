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
})
