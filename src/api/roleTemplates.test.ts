import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getRoleTemplate, setRoleTemplate } from './roleTemplates'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('getRoleTemplate', () => {
  it('GETs /roles/permissions and returns the override list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await getRoleTemplate()
    expect(rows).toEqual([{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }])
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/roles\/permissions$/)
  })

  it('returns an empty array when the API returns null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null })))
    expect(await getRoleTemplate()).toEqual([])
  })
})

describe('setRoleTemplate', () => {
  it('PUTs the overrides and returns the saved list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ role: 'staff', module: 'sis', cap: 'V', effect: 'grant' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await setRoleTemplate([{ role: 'staff', module: 'sis', cap: 'V', effect: 'grant' }])
    expect(rows).toEqual([{ role: 'staff', module: 'sis', cap: 'V', effect: 'grant' }])
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/roles\/permissions$/)
    expect(opts.method).toBe('PUT')
    const body = JSON.parse(opts.body as string)
    expect(body).toEqual({ overrides: [{ role: 'staff', module: 'sis', cap: 'V', effect: 'grant' }] })
  })
})
