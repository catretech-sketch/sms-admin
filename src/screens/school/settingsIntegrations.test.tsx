import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { ThemeProvider } from '@/context/ThemeProvider'
import { adminScreens } from './admin'
import type { SchoolIntegrations } from '@/types'

const SettingsScreen = adminScreens['school.settings']

const mockIntegrations: SchoolIntegrations = {
  email: { enabled: true, fromName: 'Riverdale', fromAddress: 'fees@riverdale.edu' },
  sms: { enabled: false, senderId: 'RIVDAL' },
  razorpay: {
    enabled: true, keyId: 'rzp_test_abc', mode: 'test', status: 'configured',
    keySecretSet: true, webhookSecretSet: false,
  },
}

const getSchoolIntegrations = vi.fn(async () => mockIntegrations)
const saveSchoolIntegrations = vi.fn(async () => mockIntegrations)
const verifySchoolRazorpay = vi.fn(async () => ({ status: 'configured' as const }))

vi.mock('@/api/schoolIntegrations', () => ({
  getSchoolIntegrations: (...args: unknown[]) => getSchoolIntegrations(...(args as [])),
  saveSchoolIntegrations: (...args: unknown[]) => saveSchoolIntegrations(...(args as [SchoolIntegrations])),
  verifySchoolRazorpay: (...args: unknown[]) => verifySchoolRazorpay(...(args as [])),
}))

afterEach(cleanup)

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ThemeProvider>
          <AppProvider>
            <SettingsScreen />
          </AppProvider>
        </ThemeProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('Settings — Integrations card', () => {
  it('loads and shows Email/SMS/Razorpay values without echoing the secret', async () => {
    const { container } = renderScreen()
    await waitFor(() => expect(within(container).getByDisplayValue('Riverdale')).toBeInTheDocument())
    expect(within(container).getByDisplayValue('rzp_test_abc')).toBeInTheDocument()
    expect(within(container).getByPlaceholderText('•••• (set)')).toBeInTheDocument()
    expect(within(container).getByText('Connected')).toBeInTheDocument()
  })

  it('saves without sending empty secret fields', async () => {
    const { container } = renderScreen()
    await waitFor(() => expect(within(container).getByDisplayValue('Riverdale')).toBeInTheDocument())

    fireEvent.change(within(container).getByDisplayValue('Riverdale'), { target: { value: 'Riverdale School' } })
    fireEvent.click(within(container).getByText('Save integrations'))

    await waitFor(() => expect(saveSchoolIntegrations).toHaveBeenCalled())
    const payload = saveSchoolIntegrations.mock.calls[0][0]
    expect(payload.email.fromName).toBe('Riverdale School')
    expect(payload.razorpay.keySecret).toBeUndefined()
    expect(payload.razorpay.webhookSecret).toBeUndefined()
  })

  it('tests the Razorpay connection', async () => {
    const { container } = renderScreen()
    await waitFor(() => expect(within(container).getByDisplayValue('Riverdale')).toBeInTheDocument())
    fireEvent.click(within(container).getByText('Test connection'))
    await waitFor(() => expect(verifySchoolRazorpay).toHaveBeenCalled())
  })
})
