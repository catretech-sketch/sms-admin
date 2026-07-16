import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeeHeads, createFeeHead } from './feeHeads'

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
})
