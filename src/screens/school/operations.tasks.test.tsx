import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { opsScreens } from './operations'

const CommunicationScreen = opsScreens['school.comm']

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const TENANT_ID = 'school-1'

function authAndSchoolResponse(url: string, method: string, roles: string[]): Response | null {
  if (url.includes('/auth/refresh')) return jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })
  if (url.includes('/auth/me')) return jsonResponse({ data: { id: 'u1', tenant_id: TENANT_ID, roles, is_platform: false } })
  if (url.includes('/me/schools') && method === 'GET') {
    return jsonResponse({
      data: [{
        id: TENANT_ID, name: 'Greenwood High', slug: 'greenwood', country: 'IN', status: 'active',
        plan_id: null, plan_name: 'Platinum', tier: 'platinum', mrr: 0, students_count: 0,
        staff_count: 0, storage_gb: 0, created: '2026-01-01', contact_name: null,
        contact_email: null, contact_phone: null, address: null, health_score: 100,
      }],
      next_cursor: null,
    })
  }
  return null
}

const TASK_ROWS = [
  {
    id: 'T1', tenant_id: TENANT_ID, title: 'Sweep courtyard', detail: 'Before morning assembly',
    category: 'cleaning', priority: 'urgent', status: 'pending', due_date: '2026-09-20',
    assigned_to_role_key: 'sweeper', created_at: '2026-09-16T09:00:00Z', updated_at: '2026-09-16T09:00:00Z',
  },
  {
    id: 'T2', tenant_id: TENANT_ID, title: 'Check bus AC', detail: 'Route 4 bus',
    category: 'maintenance', priority: 'normal', status: 'completed', due_date: '2026-09-15',
    assigned_to_user_id: 'U9', assigned_to_user_name: 'Ramesh Driver',
    completed_at: '2026-09-15T12:00:00Z', completed_by_user_id: 'U9', completed_by_user_name: 'Ramesh Driver',
    created_at: '2026-09-14T09:00:00Z', updated_at: '2026-09-15T12:00:00Z',
  },
]

const STAFF_ROWS = [
  {
    id: 'STF-9', user_id: 'U9', name: 'Ramesh Driver', gender: 'M', role: 'Driver', category: 'transport',
    department: 'Transport', phone: '9000000001', shift: 'Day', route: 'R1', attendance_pct: 96,
    status: 'active', avatar_hue: 10,
  },
  {
    id: 'STF-unlinked', name: 'No Login Yet', gender: 'M', role: 'Peon', category: 'support',
    department: 'Admin', phone: '9000000002', shift: 'Day', route: null, attendance_pct: 80,
    status: 'active', avatar_hue: 20,
  },
]

const PEOPLE_ROWS = [
  {
    user_id: 'U9', name: 'Ramesh Driver', role_key: 'driver',
    total_tasks: 2, pending_tasks: 1, completed_tasks: 1, overdue_tasks: 0,
    last_activity_at: '2026-09-15T12:00:00Z',
  },
  {
    user_id: 'U8', name: 'Idle Sweeper', role_key: 'sweeper',
    total_tasks: 0, pending_tasks: 0, completed_tasks: 0, overdue_tasks: 0,
    last_activity_at: null,
  },
]

const ROLE_ROWS = [
  { role_key: 'driver', headcount: 1, total_tasks: 2, pending_tasks: 1, completed_tasks: 1, overdue_tasks: 0, last_activity_at: '2026-09-15T12:00:00Z' },
  { role_key: 'conductor', headcount: 0, total_tasks: 0, pending_tasks: 0, completed_tasks: 0, overdue_tasks: 0, last_activity_at: null },
  { role_key: 'sweeper', headcount: 1, total_tasks: 1, pending_tasks: 1, completed_tasks: 0, overdue_tasks: 0, last_activity_at: '2026-09-16T09:00:00Z' },
  { role_key: 'gardener', headcount: 0, total_tasks: 0, pending_tasks: 0, completed_tasks: 0, overdue_tasks: 0, last_activity_at: null },
  { role_key: 'guard', headcount: 0, total_tasks: 0, pending_tasks: 0, completed_tasks: 0, overdue_tasks: 0, last_activity_at: null },
  { role_key: 'peon', headcount: 0, total_tasks: 0, pending_tasks: 0, completed_tasks: 0, overdue_tasks: 0, last_activity_at: null },
]

function makeFetch(roles: string[], taskRows: unknown[] = TASK_ROWS, createdTask?: unknown, opts?: { tasksError?: boolean }) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method, roles)
    if (auth) return Promise.resolve(auth)
    if (url.includes('/staff/tasks/summary/people')) {
      return Promise.resolve(jsonResponse({ data: PEOPLE_ROWS, next_cursor: null }))
    }
    if (url.includes('/staff/tasks/summary/roles')) {
      return Promise.resolve(jsonResponse({ data: ROLE_ROWS, next_cursor: null }))
    }
    if (url.includes('/staff/tasks/all')) {
      if (opts?.tasksError) return Promise.resolve(jsonResponse({ error: { code: 'internal_error', message: 'boom' } }, 500))
      const parsed = new URL(url, 'http://local.invalid')
      let rows = taskRows as Array<Record<string, unknown>>
      const status = parsed.searchParams.get('status')
      const assignee = parsed.searchParams.get('assigned_to_user_id')
      const role = parsed.searchParams.get('assigned_to_role_key')
      if (status) rows = rows.filter((r) => r.status === status)
      if (assignee) rows = rows.filter((r) => r.assigned_to_user_id === assignee)
      if (role) rows = rows.filter((r) => r.assigned_to_role_key === role)
      return Promise.resolve(jsonResponse({ data: rows, next_cursor: null }))
    }
    if (url.includes('/staff/tasks') && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      return Promise.resolve(jsonResponse({
        data: createdTask ?? {
          id: 'T-new', tenant_id: TENANT_ID, title: body.title, priority: body.priority, status: 'pending',
          ...body, created_at: '2026-09-16T09:00:00Z', updated_at: '2026-09-16T09:00:00Z',
        },
      }))
    }
    if (/\/staff(\?|$)/.test(url) && method === 'GET') return Promise.resolve(jsonResponse({ data: STAFF_ROWS, next_cursor: null }))
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  })
}

function renderScreen(
  roles: string[] = ['school.admin'],
  taskRows: unknown[] = TASK_ROWS,
  createdTask?: unknown,
  opts?: { tasksError?: boolean },
) {
  const fetchMock = makeFetch(roles, taskRows, createdTask, opts)
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <CommunicationScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
  return { ...utils, fetchMock }
}

async function openTaskManagement() {
  fireEvent.click(screen.getByRole('button', { name: /task management/i }))
  await waitFor(() => expect(screen.getByRole('button', { name: /^all tasks$/i })).toBeInTheDocument())
}

describe('Task Management tab', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    tokenStore.set({ access_token: 'a', refresh_token: 'r' })
    tokenStore.setEmail('admin@greenwood.edu')
  })

  afterEach(() => {
    tokenStore.clear()
    vi.unstubAllGlobals()
  })

  it('lists tasks with role-broadcast and specific-assignee labels', async () => {
    renderScreen()
    await openTaskManagement()
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())
    expect(screen.getByText('Check bus AC')).toBeInTheDocument()
    expect(screen.getByText('All Cleaners')).toBeInTheDocument()
    expect(screen.getAllByText('Ramesh Driver').length).toBeGreaterThan(0)
  })

  it('filters tasks client-side by search term', async () => {
    renderScreen()
    await openTaskManagement()
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())

    const searchInput = screen.getByPlaceholderText(/search title or detail/i)
    fireEvent.change(searchInput, { target: { value: 'bus' } })

    await waitFor(() => expect(screen.queryByText('Sweep courtyard')).not.toBeInTheDocument())
    expect(screen.getByText('Check bus AC')).toBeInTheDocument()
  })

  it('sends status filter to the server', async () => {
    const { fetchMock } = renderScreen()
    await openTaskManagement()
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())

    const statusSelect = screen.getByDisplayValue(/all statuses/i)
    fireEvent.change(statusSelect, { target: { value: 'pending' } })

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))
      expect(urls.some((u) => u.includes('/staff/tasks/all') && u.includes('status=pending'))).toBe(true)
      expect(screen.queryByText('Check bus AC')).not.toBeInTheDocument()
      expect(screen.getByText('Sweep courtyard')).toBeInTheDocument()
    })
  })

  it('creates a role-broadcast task via POST with exactly assigned_to_role_key', async () => {
    const { fetchMock } = renderScreen()
    await openTaskManagement()
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    fireEvent.change(screen.getByPlaceholderText(/sweep courtyard before assembly/i), { target: { value: 'Water the garden' } })

    fireEvent.click(screen.getByRole('button', { name: /^create task$/i }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/staff/tasks') && !url.includes('/all') && !url.includes('/summary') && (opts?.method ?? '') === 'POST'
      })
      expect(post).toBeTruthy()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toMatchObject({ title: 'Water the garden', priority: 'normal', assigned_to_role_key: 'driver' })
      expect(body.assigned_to_user_id).toBeUndefined()
    })
  })

  it('assigns a specific person by login userId, not the Staff row id', async () => {
    const { fetchMock } = renderScreen()
    await openTaskManagement()
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    fireEvent.change(screen.getByPlaceholderText(/sweep courtyard before assembly/i), { target: { value: 'Fix mirror' } })

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const assignModeSelect = selects.find((s) => s.value === 'role')!
    fireEvent.change(assignModeSelect, { target: { value: 'user' } })

    await waitFor(() => expect(screen.getAllByText(/ramesh driver/i).length).toBeGreaterThan(0))
    expect(screen.queryByText(/no login yet/i)).not.toBeInTheDocument()
    const staffSelect = screen.getByDisplayValue(/select a staff member/i) as HTMLSelectElement
    fireEvent.change(staffSelect, { target: { value: 'U9' } })

    fireEvent.click(screen.getByRole('button', { name: /^create task$/i }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/staff/tasks') && !url.includes('/all') && !url.includes('/summary') && (opts?.method ?? '') === 'POST'
      })
      expect(post).toBeTruthy()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toMatchObject({ title: 'Fix mirror', assigned_to_user_id: 'U9' })
      expect(body.assigned_to_user_id).not.toBe('STF-9')
      expect(body.assigned_to_role_key).toBeUndefined()
    })
  })

  it('hides the New task button for a non-manager role', async () => {
    renderScreen(['school.teacher'])
    await openTaskManagement()
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /new task/i })).not.toBeInTheDocument()
  })

  it('shows People cards from the summary endpoint', async () => {
    renderScreen()
    await openTaskManagement()
    fireEvent.click(screen.getByRole('button', { name: /^people$/i }))
    await waitFor(() => expect(screen.getByText('Ramesh Driver')).toBeInTheDocument())
    expect(screen.getByText('Idle Sweeper')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('opens Person detail with Assigned and Completed timeline events only', async () => {
    renderScreen()
    await openTaskManagement()
    fireEvent.click(screen.getByRole('button', { name: /^people$/i }))
    await waitFor(() => expect(screen.getByText('Ramesh Driver')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /ramesh driver/i }))

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Ramesh Driver')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /this week/i })).toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: /all time/i }))
    await waitFor(() => expect(within(drawer).getByText(/assigned ·/i)).toBeInTheDocument())
    expect(within(drawer).getByText(/completed ·/i)).toBeInTheDocument()
    expect(within(drawer).queryByText(/reassigned/i)).not.toBeInTheDocument()
    expect(within(drawer).queryByText(/cancelled/i)).not.toBeInTheDocument()
  })

  it('filters People by a Role click without duplicating person-detail UI', async () => {
    renderScreen()
    await openTaskManagement()
    fireEvent.click(screen.getByRole('button', { name: /^roles$/i }))
    await waitFor(() => expect(screen.getByText(/^driver$/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^driver$/i }))

    await waitFor(() => expect(screen.getByText('Ramesh Driver')).toBeInTheDocument())
    expect(screen.queryByText('Idle Sweeper')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ramesh driver/i }))
    const drawer = await screen.findByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: /all time/i }))
    await waitFor(() => expect(within(drawer).getByText(/assigned ·/i)).toBeInTheDocument())
  })

  it('shows a retry control when All Tasks fails to load', async () => {
    renderScreen(['school.admin'], TASK_ROWS, undefined, { tasksError: true })
    await openTaskManagement()
    await waitFor(() => expect(screen.getByText(/could not load tasks/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
