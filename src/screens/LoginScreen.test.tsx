import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from './LoginScreen'
import { AppProvider } from '@/context/AppProvider'
import { tokenStore } from '@/api/auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

const renderLogin = () => render(<AppProvider><LoginScreen /></AppProvider>)

describe('LoginScreen', () => {
  it('requests an OTP from the API when the user submits an identifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /OTP login/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /Send one-time code/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/otp/request')
    expect(await screen.findByText(/Enter the 6-digit code/i)).toBeInTheDocument()
  })

  it('shows the API error message when password sign-in fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_credentials', message: 'Wrong email or password.' } }, 401)))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /^Sign in/i }))
    expect(await screen.findByText('Wrong email or password.')).toBeInTheDocument()
  })
})

describe('LoginScreen password reset', () => {
  it('opens the reset panel from the Forgot password link', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByText(/Reset your password/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/you@school.edu or/i)).toBeInTheDocument()
  })

  it('advances to the code step even when the account is unknown (anti-enumeration)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'not_found', message: 'No such user' } }, 404)))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'ghost@nowhere.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    expect(await screen.findByText(/we've sent a 6-digit code/i)).toBeInTheDocument()
  })

  it('keeps the user on the code step when the code is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_otp', message: 'That code is incorrect.' } }, 400)))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    expect(await screen.findByText('That code is incorrect.')).toBeInTheDocument()
  })

  it('blocks a too-short password without calling set-password', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    await userEvent.type(await screen.findByPlaceholderText(/at least 8 characters/i), 'short')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'short')
    await userEvent.click(screen.getByRole('button', { name: /set password & sign in/i }))
    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2) // request + verify only; no set-password
  })

  it('sets the new password then loads the session on the happy path', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))                            // otp/request
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })) // otp/verify
      .mockResolvedValueOnce(new Response(null, { status: 204 }))                               // set-password
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['admin'] } })) // /auth/me
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    await userEvent.type(await screen.findByPlaceholderText(/at least 8 characters/i), 'newpass123')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'newpass123')
    await userEvent.click(screen.getByRole('button', { name: /set password & sign in/i }))
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(urls.some((u) => u.includes('/auth/set-password'))).toBe(true)
      expect(urls.some((u) => u.includes('/auth/me'))).toBe(true)
    })
  })
})
