import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listApprovals } from './approvals'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listApprovals', () => {
  it('maps for_roles -> forRoles and returns the list', async () => {
    const wire = { data: [{ id: 'A1', type: 'leave', module: 'hr', cap: 'hr.approve', title: 'Leave', detail: '2 days', requester: 'Asha', role: 'teacher', amount: null, age: '3h', priority: 'high', for_roles: ['principal', 'admin'] }], next_cursor: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)))
    const rows = await listApprovals()
    expect(rows[0]).toMatchObject({ id: 'A1', priority: 'high', forRoles: ['principal', 'admin'], amount: null })
    expect((rows[0] as unknown as Record<string, unknown>).for_roles).toBeUndefined()
  })

  it('requests /approvals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listApprovals()
    expect(fetchMock.mock.calls[0][0]).toContain('/approvals')
  })
})
