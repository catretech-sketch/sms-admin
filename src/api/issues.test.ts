import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listIssues, getIssue, updateIssue, toIssue } from './issues'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('toIssue', () => {
  it('maps a wire object with notes into camelCase fields', () => {
    const issue = toIssue({
      id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'vehicle',
      title: 'Brake noise', description: 'Squeaking on braking', priority: 'high', status: 'open',
      vehicle_id: 'V1', route_id: null, trip_id: null, photo_base64: null,
      notes: [{ id: 'N1', author_user_id: 'U2', note: 'Checked, scheduling service', created_at: '2026-09-15T10:00:00Z' }],
      created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z',
    })
    expect(issue).toMatchObject({
      id: 'I1', tenantId: 'T1', reporterUserId: 'U1', category: 'vehicle',
      title: 'Brake noise', priority: 'high', status: 'open', vehicleId: 'V1',
    })
    expect(issue.routeId).toBeUndefined()
    expect(issue.notes).toHaveLength(1)
    expect(issue.notes?.[0]).toMatchObject({ id: 'N1', authorUserId: 'U2', note: 'Checked, scheduling service' })
  })
})

describe('listIssues', () => {
  it('GETs the list and maps every row', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'vehicle', title: 'Brake noise',
        description: 'x', priority: 'high', status: 'open',
        created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z',
      }],
      next_cursor: null,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await listIssues()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'I1', category: 'vehicle', status: 'open' })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/staff\/issues$/)
  })

  it('passes a status filter as a query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listIssues('open')
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/staff\/issues\?status=open$/)
  })
})

describe('getIssue', () => {
  it('GETs the detail by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'safety', title: 'Loose railing',
        description: 'x', priority: 'emergency', status: 'in_progress',
        created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z', notes: [],
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const issue = await getIssue('I1')
    expect(issue).toMatchObject({ id: 'I1', category: 'safety', priority: 'emergency', status: 'in_progress' })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/staff\/issues\/I1$/)
  })
})

describe('updateIssue', () => {
  it('PATCHes a status change', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'vehicle', title: 'Brake noise',
        description: 'x', priority: 'high', status: 'resolved',
        created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const issue = await updateIssue('I1', { status: 'resolved' })
    expect(issue.status).toBe('resolved')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/issues\/I1$/)
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual({ status: 'resolved' })
  })

  it('PATCHes a note only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'vehicle', title: 'Brake noise',
        description: 'x', priority: 'high', status: 'open',
        created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await updateIssue('I1', { note: 'Scheduled for tomorrow' })
    const [, opts] = fetchMock.mock.calls[0]
    expect(JSON.parse(opts.body as string)).toEqual({ note: 'Scheduled for tomorrow' })
  })

  it('rejects an update with neither status nor note', async () => {
    await expect(updateIssue('I1', {})).rejects.toThrow(/status or a note/i)
  })
})
