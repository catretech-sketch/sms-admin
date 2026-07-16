import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getFeeStructure, saveFeeStructure } from './feeStructure'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('getFeeStructure', () => {
  it('returns grade×head matrix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: { X: { h1: 36000, h2: 18000 } },
    })))
    expect(await getFeeStructure()).toEqual({ X: { h1: 36000, h2: 18000 } })
  })
})

describe('saveFeeStructure', () => {
  it('PUTs /fees/structure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { X: { h1: 1 } } }))
    vi.stubGlobal('fetch', fetchMock)
    await saveFeeStructure({ X: { h1: 1 } })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/fees/structure')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
  })
})
