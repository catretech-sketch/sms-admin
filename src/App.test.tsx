import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from './App'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/* Demo-chip sign-in now performs a real password login: POST /auth/login then GET /auth/me.
   Mock both so a chip click lands the user in the app. */
function mockAuth(roles: string[] = ['admin'], tenantId: string | null = 't1') {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/auth/me')) return jsonResponse({ data: { id: 'u1', tenant_id: tenantId, roles } })
    return jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })
  }))
}

describe('App (smoke)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('shows the login screen first', () => {
    render(<App />)
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
  })

  it('owner demo account lands in the owner console', async () => {
    mockAuth()
    render(<App />)
    fireEvent.click(screen.getByText('Anil Mehta'))
    expect(await screen.findByText('Portfolio overview')).toBeInTheDocument()
    const sidebar = document.querySelector('.sm-sidebar') as HTMLElement
    expect(within(sidebar).getByText('Schools')).toBeInTheDocument()
  })

  it('school admin lands in the school console with dashboard nav', async () => {
    mockAuth()
    render(<App />)
    fireEvent.click(screen.getByText('Ravi Menon'))
    const sidebar = (await screen.findByRole('complementary')) as HTMLElement
    expect(within(sidebar).getByText('Dashboard')).toBeInTheDocument()
    expect(within(sidebar).getByText('Students (SIS)')).toBeInTheDocument()
  })

  it('theme toggle flips data-theme', async () => {
    mockAuth()
    render(<App />)
    fireEvent.click(screen.getByText('Ravi Menon'))
    const toggle = await screen.findByLabelText('Toggle theme')
    const before = document.documentElement.getAttribute('data-theme')
    fireEvent.click(toggle)
    const after = document.documentElement.getAttribute('data-theme')
    expect(after).not.toBe(before)
  })
})
