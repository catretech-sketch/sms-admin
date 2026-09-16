import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listAllTasks, createTask, toTask } from './tasks'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('toTask', () => {
  it('maps a wire object assigned to a specific staff member', () => {
    const task = toTask({
      id: 'T1', tenant_id: 'S1', title: 'Sweep courtyard', detail: 'Before assembly',
      category: 'cleaning', priority: 'urgent', status: 'pending', due_date: '2026-09-20',
      assigned_to_user_id: 'U1', assigned_to_user_name: 'Ramesh Kumar',
      created_at: '2026-09-16T09:00:00Z', updated_at: '2026-09-16T09:00:00Z',
    })
    expect(task).toMatchObject({
      id: 'T1', tenantId: 'S1', title: 'Sweep courtyard', detail: 'Before assembly',
      category: 'cleaning', priority: 'urgent', status: 'pending', dueDate: '2026-09-20',
      assignedToUserId: 'U1', assignedToUserName: 'Ramesh Kumar',
    })
    expect(task.assignedToRoleKey).toBeUndefined()
  })

  it('maps a wire object assigned to a duty-role broadcast', () => {
    const task = toTask({
      id: 'T2', tenant_id: 'S1', title: 'Water the garden', priority: 'normal', status: 'completed',
      assigned_to_role_key: 'gardener', completed_at: '2026-09-16T10:00:00Z', completed_by_user_id: 'U2',
      created_at: '2026-09-16T09:00:00Z', updated_at: '2026-09-16T10:00:00Z',
    })
    expect(task.assignedToRoleKey).toBe('gardener')
    expect(task.assignedToUserId).toBeUndefined()
    expect(task.completedAt).toBe('2026-09-16T10:00:00Z')
    expect(task.completedByUserId).toBe('U2')
  })

  it('falls back to safe defaults for unrecognized enum values from the wire', () => {
    const task = toTask({
      id: 'T3', tenant_id: 'S1', title: 'Odd task', priority: 'critical', status: 'archived',
      assigned_to_role_key: 'janitor',
      created_at: '2026-09-16T09:00:00Z', updated_at: '2026-09-16T09:00:00Z',
    })
    expect(task.priority).toBe('normal')
    expect(task.status).toBe('pending')
    expect(task.assignedToRoleKey).toBeUndefined()
  })
})

describe('listAllTasks', () => {
  it('GETs the manager listing and maps every row', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'T1', tenant_id: 'S1', title: 'Sweep courtyard', priority: 'normal', status: 'pending',
        assigned_to_role_key: 'sweeper',
        created_at: '2026-09-16T09:00:00Z', updated_at: '2026-09-16T09:00:00Z',
      }],
      next_cursor: null,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await listAllTasks()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'T1', status: 'pending', assignedToRoleKey: 'sweeper' })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/staff\/tasks\/all$/)
  })
})

describe('createTask', () => {
  it('POSTs a task assigned to a specific staff member', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'T1', tenant_id: 'S1', title: 'Sweep courtyard', priority: 'urgent', status: 'pending',
        assigned_to_user_id: 'U1',
        created_at: '2026-09-16T09:00:00Z', updated_at: '2026-09-16T09:00:00Z',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const task = await createTask({ title: 'Sweep courtyard', priority: 'urgent', assignedToUserId: 'U1' })
    expect(task.id).toBe('T1')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/staff\/tasks$/)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({
      title: 'Sweep courtyard', priority: 'urgent', assigned_to_user_id: 'U1',
    })
  })

  it('POSTs a task broadcast to a duty role', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'T2', tenant_id: 'S1', title: 'Water the garden', priority: 'normal', status: 'pending',
        assigned_to_role_key: 'gardener',
        created_at: '2026-09-16T09:00:00Z', updated_at: '2026-09-16T09:00:00Z',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await createTask({
      title: 'Water the garden', detail: 'Twice a day', category: 'garden', priority: 'normal',
      dueDate: '2026-09-20', assignedToRoleKey: 'gardener',
    })
    const [, opts] = fetchMock.mock.calls[0]
    expect(JSON.parse(opts.body as string)).toEqual({
      title: 'Water the garden', detail: 'Twice a day', category: 'garden', priority: 'normal',
      due_date: '2026-09-20', assigned_to_role_key: 'gardener',
    })
  })

  it('rejects a task with neither a title', async () => {
    await expect(createTask({ title: '  ', priority: 'normal', assignedToRoleKey: 'guard' })).rejects.toThrow(/title/i)
  })

  it('rejects a task with neither an assignee nor a role', async () => {
    await expect(createTask({ title: 'Task', priority: 'normal' })).rejects.toThrow(/exactly one/i)
  })

  it('rejects a task assigned to both a user and a role', async () => {
    await expect(createTask({
      title: 'Task', priority: 'normal', assignedToUserId: 'U1', assignedToRoleKey: 'guard',
    })).rejects.toThrow(/exactly one/i)
  })
})
