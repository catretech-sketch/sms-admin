import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

const ISSUE_ROWS = [{
  id: 'I1', tenant_id: TENANT_ID, reporter_user_id: 'U9', reporter_name: 'Ramesh Driver',
  category: 'vehicle', title: 'Brake noise', description: 'Squeaking on braking',
  priority: 'high', status: 'open', vehicle_id: 'BUS-01', route_id: null, trip_id: null,
  photo_base64: null, created_at: '2026-09-14T09:00:00Z', updated_at: '2026-09-14T09:00:00Z',
}]

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
    if (url.includes('/staff/issues')) return Promise.resolve(jsonResponse({ data: rows, next_cursor: null }))
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
    screen.getByRole('button', { name: /issues/i }).click()
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    expect(screen.getByText(/squeaking on braking/i)).toBeInTheDocument()
  })

  it('re-fetches with the status query param when the status filter changes', async () => {
    const { fetchMock } = renderScreen()
    screen.getByRole('button', { name: /issues/i }).click()
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    const statusSelect = screen.getByRole('combobox') as HTMLSelectElement
    statusSelect.value = 'open'
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes('/staff/issues?status=open'))
      expect(called).toBe(true)
    })
  })
})
