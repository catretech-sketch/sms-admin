import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeeHeads, createFeeHead, deleteFeeHead, updateFeeHead } from './feeHeads'
import { ApiError } from './ApiError'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listFeeHeads', () => {
  it('maps snake_case heads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'h1', name: 'Academic', code: 'ACAD', active: true, is_system: true }],
      next_cursor: null,
    })))
    const rows = await listFeeHeads()
    expect(rows[0]).toMatchObject({ id: 'h1', name: 'Academic', isSystem: true, active: true })
  })

  it('throws when API is 404 (no local fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'missing' } }, 404)))
    await expect(listFeeHeads()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('createFeeHead', () => {
  it('POSTs /fees/heads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'h2', name: 'Lab', active: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await createFeeHead({ name: 'Lab' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/fees/heads')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ name: 'Lab' })
  })

  it('throws when POST /fees/heads is 404 (no local save)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)))
    await expect(createFeeHead({ name: 'Lab fee' })).rejects.toBeInstanceOf(ApiError)
  })
})

describe('deleteFeeHead', () => {
  it('throws when DELETE is 404 (no local store)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)))
    await expect(deleteFeeHead('h1')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('updateFeeHead', () => {
  it('throws when PATCH is 404 (no local store)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)))
    await expect(updateFeeHead('h1', { name: 'New' })).rejects.toBeInstanceOf(ApiError)
  })
})

describe('createFeeHead errors', () => {
  it('still throws non-404 API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'forbidden', message: 'no' } }, 403)))
    await expect(createFeeHead({ name: 'X' })).rejects.toBeInstanceOf(ApiError)
  })
})
