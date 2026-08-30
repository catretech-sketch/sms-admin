import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { opsScreens } from './operations'

const CommunicationScreen = opsScreens['school.comm']

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function schoolResponse(tier: string) {
  return jsonResponse({
    data: [{
      id: 'school-1', name: 'Greenwood High', slug: 'greenwood', country: 'IN', status: 'active',
      plan_id: null, plan_name: tier, tier, mrr: 0, students_count: 0, staff_count: 0,
      storage_gb: 0, created: '2026-01-01', contact_name: null, contact_email: null,
      contact_phone: null, address: null, health_score: 100,
    }],
    next_cursor: null,
  })
}

function mockFetch(tier: string) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('/auth/refresh')) return Promise.resolve(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
    if (url.includes('/auth/me')) return Promise.resolve(jsonResponse({ data: { id: 'u1', tenant_id: 'school-1', roles: ['school.admin'], is_platform: false } }))
    if (url.includes('/me/schools') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(schoolResponse(tier))
    if (url.includes('/threads')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/complaints')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/students')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/staff')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/users')) return Promise.resolve(jsonResponse({ data: [] }))
    if (url.includes('/attendance/period-records/summary/range')) {
      return Promise.resolve(jsonResponse({ data: { total_marked_periods: 0, present: 0, absent: 0, late: 0, leave: 0, attendance_percentage: null } }))
    }
    return Promise.resolve(jsonResponse({ data: {} }))
  })
}

function renderComms(tier: string) {
  vi.stubGlobal('fetch', mockFetch(tier))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider><CommunicationScreen /></ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  tokenStore.set({ access_token: 'a', refresh_token: 'r' })
  tokenStore.setEmail('admin@greenwood.edu')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('CommunicationScreen — AI Mode', () => {
  it('toggling AI Mode on a Platinum school replaces the tabs with AiSearchScreen', async () => {
    renderComms('platinum')
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
    expect(screen.queryByText('Messenger')).not.toBeInTheDocument()
  })

  it('toggling AI Mode on a non-Platinum school shows the upgrade veil, not the screen', async () => {
    renderComms('gold')
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Upgrade to Platinum/i)).toBeInTheDocument())
    expect(screen.queryByText(/Ask a question about your school/i)).not.toBeInTheDocument()
  })

  it('toggling AI Mode off restores the normal tabs', async () => {
    renderComms('platinum')
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Exit AI Mode/i }))
    expect(screen.getByText('Messenger')).toBeInTheDocument()
  })
})
