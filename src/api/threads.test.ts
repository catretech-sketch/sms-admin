import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listThreads, createThread, listThreadMessages, sendMessage } from './threads'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listThreads', () => {
  it('maps backend ChatThreadResponse to the UI thread shape', async () => {
    const wire = {
      data: [{
        id: 'T1', tenant_id: 'x', name: 'Mrs A', role: 'Parent · X-A',
        last_message: 'hi', last_at: null, unread: 2, group: false, child_id: null,
      }],
      next_cursor: null,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)))
    const rows = await listThreads()
    expect(rows[0]).toMatchObject({ id: 'T1', name: 'Mrs A', role: 'Parent · X-A', last: 'hi', unread: 2, group: false })
  })
})

describe('createThread', () => {
  it('POSTs name + role and returns the mapped thread', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'T2', name: 'Mr B', role: 'Teacher', unread: 0 } }))
    vi.stubGlobal('fetch', fetchMock)
    const t = await createThread({ name: 'Mr B', role: 'Teacher' })
    expect(t).toMatchObject({ id: 'T2', name: 'Mr B', role: 'Teacher' })
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toMatchObject({ name: 'Mr B', role: 'Teacher', group: false })
  })

  it('rejects an empty name', async () => {
    await expect(createThread({ name: '  ' })).rejects.toThrow(/name is required/i)
  })
})

describe('listThreadMessages', () => {
  it('maps messages with is_mine -> mine', async () => {
    const wire = { data: [{ id: 'M1', thread_id: 'T1', text: 'hello', sent_at: null, is_mine: true }], next_cursor: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)))
    const rows = await listThreadMessages('T1')
    expect(rows[0]).toMatchObject({ id: 'M1', threadId: 'T1', text: 'hello', mine: true })
  })
})

describe('sendMessage', () => {
  it('POSTs the trimmed text to the thread messages endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'M2', thread_id: 'T1', text: 'hi', is_mine: true } }))
    vi.stubGlobal('fetch', fetchMock)
    const m = await sendMessage('T1', '  hi  ')
    expect(m).toMatchObject({ id: 'M2', text: 'hi', mine: true })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/threads\/T1\/messages$/)
    expect(JSON.parse(opts.body as string)).toEqual({ text: 'hi' })
  })

  it('rejects an empty message', async () => {
    await expect(sendMessage('T1', '   ')).rejects.toThrow(/message is required/i)
  })
})
