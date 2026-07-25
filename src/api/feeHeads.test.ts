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

  it('falls back to local heads when API is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'missing' } }, 404)))
    expect(await listFeeHeads()).toEqual([])
    /* Seed via create, then list again under 404 */
    await createFeeHead({ name: 'Transport' })
    const rows = await listFeeHeads()
    expect(rows.some((h) => h.name === 'Transport')).toBe(true)
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

  it('stores locally when POST /fees/heads is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)))
    const head = await createFeeHead({ name: 'Lab fee' })
    expect(head.name).toBe('Lab fee')
    expect(head.id).toBeTruthy()
    expect(head.active).toBe(true)
    const listed = await listFeeHeads()
    expect(listed.find((h) => h.name === 'Lab fee')).toBeTruthy()
  })
})

describe('deleteFeeHead', () => {
  it('removes from local store when DELETE is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)))
    const head = await createFeeHead({ name: 'Temp' })
    await deleteFeeHead(head.id)
    expect((await listFeeHeads()).find((h) => h.id === head.id)).toBeUndefined()
  })
})

describe('updateFeeHead', () => {
  it('patches local head when API is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)))
    const head = await createFeeHead({ name: 'Old' })
    const updated = await updateFeeHead(head.id, { name: 'New' })
    expect(updated.name).toBe('New')
  })
})

describe('createFeeHead errors', () => {
  it('still throws non-404 API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'forbidden', message: 'no' } }, 403)))
    await expect(createFeeHead({ name: 'X' })).rejects.toBeInstanceOf(ApiError)
  })
})
