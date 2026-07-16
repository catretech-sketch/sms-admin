import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getFeeReportSummary } from './feeReports'

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
})
