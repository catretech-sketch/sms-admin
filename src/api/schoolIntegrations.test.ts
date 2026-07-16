import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSchoolIntegrations, saveSchoolIntegrations, verifySchoolRazorpay } from './schoolIntegrations'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { vi.restoreAllMocks() })

describe('getSchoolIntegrations', () => {
  it('maps email/sms/razorpay and never echoes secrets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        email: { enabled: true, from_name: 'GV', from_address: 'fees@gv.edu' },
        sms: { enabled: true, sender_id: 'SCHMAT' },
        razorpay: { enabled: true, key_id: 'rzp_test_x', status: 'configured', key_secret_set: true, mode: 'test' },
      },
    })))
    const s = await getSchoolIntegrations()
    expect(s.email.fromName).toBe('GV')
    expect(s.email.fromAddress).toBe('fees@gv.edu')
    expect(s.sms.senderId).toBe('SCHMAT')
    expect(s.razorpay.keyId).toBe('rzp_test_x')
    expect(s.razorpay.status).toBe('configured')
    expect(s.razorpay.keySecret).toBeUndefined()
    expect(s.razorpay.keySecretSet).toBe(true)
  })

  it('GETs /school/integrations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { email: {}, sms: {}, razorpay: {} } }))
    vi.stubGlobal('fetch', fetchMock)
    await getSchoolIntegrations()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/school/integrations')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method ?? 'GET').toBe('GET')
  })
})

describe('saveSchoolIntegrations', () => {
  it('PUTs /school/integrations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await saveSchoolIntegrations({ email: { enabled: true, fromName: 'A', fromAddress: 'a@b.c' } })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/school/integrations')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
  })

  it('snake_cases the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await saveSchoolIntegrations({ razorpay: { keyId: 'rzp_x', keySecret: 'shh' } })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ razorpay: { key_id: 'rzp_x', key_secret: 'shh' } })
  })

  it('returns the mapped, updated integrations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: { email: { enabled: false, from_name: '', from_address: '' }, sms: { enabled: false, sender_id: '' }, razorpay: { enabled: false, key_id: '', mode: 'test', status: 'not_configured' } },
    })))
    const s = await saveSchoolIntegrations({ email: { enabled: false } })
    expect(s.razorpay.status).toBe('not_configured')
  })
})

describe('verifySchoolRazorpay', () => {
  it('POSTs /school/integrations/razorpay/verify and returns status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { status: 'configured' } }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await verifySchoolRazorpay()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/school/integrations/razorpay/verify')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(res.status).toBe('configured')
  })
})
