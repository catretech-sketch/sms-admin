import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { TransportStudentsScreen } from './transportStudents'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const MAPPED = {
  student_id: 's1', student_name: 'Rahul Sharma', admission_no: 'A1', grade: '5', section: 'A',
  fee_head_id: 'fh1', fee_head_name: 'Transport', route_id: 'r1', route_name: 'Route 5',
  stop_id: 'st1', stop_name: 'Shastri Nagar', bus_id: 'b1', bus_no: 'Bus 01', driver: 'Ramesh',
  conductor_name: 'Suresh', capacity: 40, bus_occupied: 40, mapping_status: 'mapped',
}
const PENDING = {
  ...MAPPED, student_id: 's2', student_name: 'Priya Singh', bus_id: null, bus_no: null,
  driver: null, conductor_name: null, bus_occupied: 0, mapping_status: 'pending',
}

/* Like studentAdd.test.tsx's "Transport section" describe block: useTransportStudentsList
 * (via useOperationsTier) is gated behind the 'operations' feature, which requires the
 * Platinum tier. AppProvider only resolves plan=Platinum from a live tenant fetched via
 * /me/schools during session restore — so seed a resumable session and answer
 * /auth/refresh + /auth/me + /me/schools with a Platinum-tier school. */
const TENANT_ID = 'school-1'

function authAndSchoolResponse(url: string, method: string): Response | null {
  if (url.includes('/auth/refresh')) {
    return jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })
  }
  if (url.includes('/auth/me')) {
    return jsonResponse({ data: { id: 'u1', tenant_id: TENANT_ID, roles: ['school.admin'], is_platform: false } })
  }
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

const ROUTES = [{ id: 'r1', name: 'Route 5', stops: 1 }]
const STOPS_R1 = [{ id: 'st1', route_id: 'r1', name: 'Shastri Nagar', sequence: 1 }]
/* Two buses on different routes — used to verify the manual-assign picker is scoped
 * to the pending student's own route (r1), not the full fleet. */
const BUSES = [
  { bus_id: 'b1', bus_no: 'Bus 01', route_id: 'r1', stop_count: 1, students_assigned: 1 },
  { bus_id: 'b2', bus_no: 'Bus 02', route_id: 'r2', stop_count: 1, students_assigned: 0 },
]

function makeFetch(rows: unknown[]) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method)
    if (auth) return Promise.resolve(auth)
    if (url.includes('/transport/routes/r1/stops')) return Promise.resolve(jsonResponse({ data: STOPS_R1 }))
    if (url.includes('/transport/routes')) return Promise.resolve(jsonResponse({ data: ROUTES }))
    if (url.includes('/transport/buses/') && method === 'PUT') return Promise.resolve(jsonResponse({ data: null }))
    if (url.includes('/transport/buses')) return Promise.resolve(jsonResponse({ data: BUSES }))
    if (url.includes('/transport/students')) return Promise.resolve(jsonResponse({ data: rows, next_cursor: null }))
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  })
}

function renderScreen(rows: unknown[] = [MAPPED, PENDING]) {
  const fetchMock = makeFetch(rows)
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <TransportStudentsScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
  return { ...utils, fetchMock }
}

describe('Transport Students list', () => {
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

  it('shows mapped and pending students with their status', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getByText('Rahul Sharma')).toBeInTheDocument())
    expect(screen.getByText('Priya Singh')).toBeInTheDocument()
    expect(screen.getByText(/pending bus assignment/i)).toBeInTheDocument()
  })

  it('offers Retry auto-assignment and Select bus manually for a pending row', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getByText('Priya Singh')).toBeInTheDocument())
    const row = screen.getByText('Priya Singh').closest('tr')!
    expect(within(row).getByRole('button', { name: /retry auto-assignment/i })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /select bus manually/i })).toBeInTheDocument()
  })

  it('populates the Stop filter from the selected route and gates it until a route is chosen', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getByText('Rahul Sharma')).toBeInTheDocument())
    // "Route"/"Stop" also appear as table column headers, so pick the <label> version (inside .sm-field).
    const fieldByLabel = (label: string) =>
      screen.getAllByText(label).find((el) => el.closest('.sm-field'))!.closest('.sm-field') as HTMLElement
    const stopSelect = within(fieldByLabel('Stop')).getByRole('combobox') as HTMLSelectElement
    expect(stopSelect).toBeDisabled()
    const routeSelect = within(fieldByLabel('Route')).getByRole('combobox') as HTMLSelectElement
    fireEvent.change(routeSelect, { target: { value: 'r1' } })
    await waitFor(() => expect(stopSelect).not.toBeDisabled())
    await waitFor(() =>
      expect(Array.from(stopSelect.querySelectorAll('option')).some((o) => (o as HTMLOptionElement).value === 'st1')).toBe(true),
    )
  })

  it('scopes the manual-assign bus picker to the pending student route and refreshes the list on confirm', async () => {
    const { fetchMock } = renderScreen()
    await waitFor(() => expect(screen.getByText('Priya Singh')).toBeInTheDocument())
    const row = screen.getByText('Priya Singh').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: /select bus manually/i }))

    const busSelect = await waitFor(() => within(row).getByRole('combobox') as HTMLSelectElement)
    const optionValues = Array.from(busSelect.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value)
    expect(optionValues).toContain('b1')
    expect(optionValues).not.toContain('b2') // Bus 02 serves a different route than the pending student

    const studentsCallsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/transport/students')).length

    fireEvent.change(busSelect, { target: { value: 'b1' } })
    fireEvent.click(within(row).getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      const assign = fetchMock.mock.calls.find((c) => {
        const url = String(c[0])
        const method = ((c[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase()
        return url.includes('/transport/buses/b1/students/s2') && method === 'PUT'
      })
      expect(assign).toBeTruthy()
    })

    // The manual-assign success handler must invalidate the students list so it refetches
    // with the newly-assigned bus, rather than leaving the row showing stale "pending" data.
    await waitFor(() => {
      const studentsCallsAfter = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/transport/students')).length
      expect(studentsCallsAfter).toBeGreaterThan(studentsCallsBefore)
    })
  })

  it('resets the selected bus when opening the manual picker for a different pending student', async () => {
    // Two pending students on different routes so their bus option lists differ visibly.
    const PENDING_A = { ...PENDING, student_id: 's2', student_name: 'Priya Singh', route_id: 'r1' }
    const PENDING_B = {
      ...PENDING, student_id: 's3', student_name: 'Amit Kumar', route_id: 'r2', route_name: 'Route 9',
    }
    renderScreen([MAPPED, PENDING_A, PENDING_B])
    await waitFor(() => expect(screen.getByText('Priya Singh')).toBeInTheDocument())
    expect(screen.getByText('Amit Kumar')).toBeInTheDocument()

    const rowA = screen.getByText('Priya Singh').closest('tr')!
    fireEvent.click(within(rowA).getByRole('button', { name: /select bus manually/i }))
    const busSelectA = await waitFor(() => within(rowA).getByRole('combobox') as HTMLSelectElement)
    fireEvent.change(busSelectA, { target: { value: 'b1' } })
    expect(busSelectA.value).toBe('b1')

    const rowB = screen.getByText('Amit Kumar').closest('tr')!
    fireEvent.click(within(rowB).getByRole('button', { name: /select bus manually/i }))
    const busSelectB = await waitFor(() => within(rowB).getByRole('combobox') as HTMLSelectElement)
    // Stale state from student A must not carry over — B's picker starts unset.
    expect(busSelectB.value).toBe('')
  })
})
