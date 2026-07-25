import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeePayments, payInvoice, createFeeRazorpayOrder, verifyFeeRazorpayPayment } from './feePayments'
import { generateFeeInvoices, listFeeInvoices } from './feeInvoices'
import { ApiError } from './ApiError'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)
}
const wirePayment = { id: 1, student_id: 's1', student_name: 'Asha', cls: 'X-A', fee_type: 'academic', amount: 4800, mode: 'UPI', ref: 'TXN1', date: '2026-06-01' }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

function seedAndMockLocalFees(): void {
  localStorage.setItem('sms_fee_heads:default', JSON.stringify([{ id: 'h1', name: 'Academic', active: true }]))
  localStorage.setItem('sms_fee_structure:default', JSON.stringify({
    name: 'Fees', academicYear: '2025-26', classGrade: '', section: '', currency: 'INR',
    effectiveFrom: '2025-04-01', status: 'active', description: '',
    amounts: { 'X-A': { h1: 10000 } },
  }))
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const u = String(url)
    if (u.includes('/students')) {
      return Promise.resolve(jsonResponse({
        data: [{
          id: 's1', name: 'Asha', admission_no: 'ADM1',
          class_label: 'X-A', grade: 'X', section: 'A', gender: 'F',
          status: 'active', fee_status: 'due', fee_due: 0, attendance_pct: 0,
        }],
        next_cursor: null,
      }))
    }
    return Promise.resolve(notFound())
  }))
}

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

describe('createFeeRazorpayOrder', () => {
  it('POSTs /fees/invoices/{id}/razorpay/order and maps the snake_case order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { order_id: 'order_x', amount: 4800, currency: 'INR', key_id: 'rzp_test_school1' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const order = await createFeeRazorpayOrder('INV-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/fees/invoices/INV-1/razorpay/order')
    expect((init as RequestInit).method).toBe('POST')
    expect(order).toMatchObject({ orderId: 'order_x', amount: 4800, currency: 'INR', keyId: 'rzp_test_school1' })
  })

  it('maps an optional pay_link through to payLink', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: { order_id: 'order_y', amount: 1200, currency: 'INR', key_id: 'rzp_test_school1', pay_link: 'https://rzp.io/l/abc' },
    })))
    const order = await createFeeRazorpayOrder('INV-2')
    expect(order.payLink).toBe('https://rzp.io/l/abc')
  })
})

describe('verifyFeeRazorpayPayment', () => {
  it('POSTs /fees/invoices/{id}/razorpay/verify with a snake_case body and returns the mapped payment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: wirePayment }))
    vi.stubGlobal('fetch', fetchMock)
    const payment = await verifyFeeRazorpayPayment('INV-1', {
      razorpayOrderId: 'order_x',
      razorpayPaymentId: 'pay_x',
      razorpaySignature: 'sig',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/fees/invoices/INV-1/razorpay/verify')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 'sig' })
    expect(payment).toMatchObject({ id: 1, studentId: 's1', studentName: 'Asha' })
  })
})

describe('payInvoice local fallback', () => {
  it('records payment against local invoice when pay API is 404', async () => {
    seedAndMockLocalFees()
    await generateFeeInvoices({ classes: ['X-A'], academicYear: '2025-26', term: 'Term 1' })
    const [inv] = await listFeeInvoices()
    expect(inv.due).toBe(10000)

    const payment = await payInvoice(inv.id, {
      id: 0,
      invoiceId: inv.id,
      studentId: inv.studentId,
      studentName: inv.studentName,
      cls: inv.cls,
      headId: 'h1',
      amount: 4000,
      mode: 'UPI',
      ref: 'TXN-LOCAL',
      date: '2026-07-17',
    })
    expect(payment.amount).toBe(4000)
    expect(payment.id).toBeTruthy()

    const updated = (await listFeeInvoices()).find((r) => r.id === inv.id)
    expect(updated).toMatchObject({ paid: 4000, due: 6000, status: 'partial' })

    const history = await listFeePayments()
    expect(history.some((p) => p.ref === 'TXN-LOCAL' && p.amount === 4000)).toBe(true)
  })

  it('still throws non-404 pay errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'forbidden', message: 'no' } }, 403),
    ))
    await expect(payInvoice('INV-1', {
      id: 0, studentId: 's1', studentName: 'Asha', cls: 'X-A',
      amount: 100, mode: 'Cash', ref: 'x', date: '2026-07-17',
    })).rejects.toBeInstanceOf(ApiError)
  })
})
