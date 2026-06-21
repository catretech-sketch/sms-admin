import { describe, it, expect, beforeEach, vi } from 'vitest'
import { inviteUser } from './users'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('inviteUser', () => {
  it('POSTs /users with email + role', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'u1' } }))
    vi.stubGlobal('fetch', fetchMock)
    await inviteUser('a@b.edu', 'teacher')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/users')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'a@b.edu', role: 'teacher' })
  })
})
