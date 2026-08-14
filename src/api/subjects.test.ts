import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listSubjects, createSubject, updateSubject, deleteSubject } from './subjects'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listSubjects', () => {
  it('returns mapped subjects from {data:[{id,name}]}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 's1', name: 'English' }, { id: 's2', name: 'Science' }],
      next_cursor: null,
    })))
    expect(await listSubjects()).toEqual([
      { id: 's1', name: 'English' },
      { id: 's2', name: 'Science' },
    ])
  })
})

describe('createSubject', () => {
  it('POSTs /subjects with {name} and returns the created subject', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 's3', name: 'Music' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await createSubject('Music')).toEqual({ id: 's3', name: 'Music' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/subjects')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Music' })
  })
})

describe('ensureSubjectsNamed', () => {
  it('creates only missing subject names', async () => {
    const { ensureSubjectsNamed } = await import('./subjects')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: 's1', name: 'English' }],
        next_cursor: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 's2', name: 'Math' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(ensureSubjectsNamed(['English', 'Math', ' english '])).resolves.toEqual({
      created: 1,
      total: 2,
    })
  })
})

describe('updateSubject', () => {
  it('PATCHes /subjects/{id} with {name}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 's1', name: 'Physics' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await updateSubject('s1', 'Physics')).toEqual({ id: 's1', name: 'Physics' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/subjects/s1')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Physics' })
  })
})

describe('deleteSubject', () => {
  it('DELETEs /subjects/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }))
    vi.stubGlobal('fetch', fetchMock)
    await deleteSubject('s1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/subjects/s1')
    expect((init as RequestInit).method).toBe('DELETE')
  })
})
