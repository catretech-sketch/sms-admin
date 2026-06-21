import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listNotifications } from './notifications'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listNotifications', () => {
  it('returns the notifications list from the data envelope', async () => {
    const wire = { data: [{ id: 1, icon: 'bell', tone: 'brand', title: 'Fee paid', body: 'Term 1', time: '2h', unread: true }], next_cursor: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)))
    const rows = await listNotifications()
    expect(rows).toEqual([{ id: 1, icon: 'bell', tone: 'brand', title: 'Fee paid', body: 'Term 1', time: '2h', unread: true }])
  })

  it('requests /notifications', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listNotifications()
    expect(fetchMock.mock.calls[0][0]).toContain('/notifications')
  })
})
