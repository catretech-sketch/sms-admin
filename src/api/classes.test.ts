import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listClasses, createClass } from './classes'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listClasses', () => {
  it('maps teacher_id -> teacherId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'X-A', grade: 'X', section: 'A', teacher_id: 'T1', students: 40, room: 'R1' }], next_cursor: null })))
    const rows = await listClasses()
    expect(rows[0]).toEqual({ name: 'X-A', grade: 'X', section: 'A', teacherId: 'T1', students: 40, room: 'R1' })
  })
})

describe('createClass', () => {
  it('POSTs /classes with teacherId -> teacher_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { name: 'X-B', grade: 'X', section: 'B', teacher_id: '', students: 0, room: 'R2' } }))
    vi.stubGlobal('fetch', fetchMock)
    await createClass({ name: 'X-B', grade: 'X', section: 'B', teacherId: '', students: 0, room: 'R2' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/classes')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.teacher_id).toBe('')
    expect(body.teacherId).toBeUndefined()
  })
})
