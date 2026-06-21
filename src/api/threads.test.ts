import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listThreads } from './threads'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listThreads', () => {
  it('returns the threads list (with embedded messages)', async () => {
    const wire = { data: [{ id: 1, parent: 'Mrs A', student: 'X-A', teacher: 'Mr B', unread: 2, last: 'hi', time: '2h', hue: 200, msgs: [{ me: false, t: 'hi', at: '2h' }] }], next_cursor: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)))
    const rows = await listThreads()
    expect(rows[0]).toMatchObject({ id: 1, parent: 'Mrs A', unread: 2 })
    expect(rows[0].msgs[0]).toMatchObject({ me: false, t: 'hi' })
  })
})
