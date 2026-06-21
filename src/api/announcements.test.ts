import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listAnnouncements, createAnnouncement } from './announcements'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listAnnouncements', () => {
  it('returns the announcements list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'A1', title: 'Holiday', audience: 'All', when: '1d', reach: 1200, ch: 'app' }], next_cursor: null })))
    expect((await listAnnouncements())[0]).toMatchObject({ id: 'A1', title: 'Holiday', audience: 'All' })
  })
})

describe('createAnnouncement', () => {
  it('POSTs /announcements with the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'A2', title: 'PTM', audience: 'Parents', when: 'now', reach: 800, ch: 'app' } }))
    vi.stubGlobal('fetch', fetchMock)
    const created = await createAnnouncement({ title: 'PTM', audience: 'Parents' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/announcements')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ title: 'PTM', audience: 'Parents' })
    expect(created).toMatchObject({ id: 'A2', title: 'PTM' })
  })
})
