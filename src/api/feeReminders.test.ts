import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sendFeeReminders } from './feeReminders'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('sendFeeReminders', () => {
  it('POSTs channels/audience/includePayLink to /fees/reminders', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { reach: 17 } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendFeeReminders({
      audience: 'defaulters',
      channels: ['email', 'sms'],
      includePayLink: true,
    })
    expect(result).toEqual({ reach: 17 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/fees/reminders')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({
      audience: 'defaulters',
      channels: ['email', 'sms'],
      include_pay_link: true,
    })
  })

  it('sends invoice_ids for a selected-invoices audience', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { reach: 2 } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendFeeReminders({
      invoiceIds: ['inv1', 'inv2'],
      audience: 'selected',
      channels: ['app'],
    })
    expect(result).toEqual({ reach: 2 })
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({
      invoice_ids: ['inv1', 'inv2'],
      audience: 'selected',
      channels: ['app'],
    })
  })
})
