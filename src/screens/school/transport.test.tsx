import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { transportScreens } from './transport'

const TransportBusesScreen = transportScreens['school.transport.buses']
const TransportDashboardScreen = transportScreens['school.transport']

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

const BUSES = [{
  bus_id: 'b1', bus_no: 'Bus 01', route_id: 'r1', route_name: 'Route 5',
  stop_count: 1, students_assigned: 1, capacity: 40,
}]

function makeFetch(roles: string[]) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method, roles)
    if (auth) return Promise.resolve(auth)
    if (url.includes('/transport/buses')) return Promise.resolve(jsonResponse({ data: BUSES }))
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  })
}

function renderScreen(roles: string[]) {
  vi.stubGlobal('fetch', makeFetch(roles))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <TransportBusesScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

function renderDashboard(roles: string[]) {
  vi.stubGlobal('fetch', makeFetch(roles))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <TransportDashboardScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

describe('Transport role gating', () => {
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

  it('shows Add bus and the row Edit action for admin (operations.E)', async () => {
    renderScreen(['school.admin'])
    await waitFor(() => expect(screen.getByText('Bus 01')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /add bus/i })).toBeInTheDocument()
    expect(screen.getByTitle('Edit')).toBeInTheDocument()
  })

  it('hides Add bus and the row Edit action for principal (operations.V only)', async () => {
    renderScreen(['school.principal'])
    await waitFor(() => expect(screen.getByText('Bus 01')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /add bus/i })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
  })

  it('shows the dashboard bus row Edit button for admin (operations.E)', async () => {
    renderDashboard(['school.admin'])
    await waitFor(() => expect(screen.getByText('Bus 01')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
  })

  it('hides the dashboard bus row Edit button for principal (operations.V only)', async () => {
    renderDashboard(['school.principal'])
    await waitFor(() => expect(screen.getByText('Bus 01')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
  })
})
