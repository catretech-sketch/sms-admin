import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { AiFloatingButton } from './AiFloatingButton'

/* jsdom has no PointerEvent constructor, so fireEvent.pointerDown/Move/Up never carry
   clientX/clientY through to React's handlers in this test environment. A MouseEvent
   carries clientX/clientY correctly, and React routes purely by the DOM event's `.type`
   string — so dispatching a MouseEvent typed as 'pointerdown'/'pointermove'/'pointerup'
   exercises the exact same onPointerDown/Move/Up props real browsers would call. */
function firePointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number, clientY: number) {
  fireEvent(el, new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true }))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function schoolResponse(tier: string, status = 'active') {
  return jsonResponse({
    data: [{
      id: 'school-1', name: 'Greenwood High', slug: 'greenwood', country: 'IN', status,
      plan_id: null, plan_name: tier, tier, mrr: 0, students_count: 0, staff_count: 0,
      storage_gb: 0, created: '2026-01-01', contact_name: null, contact_email: null,
      contact_phone: null, address: null, health_score: 100,
    }],
    next_cursor: null,
  })
}

function mockFetch(opts: { tier: string; isPlatform?: boolean; status?: string }) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('/auth/refresh')) return Promise.resolve(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
    if (url.includes('/auth/me')) {
      return Promise.resolve(jsonResponse({
        data: {
          id: 'u1', tenant_id: 'school-1', roles: [opts.isPlatform ? 'owner' : 'school.admin'],
          is_platform: !!opts.isPlatform,
        },
      }))
    }
    if (url.includes('/me/schools') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(schoolResponse(opts.tier, opts.status))
    if (url.includes('/students')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/attendance/period-records/summary/range')) {
      return Promise.resolve(jsonResponse({ data: { total_marked_periods: 0, present: 0, absent: 0, late: 0, leave: 0, attendance_percentage: null } }))
    }
    return Promise.resolve(jsonResponse({ data: {} }))
  })
}

function renderButton(opts: { tier: string; isPlatform?: boolean; status?: string }) {
  const fetchMock = mockFetch(opts)
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider><AiFloatingButton /></ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
  return fetchMock
}

beforeEach(() => {
  tokenStore.set({ access_token: 'a', refresh_token: 'r' })
  tokenStore.setEmail('admin@greenwood.edu')
  localStorage.removeItem('sm_ai_fab_position')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('AiFloatingButton', () => {
  it('renders the fab in the school console', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
  })

  it('does not render in the owner console', async () => {
    const fetchMock = renderButton({ tier: 'platinum', isPlatform: true })
    // Confirm session restore actually progressed (the owner console never fetches /me/schools,
    // so /auth/me completing is the real signal that consoleKind has settled) before asserting absence.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'), expect.anything(),
    ))
    expect(screen.queryByRole('button', { name: /AI Mode/i })).not.toBeInTheDocument()
  })

  it('does not render when the school is pending activation', async () => {
    const fetchMock = renderButton({ tier: 'platinum', status: 'past_due' })
    // Confirm session restore actually progressed (schools were fetched) before asserting absence.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/me/schools'), expect.anything(),
    ))
    expect(screen.queryByRole('button', { name: /AI Mode/i })).not.toBeInTheDocument()
  })

  it('opens the panel showing AiSearchScreen for a Platinum school', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
  })

  it('shows the upgrade veil instead of AiSearchScreen for a non-Platinum school', async () => {
    renderButton({ tier: 'gold' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Upgrade to Platinum/i)).toBeInTheDocument())
    expect(screen.queryByText(/Ask a question about your school/i)).not.toBeInTheDocument()
  })

  it('closes the panel when the fab is tapped again', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    expect(screen.queryByText(/Ask a question about your school/i)).not.toBeInTheDocument()
  })

  it('dragging the fab moves and persists its position without opening the panel', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    const fab = screen.getByRole('button', { name: /AI Mode/i })
    const before = fab.style.left
    firePointer(fab, 'pointerdown', 100, 100)
    firePointer(fab, 'pointermove', 160, 100)
    firePointer(fab, 'pointerup', 160, 100)
    // Some browsers still fire a click after a drag release — must not open the panel.
    fireEvent.click(fab)
    expect(screen.queryByText(/Ask a question about your school/i)).not.toBeInTheDocument()
    expect(fab.style.left).not.toBe(before)
    const saved = JSON.parse(localStorage.getItem('sm_ai_fab_position') ?? 'null')
    expect(saved).not.toBeNull()
    expect(typeof saved.x).toBe('number')
  })

  it('a plain click (no movement) still opens the panel', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    const fab = screen.getByRole('button', { name: /AI Mode/i })
    firePointer(fab, 'pointerdown', 100, 100)
    firePointer(fab, 'pointerup', 100, 100)
    fireEvent.click(fab)
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
  })

  it('clamps the fab position on window resize', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    const fab = screen.getByRole('button', { name: /AI Mode/i })
    const originalWidth = window.innerWidth
    firePointer(fab, 'pointerdown', 100, 100)
    firePointer(fab, 'pointermove', originalWidth - 10, 100)
    firePointer(fab, 'pointerup', originalWidth - 10, 100)
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 })
    fireEvent(window, new Event('resize'))
    await waitFor(() => expect(parseInt(fab.style.left, 10)).toBeLessThanOrEqual(400 - 46))
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalWidth })
  })
})
