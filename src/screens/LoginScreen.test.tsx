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
