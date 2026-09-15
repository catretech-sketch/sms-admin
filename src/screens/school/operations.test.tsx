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
        plan_id: null, plan_name: 'Gold', tier: 'gold', mrr: 0, students_count: 0,
        staff_count: 0, storage_gb: 0, created: '2026-01-01', contact_name: null,
        contact_email: null, contact_phone: null, address: null, health_score: 100,
      }],
      next_cursor: null,
    })
  }
  return null
}

const ISSUE_ROWS = [
  {
    id: 'I1', tenant_id: TENANT_ID, reporter_user_id: 'U9', reporter_name: 'Ramesh Driver',
    category: 'vehicle', title: 'Brake noise', description: 'Squeaking on braking',
    priority: 'high', status: 'open', vehicle_id: 'BUS-01', route_id: null, trip_id: null,
    photo_base64: null, created_at: '2026-09-14T09:00:00Z', updated_at: '2026-09-14T09:00:00Z',
  },
  {
    id: 'I2', tenant_id: TENANT_ID, reporter_user_id: 'U8', reporter_name: 'Sunita Warden',
    category: 'student', title: 'Missed pickup', description: 'Student missed the morning bus',
    priority: 'normal', status: 'closed', vehicle_id: null, route_id: null, trip_id: null,
    photo_base64: null, created_at: '2026-09-13T09:00:00Z', updated_at: '2026-09-13T09:00:00Z',
  },
]

const ISSUE_DETAIL = {
  ...ISSUE_ROWS[0],
  notes: [{ id: 'N1', author_user_id: 'U1', author_name: 'Priya Admin', note: 'Looking into it', created_at: '2026-09-14T10:00:00Z' }],
}

function makeFetch(roles: string[], rows: unknown[] = ISSUE_ROWS, detail: unknown = ISSUE_DETAIL) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method, roles)
    if (auth) return Promise.resolve(auth)
    if (/\/staff\/issues\/[^/?]+$/.test(url)) return Promise.resolve(jsonResponse({ data: detail }))
    if (url.includes('/staff/issues')) {
      const statusMatch = url.match(/[?&]status=([^&]+)/)
      const statusFilter = statusMatch ? decodeURIComponent(statusMatch[1]) : null
      const filteredRows = statusFilter
        ? rows.filter((r) => (r as { status?: string }).status === statusFilter)
        : rows
      return Promise.resolve(jsonResponse({ data: filteredRows, next_cursor: null }))
    }
    if (/\/issues\/[^/?]+$/.test(url) && method === 'PATCH') {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      return Promise.resolve(jsonResponse({ data: { ...(detail as object), ...body } }))
    }
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  })
}

function renderScreen(roles: string[] = ['school.admin'], rows: unknown[] = ISSUE_ROWS, detail: unknown = ISSUE_DETAIL) {
  const fetchMock = makeFetch(roles, rows, detail)
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

describe('Issues tab', () => {
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

  it('lists reported issues after switching to the Issues tab', async () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    expect(screen.getByText(/squeaking on braking/i)).toBeInTheDocument()
  })

  it('re-fetches with the status query param and re-renders filtered rows when the status filter changes', async () => {
    const { fetchMock } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    expect(screen.getByText('Missed pickup')).toBeInTheDocument()

    const statusSelect = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(statusSelect, { target: { value: 'open' } })

    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes('/staff/issues?status=open'))
      expect(called).toBe(true)
    })
    await waitFor(() => expect(screen.queryByText('Missed pickup')).not.toBeInTheDocument())
    expect(screen.getByText('Brake noise')).toBeInTheDocument()
  })

  it('opens the detail drawer with vehicle context, photo absence, and the notes timeline', async () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Brake noise'))
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())
    expect(screen.getByText('BUS-01')).toBeInTheDocument()
    expect(screen.getByText('Priya Admin')).toBeInTheDocument()
    expect(screen.queryByAltText('Issue attachment')).not.toBeInTheDocument()
  })

  it('changes status via PATCH and reflects the new status', async () => {
    const { fetchMock } = renderScreen(['school.admin'])
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Brake noise'))
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())

    const statusSelects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const drawerStatusSelect = statusSelects[statusSelects.length - 1]
    fireEvent.change(drawerStatusSelect, { target: { value: 'resolved' } })

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/issues/I1') && (opts?.method ?? '') === 'PATCH'
      })
      expect(patch).toBeTruthy()
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ status: 'resolved' })
    })
  })

  it('adds a note via PATCH and clears the textarea on success', async () => {
    const { fetchMock } = renderScreen(['school.admin'])
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Brake noise'))
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())

    const textarea = screen.getByPlaceholderText(/add a note/i) as HTMLTextAreaElement
    fireEvent.input(textarea, { target: { value: 'Scheduled for tomorrow' } })
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/issues/I1') && (opts?.method ?? '') === 'PATCH'
          && JSON.parse((opts?.body as string) ?? '{}').note === 'Scheduled for tomorrow'
      })
      expect(patch).toBeTruthy()
    })
    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('hides status and note controls for a non-manager role', async () => {
    renderScreen(['school.teacher'])
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Brake noise'))
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText(/add a note/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add note/i })).not.toBeInTheDocument()
  })

  it('filters issues client-side by search term', async () => {
    const rows = [
      ...ISSUE_ROWS,
      {
        id: 'I3', tenant_id: TENANT_ID, reporter_user_id: 'U7', reporter_name: 'Anil Warden',
        category: 'safety', title: 'Loose railing', description: 'Railing near the stairwell is loose',
        priority: 'high', status: 'open', vehicle_id: null, route_id: null, trip_id: null,
        photo_base64: null, created_at: '2026-09-12T09:00:00Z', updated_at: '2026-09-12T09:00:00Z',
      },
    ]
    renderScreen(['school.admin'], rows)
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    expect(screen.getByText('Loose railing')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/search title or description/i)
    fireEvent.change(searchInput, { target: { value: 'brake' } })

    await waitFor(() => expect(screen.queryByText('Loose railing')).not.toBeInTheDocument())
    expect(screen.getByText('Brake noise')).toBeInTheDocument()
  })

  it('reverts the status select when the PATCH fails', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string; body?: unknown }) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      const method = (init?.method ?? 'GET').toUpperCase()
      const auth = authAndSchoolResponse(url, method, ['school.admin'])
      if (auth) return Promise.resolve(auth)
      if (/\/staff\/issues\/[^/?]+$/.test(url)) return Promise.resolve(jsonResponse({ data: ISSUE_DETAIL }))
      if (url.includes('/staff/issues')) return Promise.resolve(jsonResponse({ data: ISSUE_ROWS, next_cursor: null }))
      if (/\/issues\/[^/?]+$/.test(url) && method === 'PATCH') {
        return Promise.resolve(jsonResponse({ error: 'Server error' }, 500))
      }
      return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <AppProvider>
          <ToastProvider>
            <CommunicationScreen />
          </ToastProvider>
        </AppProvider>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Brake noise'))
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())

    const statusSelects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const drawerStatusSelect = statusSelects[statusSelects.length - 1]
    fireEvent.change(drawerStatusSelect, { target: { value: 'resolved' } })

    await waitFor(() => expect(drawerStatusSelect.value).toBe('open'))
  })

  it('preserves the note draft when the PATCH fails', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string; body?: unknown }) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      const method = (init?.method ?? 'GET').toUpperCase()
      const auth = authAndSchoolResponse(url, method, ['school.admin'])
      if (auth) return Promise.resolve(auth)
      if (/\/staff\/issues\/[^/?]+$/.test(url)) return Promise.resolve(jsonResponse({ data: ISSUE_DETAIL }))
      if (url.includes('/staff/issues')) return Promise.resolve(jsonResponse({ data: ISSUE_ROWS, next_cursor: null }))
      if (/\/issues\/[^/?]+$/.test(url) && method === 'PATCH') {
        return Promise.resolve(jsonResponse({ error: 'Server error' }, 500))
      }
      return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <AppProvider>
          <ToastProvider>
            <CommunicationScreen />
          </ToastProvider>
        </AppProvider>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /issues/i }))
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Brake noise'))
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())

    const textarea = screen.getByPlaceholderText(/add a note/i) as HTMLTextAreaElement
    fireEvent.input(textarea, { target: { value: 'Draft note that should survive' } })
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.some((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/issues/I1') && (opts?.method ?? '') === 'PATCH'
      })
      expect(patch).toBe(true)
    })
    expect(textarea.value).toBe('Draft note that should survive')
  })
})
