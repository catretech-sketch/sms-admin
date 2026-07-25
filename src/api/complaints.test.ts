import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listComplaints, createComplaint, updateComplaint } from './complaints'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listComplaints', () => {
  it('maps category -> cat and returns the list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'C1', subject: 'Bus late', from: 'Parent A', category: 'transport', priority: 'high', status: 'open', age: '2d', assignee: 'Ops', body: '...' }], next_cursor: null })))
    const rows = await listComplaints()
    expect(rows[0]).toMatchObject({ id: 'C1', cat: 'transport', priority: 'high', status: 'open' })
    expect((rows[0] as unknown as Record<string, unknown>).category).toBeUndefined()
  })
})

describe('createComplaint', () => {
  it('POSTs the complaint and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'C2', subject: 'Fee query', category: 'fees', priority: 'medium', status: 'open' } }))
    vi.stubGlobal('fetch', fetchMock)
    const c = await createComplaint({ subject: 'Fee query', category: 'fees', priority: 'medium' })
    expect(c).toMatchObject({ id: 'C2', cat: 'fees', priority: 'medium', status: 'open' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/complaints$/)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toMatchObject({ subject: 'Fee query', category: 'fees', priority: 'medium' })
  })

  it('rejects an empty subject', async () => {
    await expect(createComplaint({ subject: '   ' })).rejects.toThrow(/subject is required/i)
  })
})

describe('updateComplaint', () => {
  it('PATCHes status and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'C1', subject: 'Bus late', category: 'transport', priority: 'high', status: 'resolved' } }))
    vi.stubGlobal('fetch', fetchMock)
    const c = await updateComplaint('C1', { status: 'resolved' })
    expect(c).toMatchObject({ id: 'C1', status: 'resolved', cat: 'transport' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/complaints\/C1$/)
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toMatchObject({ status: 'resolved' })
  })
})
