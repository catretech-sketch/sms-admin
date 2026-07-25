import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getFeeReportSummary, localDateIso } from './feeReports'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireSummary = {
  collected_today: 12000,
  collected_term: 450000,
  outstanding: 89000,
  defaulters: 12,
  billed_term: 539000,
  pct: 83.5,
  by_class: [{ label: 'X-A', value: 48000, n: 32 }],
  by_mode: [{ label: 'UPI', value: 200000 }],
  latest_payment: {
    id: 9,
    student_id: 's1',
    student_name: 'Asha',
    cls: 'X-A',
    head_id: 'h1',
    amount: 4800,
    mode: 'UPI',
    ref: 'TXN1',
    date: '2026-06-01',
  },
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('getFeeReportSummary', () => {
  it('GETs /fees/reports/summary and maps to camelCase FeeReportSummary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: wireSummary }))
    vi.stubGlobal('fetch', fetchMock)
    const summary = await getFeeReportSummary()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/fees/reports/summary')
    expect((init as RequestInit).method ?? 'GET').toBe('GET')
    expect(summary).toMatchObject({
      collectedToday: 12000,
      collectedTerm: 450000,
      outstanding: 89000,
      defaulters: 12,
      billedTerm: 539000,
      pct: 83.5,
      byClass: [{ label: 'X-A', value: 48000, n: 32 }],
      byMode: [{ label: 'UPI', value: 200000 }],
    })
    expect(summary.latestPayment).toMatchObject({ studentId: 's1', headId: 'h1', amount: 4800 })
  })

  it('computes summary from local invoices/payments when API is 404', async () => {
    localStorage.setItem('sms_fee_invoices:default', JSON.stringify([{
      id: 'inv1', studentId: 's1', studentName: 'Asha', cls: 'X-A', grade: 'X',
      academicYear: '2025-26', term: 'Term 1',
      lines: [{ headId: 'h1', headName: 'Academic', amount: 10000 }],
      total: 10000, paid: 4000, waived: 0, due: 6000, status: 'partial',
    }]))
    localStorage.setItem('sms_fee_payments:default', JSON.stringify([{
      id: 1, invoiceId: 'inv1', studentId: 's1', studentName: 'Asha', cls: 'X-A',
      headId: 'h1', amount: 4000, mode: 'UPI', ref: 'TXN1', date: localDateIso(),
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404),
    ))
    const summary = await getFeeReportSummary()
    expect(summary.outstanding).toBe(6000)
    expect(summary.billedTerm).toBe(10000)
    expect(summary.collectedTerm).toBe(4000)
    expect(summary.collectedToday).toBe(4000)
    expect(summary.defaulters).toBe(1)
    expect(summary.byClass.some((c) => c.label === 'X-A')).toBe(true)
    expect(summary.latestPayment?.amount).toBe(4000)
  })

  it('counts locale en-IN payment dates as collected today', async () => {
    const now = new Date()
    const locale = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    localStorage.setItem('sms_fee_invoices:default', JSON.stringify([{
      id: 'inv1', studentId: 's1', studentName: 'Asha', cls: 'X-A', grade: 'X',
      academicYear: '2025-26', term: 'Term 1',
      lines: [{ headId: 'h1', headName: 'Academic', amount: 5000 }],
      total: 5000, paid: 5000, waived: 0, due: 0, status: 'paid',
    }]))
    localStorage.setItem('sms_fee_payments:default', JSON.stringify([{
      id: 1, invoiceId: 'inv1', studentId: 's1', studentName: 'Asha', cls: 'X-A',
      amount: 5000, mode: 'UPI', ref: 'TXN1', date: locale,
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404),
    ))
    const summary = await getFeeReportSummary()
    expect(summary.collectedToday).toBe(5000)
    expect(summary.collectedTerm).toBe(5000)
    expect(summary.pct).toBe(100)
    expect(summary.billedTerm).toBe(5000)
  })
})
