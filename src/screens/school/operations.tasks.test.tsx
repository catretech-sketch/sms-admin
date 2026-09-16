import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
    completed_at: '2026-09-15T12:00:00Z', completed_by_user_id: 'U9',
    created_at: '2026-09-14T09:00:00Z', updated_at: '2026-09-15T12:00:00Z',
  },
]

const STAFF_ROWS = [
  {
    id: 'U9', name: 'Ramesh Driver', gender: 'M', role: 'Driver', category: 'transport',
    department: 'Transport', phone: '9000000001', shift: 'Day', route: 'R1', attendance_pct: 96,
    status: 'active', avatar_hue: 10,
  },
]

function makeFetch(roles: string[], taskRows: unknown[] = TASK_ROWS, createdTask?: unknown) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method, roles)
    if (auth) return Promise.resolve(auth)
    if (url.includes('/staff/tasks/all')) return Promise.resolve(jsonResponse({ data: taskRows, next_cursor: null }))
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

function renderScreen(roles: string[] = ['school.admin'], taskRows: unknown[] = TASK_ROWS, createdTask?: unknown) {
  const fetchMock = makeFetch(roles, taskRows, createdTask)
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

describe('Staff tasks tab', () => {
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

  it('lists staff tasks with role-broadcast and specific-assignee labels', async () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /staff tasks/i }))
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())
    expect(screen.getByText('Check bus AC')).toBeInTheDocument()
    expect(screen.getByText('All Cleaners')).toBeInTheDocument()
    expect(screen.getByText('Ramesh Driver')).toBeInTheDocument()
  })

  it('filters tasks client-side by search term', async () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /staff tasks/i }))
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())

    const searchInput = screen.getByPlaceholderText(/search title or detail/i)
    fireEvent.change(searchInput, { target: { value: 'bus' } })

    await waitFor(() => expect(screen.queryByText('Sweep courtyard')).not.toBeInTheDocument())
    expect(screen.getByText('Check bus AC')).toBeInTheDocument()
  })

  it('creates a role-broadcast task via POST with exactly assigned_to_role_key', async () => {
    const { fetchMock } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /staff tasks/i }))
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    fireEvent.change(screen.getByPlaceholderText(/sweep courtyard before assembly/i), { target: { value: 'Water the garden' } })

    fireEvent.click(screen.getByRole('button', { name: /^create task$/i }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/staff/tasks') && !url.includes('/all') && (opts?.method ?? '') === 'POST'
      })
      expect(post).toBeTruthy()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toMatchObject({ title: 'Water the garden', priority: 'normal', assigned_to_role_key: 'driver' })
      expect(body.assigned_to_user_id).toBeUndefined()
    })
  })

  it('creates a task assigned to a specific staff member', async () => {
    const { fetchMock } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /staff tasks/i }))
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    fireEvent.change(screen.getByPlaceholderText(/sweep courtyard before assembly/i), { target: { value: 'Fix mirror' } })

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const assignModeSelect = selects.find((s) => s.value === 'role')!
    fireEvent.change(assignModeSelect, { target: { value: 'user' } })

    await waitFor(() => expect(screen.getAllByText(/ramesh driver/i).length).toBeGreaterThan(0))
    const staffSelect = screen.getByDisplayValue(/select a staff member/i) as HTMLSelectElement
    fireEvent.change(staffSelect, { target: { value: 'U9' } })

    fireEvent.click(screen.getByRole('button', { name: /^create task$/i }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/staff/tasks') && !url.includes('/all') && (opts?.method ?? '') === 'POST'
      })
      expect(post).toBeTruthy()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toMatchObject({ title: 'Fix mirror', assigned_to_user_id: 'U9' })
      expect(body.assigned_to_role_key).toBeUndefined()
    })
  })

  it('hides the New task button for a non-manager role', async () => {
    renderScreen(['school.teacher'])
    fireEvent.click(screen.getByRole('button', { name: /staff tasks/i }))
    await waitFor(() => expect(screen.getByText('Sweep courtyard')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /new task/i })).not.toBeInTheDocument()
  })
})
