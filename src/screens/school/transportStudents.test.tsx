import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
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

function renderScreen(rows: unknown[] = [MAPPED, PENDING]) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method)
    if (auth) return Promise.resolve(auth)
    if (url.includes('/transport/students')) return Promise.resolve(jsonResponse({ data: rows, next_cursor: null }))
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <TransportStudentsScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
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
})
