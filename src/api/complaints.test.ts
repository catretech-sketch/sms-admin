import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listComplaints } from './complaints'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listComplaints', () => {
  it('maps category -> cat and returns the list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'C1', subject: 'Bus late', from: 'Parent A', category: 'transport', priority: 'high', status: 'open', age: '2d', assignee: 'Ops', body: '...' }], next_cursor: null })))
    const rows = await listComplaints()
    expect(rows[0]).toMatchObject({ id: 'C1', cat: 'transport', priority: 'high', status: 'open' })
    expect((rows[0] as unknown as Record<string, unknown>).category).toBeUndefined()
  })
})
