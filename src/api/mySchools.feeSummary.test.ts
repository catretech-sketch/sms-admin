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

function seedTenantFees(tenantId: string): void {
  localStorage.setItem(`sms_fee_invoices:${tenantId}`, JSON.stringify([
    {
      id: 'inv1', studentId: 's1', studentName: 'Asha', cls: 'X-A', grade: 'X',
      academicYear: '2025-26', term: 'Term 1',
      lines: [{ headId: 'h1', headName: 'Academic', amount: 10000 }],
      total: 10000, paid: 4000, waived: 0, due: 6000, status: 'partial',
    },
  ]))
  localStorage.setItem(`sms_fee_payments:${tenantId}`, JSON.stringify([
    {
      id: 1, invoiceId: 'inv1', studentId: 's1', studentName: 'Asha', cls: 'X-A',
      amount: 4000, mode: 'UPI', ref: 'TXN1', date: '2026-07-10',
    },
  ]))
}

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

  it('fills zeros from local fee stores when API returns empty cash', async () => {
    seedTenantFees('itm')
    seedTenantFees('kipm')
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/me/schools/fee-summary')) {
        return Promise.resolve(jsonResponse({
          data: {
            period: { from: '2026-07-01', to: '2026-07-31' },
            schools: [
              { tenant_id: 'itm', name: 'itm', collected: 0, outstanding: 0, payment_count: 0, invoice_count: 0 },
              { tenant_id: 'kipm', name: 'kipm', collected: 0, outstanding: 0, payment_count: 0, invoice_count: 0 },
            ],
            totals: { collected: 0, outstanding: 0, payment_count: 0, invoice_count: 0 },
          },
        }))
      }
      if (u.includes('/me/schools')) {
        return Promise.resolve(jsonResponse({
          data: [
            { id: 'itm', name: 'itm', slug: 'itm', status: 'active', mrr: 0, students_count: 1, staff_count: 1, storage_gb: 0, created: '2026-01-01', health_score: 80 },
            { id: 'kipm', name: 'kipm', slug: 'kipm', status: 'active', mrr: 0, students_count: 1, staff_count: 1, storage_gb: 0, created: '2026-01-01', health_score: 80 },
          ],
          next_cursor: null,
        }))
      }
      return Promise.resolve(notFound())
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await getMySchoolsFeeSummary({ from: '2026-07-01', to: '2026-07-31' })
    expect(res.totals.collected).toBe(8000)
    expect(res.totals.outstanding).toBe(12000)
    expect(res.totals.payment_count).toBe(2)
    expect(res.totals.invoice_count).toBe(2)
    const itm = res.schools.find((s) => s.tenant_id === 'itm')
    expect(itm).toMatchObject({ collected: 4000, outstanding: 6000, payment_count: 1, invoice_count: 1 })
  })

  it('builds portfolio fee summary from local stores when fee-summary API is 404', async () => {
    seedTenantFees('itm')
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/me/schools/fee-summary')) return Promise.resolve(notFound())
      if (u.includes('/me/schools')) {
        return Promise.resolve(jsonResponse({
          data: [
            { id: 'itm', name: 'ITM School', slug: 'itm', status: 'active', mrr: 0, students_count: 1, staff_count: 1, storage_gb: 0, created: '2026-01-01', health_score: 80 },
            { id: 'scc', name: 'SCC', slug: 'scc', status: 'active', mrr: 0, students_count: 0, staff_count: 0, storage_gb: 0, created: '2026-01-01', health_score: 50 },
          ],
          next_cursor: null,
        }))
      }
      return Promise.resolve(notFound())
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await getMySchoolsFeeSummary()
    expect(res.schools).toHaveLength(2)
    expect(res.schools.find((s) => s.tenant_id === 'itm')).toMatchObject({
      name: 'ITM School', collected: 4000, outstanding: 6000,
    })
    expect(res.schools.find((s) => s.tenant_id === 'scc')).toMatchObject({
      collected: 0, outstanding: 0,
    })
    expect(res.totals.collected).toBe(4000)
  })

  it('still throws non-404 fee-summary errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'forbidden', message: 'no' } }, 403),
    ))
    await expect(getMySchoolsFeeSummary()).rejects.toBeInstanceOf(ApiError)
  })

  it('reads desk fees stored under school slug when portfolio id differs', async () => {
    seedTenantFees('itm')
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/me/schools/fee-summary')) return Promise.resolve(notFound())
      if (u.includes('/me/schools')) {
        return Promise.resolve(jsonResponse({
          data: [{
            id: 'uuid-itm-1', name: 'ITM', slug: 'itm', status: 'active',
            mrr: 0, students_count: 1, staff_count: 1, storage_gb: 0, created: '2026-01-01', health_score: 80,
          }],
          next_cursor: null,
        }))
      }
      return Promise.resolve(notFound())
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await getMySchoolsFeeSummary()
    expect(res.schools[0]).toMatchObject({ collected: 4000, outstanding: 6000 })
  })

  it('reads desk fees stored under default for the active tenant school', async () => {
    seedTenantFees('default')
    localStorage.setItem('sms_admin_tenant', 'itm')
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/me/schools/fee-summary')) return Promise.resolve(notFound())
      if (u.includes('/me/schools')) {
        return Promise.resolve(jsonResponse({
          data: [{
            id: 'itm', name: 'ITM', slug: 'itm', status: 'active',
            mrr: 0, students_count: 1, staff_count: 1, storage_gb: 0, created: '2026-01-01', health_score: 80,
          }],
          next_cursor: null,
        }))
      }
      return Promise.resolve(notFound())
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await getMySchoolsFeeSummary()
    expect(res.totals.collected).toBe(4000)
    expect(res.totals.outstanding).toBe(6000)
  })
})
