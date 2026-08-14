import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getMySchoolsFeeSummary } from './mySchools'
import { ApiError } from './ApiError'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('getMySchoolsFeeSummary', () => {
  it('GETs /me/schools/fee-summary when API returns cash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        period: { from: '2026-07-01', to: '2026-07-31' },
        schools: [{
          tenant_id: 'itm', name: 'itm', collected: 5000, outstanding: 1000,
          payment_count: 2, invoice_count: 1,
        }],
        totals: { collected: 5000, outstanding: 1000, payment_count: 2, invoice_count: 1 },
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await getMySchoolsFeeSummary({ from: '2026-07-01', to: '2026-07-31' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/me/schools/fee-summary')
    expect(res.totals.collected).toBe(5000)
    expect(res.schools[0].tenant_id).toBe('itm')
  })

  it('returns API zeros as-is without merging localStorage', async () => {
    localStorage.setItem('sms_fee_invoices:itm', JSON.stringify([{
      id: 'inv1', total: 10000, paid: 4000, due: 6000, status: 'partial',
    }]))
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        period: { from: '2026-07-01', to: '2026-07-31' },
        schools: [
          { tenant_id: 'itm', name: 'itm', collected: 0, outstanding: 0, payment_count: 0, invoice_count: 0 },
        ],
        totals: { collected: 0, outstanding: 0, payment_count: 0, invoice_count: 0 },
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await getMySchoolsFeeSummary({ from: '2026-07-01', to: '2026-07-31' })
    expect(res.totals.collected).toBe(0)
    expect(res.totals.outstanding).toBe(0)
    expect(res.schools[0]).toMatchObject({ collected: 0, outstanding: 0 })
  })

  it('fails closed when fee-summary API is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()))
    await expect(getMySchoolsFeeSummary()).rejects.toBeInstanceOf(ApiError)
  })

  it('still throws non-404 fee-summary errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'forbidden', message: 'no' } }, 403),
    ))
    await expect(getMySchoolsFeeSummary()).rejects.toBeInstanceOf(ApiError)
  })
})
