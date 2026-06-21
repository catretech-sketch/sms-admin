import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listSubjects, createSubject } from './subjects'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listSubjects', () => {
  it('returns the subject names from {data:[{name}]}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'English' }, { name: 'Science' }], next_cursor: null })))
    expect(await listSubjects()).toEqual(['English', 'Science'])
  })
})

describe('createSubject', () => {
  it('POSTs /subjects with {name} and returns the created name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { name: 'Music' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await createSubject('Music')).toBe('Music')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/subjects')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Music' })
  })
})
