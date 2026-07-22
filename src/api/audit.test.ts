import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listAuditLog } from './audit'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listAuditLog', () => {
  it('GETs /school/audit and maps the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'A-1', actor_id: 'U-1', actor_name: 'Ravi', action: 'user.role_changed', target: 'U-2', time: '2026-07-22T10:00:00Z' }],
      next_cursor: '2026-07-22T10:00:00Z',
    }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await listAuditLog()
    expect(result.data).toEqual([{ id: 'A-1', actorId: 'U-1', actorName: 'Ravi', action: 'user.role_changed', target: 'U-2', at: '2026-07-22T10:00:00Z' }])
    expect(result.nextCursor).toBe('2026-07-22T10:00:00Z')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/school\/audit/)
  })

  it('forwards filter params as query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listAuditLog({ action: 'user.role_changed', actorId: 'U-1', cursor: 'C-1' })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('action=user.role_changed')
    expect(url).toContain('actor_id=U-1')
    expect(url).toContain('cursor=C-1')
  })

  it('defaults to an empty page when the API returns null data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null, next_cursor: null })))
    const result = await listAuditLog()
    expect(result.data).toEqual([])
    expect(result.nextCursor).toBeNull()
  })
})
