import { useEffect, type ReactNode } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { useApp } from '@/lib/hooks'
import { ToastProvider } from '@/context/ToastProvider'
import { financeScreens } from './finance'

const FeesScreen = financeScreens['school.fees']

/* Logs in as a given demo role so role-gated actions (e.g. Principal-only
   waiver approval) can be exercised in tests. */
function LoginAs({ role, children }: { role: string; children: ReactNode }) {
  const app = useApp()
  useEffect(() => { void app.loginWithPassword(`${role}@greenwood.edu`, 'demo1234') }, [app, role])
  return <>{children}</>
}

afterEach(cleanup)

let feeHeads: Record<string, unknown>[] = []
let feeInvoices: Record<string, unknown>[] = []
let feePayments: Record<string, unknown>[] = []
let schoolIntegrations: Record<string, unknown> = {}
let razorpayOrderWire: Record<string, unknown> = { order_id: 'order_abc', amount: 36000, currency: 'INR', key_id: 'rzp_test_1' }

const wireSummary = {
  collected_today: 12000,
  collected_term: 450000,
  outstanding: 89000,
  defaulters: 12,
  billed_term: 539000,
  pct: 83,
  by_class: [{ label: 'X-A', value: 48, n: 32 }],
  by_mode: [{ label: 'UPI (manual)', value: 200000 }],
  latest_payment: {
    id: 9,
    student_id: 's1',
    student_name: 'Asha Verma',
    cls: 'X-A',
    head_id: 'h1',
    amount: 4800,
    mode: 'UPI (manual)',
    ref: 'TXN1',
    date: '01 Jun 2026',
  },
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  feeHeads = [
    { id: 'h1', name: 'Academic', code: 'ACAD', active: true, is_system: true },
    { id: 'h2', name: 'Transport', active: true },
    { id: 'h3', name: 'Other', active: true },
  ]
  feeInvoices = [
    {
      id: 'inv-1', student_id: 's1', student_name: 'Asha Verma', cls: 'X-A', grade: 'X',
      academic_year: '2025-26', term: 'Term 1', lines: [{ head_id: 'h1', head_name: 'Academic', amount: 36000 }],
      total: 36000, paid: 0, waived: 0, due: 36000, status: 'due',
    },
    {
      id: 'inv-2', student_id: 's2', student_name: 'Rohan Iyer', cls: 'X-B', grade: 'X',
      academic_year: '2025-26', term: 'Term 1', lines: [{ head_id: 'h1', head_name: 'Academic', amount: 36000 }],
      total: 36000, paid: 36000, waived: 0, due: 0, status: 'paid',
    },
  ]
  feePayments = [
    { id: 1, student_id: 's2', student_name: 'Rohan Iyer', cls: 'X-B', fee_type: 'academic', amount: 36000, mode: 'Cheque', ref: 'CHQ-1', date: '01 Jun 2026' },
    { id: 2, student_id: 's3', student_name: 'Meera Nair', cls: 'IX-A', fee_type: 'academic', amount: 36000, mode: 'Razorpay', ref: 'pay_xyz', date: '02 Jun 2026' },
  ]
  schoolIntegrations = {
    email: { enabled: false },
    sms: { enabled: false },
    razorpay: { enabled: false, key_id: '', mode: 'test', status: 'not_configured' },
  }
  razorpayOrderWire = { order_id: 'order_abc', amount: 36000, currency: 'INR', key_id: 'rzp_test_1' }

  vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'

    if (u.includes('/auth/login')) return jsonOk({ data: { access_token: 'a', refresh_token: 'r' } })
    if (u.includes('/auth/me')) return jsonOk({ data: { id: 'u1', tenant_id: null, roles: ['principal'], is_platform: false } })

    if (u.includes('/fees/heads')) {
      if (method === 'POST') {
        const body = JSON.parse((opts?.body as string) ?? '{}')
        const created = { id: `h${feeHeads.length + 1}`, name: body.name, code: body.code, active: true }
        feeHeads = [...feeHeads, created]
        return jsonOk({ data: created })
      }
      return jsonOk({ data: feeHeads, next_cursor: null })
    }

    if (u.includes('/fees/structure')) {
      if (method === 'PUT') {
        const body = JSON.parse((opts?.body as string) ?? '{}')
        return jsonOk({ data: body })
      }
      return jsonOk({ data: {} })
    }

    if (u.includes('/fees/invoices/generate')) {
      return jsonOk({ data: { created: 4 } })
    }

    if (u.includes('/razorpay/order') && method === 'POST') {
      return jsonOk({ data: razorpayOrderWire })
    }

    if (u.includes('/razorpay/verify') && method === 'POST') {
      const body = JSON.parse((opts?.body as string) ?? '{}')
      return jsonOk({ data: { id: Date.now(), student_id: 's1', student_name: 'Asha Verma', cls: 'X-A', fee_type: 'academic', amount: 36000, mode: 'Razorpay', ref: body.razorpay_payment_id ?? '', date: '01 Jan 2026' } })
    }

    if (u.includes('/pay') && method === 'POST') {
      const body = JSON.parse((opts?.body as string) ?? '{}')
      return jsonOk({ data: { id: Date.now(), student_id: body.student_id, student_name: body.student_name, cls: body.cls, head_id: body.head_id, amount: body.amount, mode: body.mode, ref: body.ref ?? '', date: '01 Jan 2026' } })
    }

    if (u.includes('/school/integrations')) {
      return jsonOk({ data: schoolIntegrations })
    }

    if (u.includes('/fees/invoices')) {
      return jsonOk({ data: feeInvoices, next_cursor: null })
    }

    if (u.includes('/fees/reports/summary')) {
      return jsonOk({ data: wireSummary })
    }

    if (u.includes('/fees/payments')) {
      return jsonOk({ data: feePayments, next_cursor: null })
    }

    return jsonOk({ data: [], next_cursor: null })
  }))
})

function renderScreen(opts: { asRole?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const body = opts.asRole ? <LoginAs role={opts.asRole}><FeesScreen /></LoginAs> : <FeesScreen />
  const u = render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          {body}
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  return { ...u, clickTab }
}

describe('Fee collection tab', () => {
  it('renders rows from useFeeInvoices, not mock students', async () => {
    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText('Asha Verma')).toBeInTheDocument()
    })
    expect(within(container).getByText('Rohan Iyer')).toBeInTheDocument()
  })

  it('shows KPIs and live cue from useFeeReportSummary (not student math)', async () => {
    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText(/Payment received/i)).toBeInTheDocument()
    })
    expect(within(container).getByText(/Asha Verma \(X-A\)/)).toBeInTheDocument()
    expect(within(container).getByText(/83% of term billed collected/)).toBeInTheDocument()
  })

  it('records a payment with a head, mode from the full offline list, and POSTs to /fees/invoices/{id}/pay', async () => {
    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText('Asha Verma')).toBeInTheDocument()
    })
    fireEvent.click(within(container).getAllByText('Record')[0])
    const dialog = within(container).getByRole('dialog')
    // fee-head options load async; wait for the default head to be selected before changing it
    await waitFor(() => { expect(within(dialog).getByDisplayValue('Academic')).toBeInTheDocument() })
    const [headSelect, modeSelect] = within(dialog).getAllByRole('combobox')
    fireEvent.change(headSelect, { target: { value: 'h2' } })
    fireEvent.change(modeSelect, { target: { value: 'Bank transfer' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))

    const fetchMock = vi.mocked(fetch)
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([url, opts]) => opts?.method === 'POST' && String(url).includes('/fees/invoices/inv-1/pay'))
      expect(postCall).toBeDefined()
      const body = JSON.parse((postCall?.[1] as RequestInit).body as string)
      expect(body).toMatchObject({ head_id: 'h2', mode: 'Bank transfer' })
    })
  })

  it('shows cheque fields only when payment mode is Cheque', async () => {
    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText('Asha Verma')).toBeInTheDocument()
    })
    fireEvent.click(within(container).getAllByText('Record')[0])
    const dialog = within(container).getByRole('dialog')
    expect(within(dialog).queryByText('Cheque number')).not.toBeInTheDocument()

    const [, modeSelect] = within(dialog).getAllByRole('combobox')
    fireEvent.change(modeSelect, { target: { value: 'Cheque' } })
    expect(within(dialog).getByText('Cheque number')).toBeInTheDocument()
  })

  it('approves a waiver via the pay endpoint with mode Adjustment / waiver', async () => {
    // Waiver approval requires `can(role, 'fees', 'A')`, granted to Principal only.
    const { container } = renderScreen({ asRole: 'principal' })
    await waitFor(() => {
      expect(within(container).getAllByText('Waiver').length).toBeGreaterThan(0)
    })
    fireEvent.click(within(container).getAllByText('Waiver')[0])
    const dialog = within(container).getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve waiver' }))

    const fetchMock = vi.mocked(fetch)
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([url, opts]) => opts?.method === 'POST' && String(url).includes('/fees/invoices/inv-1/pay'))
      expect(postCall).toBeDefined()
      const body = JSON.parse((postCall?.[1] as RequestInit).body as string)
      expect(body).toMatchObject({ mode: 'Adjustment / waiver' })
    })
  })
})

describe('Fee collection tab — school Razorpay collect', () => {
  it('hides Collect online / Send pay link when school Razorpay is not configured', async () => {
    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText('Asha Verma')).toBeInTheDocument()
    })
    expect(within(container).queryByText('Collect online')).not.toBeInTheDocument()
    expect(within(container).queryByText('Send pay link')).not.toBeInTheDocument()
  })

  it('shows Collect online / Send pay link on due rows once school Razorpay is enabled + configured', async () => {
    schoolIntegrations = { ...schoolIntegrations, razorpay: { enabled: true, key_id: 'rzp_test_1', mode: 'test', status: 'configured' } }
    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText('Collect online')).toBeInTheDocument()
    })
    expect(within(container).getByText('Send pay link')).toBeInTheDocument()
    // Rohan Iyer's invoice is fully paid (due: 0) — no online-collect actions for it.
    const rohanRow = within(container).getByText('Rohan Iyer').closest('tr') as HTMLElement
    expect(within(rohanRow).queryByText('Collect online')).not.toBeInTheDocument()
  })

  it('creates a Razorpay order, opens checkout, and verifies payment via POST /razorpay/verify on success', async () => {
    schoolIntegrations = { ...schoolIntegrations, razorpay: { enabled: true, key_id: 'rzp_test_1', mode: 'test', status: 'configured' } }
    type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
    let capturedHandler: ((r: CheckoutResponse) => void) | null = null
    const openMock = vi.fn()
    const RazorpayCtor = vi.fn((opts: Record<string, unknown>) => {
      capturedHandler = opts.handler as (r: CheckoutResponse) => void
      return { open: openMock }
    })
    vi.stubGlobal('Razorpay', RazorpayCtor)

    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText('Collect online')).toBeInTheDocument()
    })
    fireEvent.click(within(container).getByText('Collect online'))

    const fetchMock = vi.mocked(fetch)
    await waitFor(() => {
      const orderCall = fetchMock.mock.calls.find(([url, o]) => o?.method === 'POST' && String(url).includes('/fees/invoices/inv-1/razorpay/order'))
      expect(orderCall).toBeDefined()
    })
    await waitFor(() => { expect(openMock).toHaveBeenCalled() })
    expect(RazorpayCtor).toHaveBeenCalledWith(expect.objectContaining({ key: 'rzp_test_1', order_id: 'order_abc' }))

    capturedHandler!({ razorpay_order_id: 'order_abc', razorpay_payment_id: 'pay_123', razorpay_signature: 'sig_1' })

    await waitFor(() => {
      const verifyCall = fetchMock.mock.calls.find(([url, o]) => o?.method === 'POST' && String(url).includes('/fees/invoices/inv-1/razorpay/verify'))
      expect(verifyCall).toBeDefined()
      const body = JSON.parse((verifyCall?.[1] as RequestInit).body as string)
      expect(body).toMatchObject({ razorpay_order_id: 'order_abc', razorpay_payment_id: 'pay_123', razorpay_signature: 'sig_1' })
    })
    await waitFor(() => {
      expect(within(container).getByText(/paid online via Razorpay/i)).toBeInTheDocument()
    })
  })

  it('copies the pay link to the clipboard when the order includes one', async () => {
    schoolIntegrations = { ...schoolIntegrations, razorpay: { enabled: true, key_id: 'rzp_test_1', mode: 'test', status: 'configured' } }
    razorpayOrderWire = { ...razorpayOrderWire, pay_link: 'https://rzp.io/l/abc123' }
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText('Send pay link')).toBeInTheDocument()
    })
    fireEvent.click(within(container).getByText('Send pay link'))

    await waitFor(() => { expect(writeText).toHaveBeenCalledWith('https://rzp.io/l/abc123') })
    await waitFor(() => {
      expect(within(container).getByText(/Pay link copied/i)).toBeInTheDocument()
    })
  })
})

describe('Fee collection history', () => {
  it('filters payment history by mode, including Razorpay', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('History')

    await waitFor(() => {
      expect(within(container).getByText('Rohan Iyer')).toBeInTheDocument()
    })
    expect(within(container).getByText('Meera Nair')).toBeInTheDocument()

    const modeSelect = within(container).getByDisplayValue('All modes')
    fireEvent.change(modeSelect, { target: { value: 'Razorpay' } })

    expect(within(container).queryByText('Rohan Iyer')).not.toBeInTheDocument()
    expect(within(container).getByText('Meera Nair')).toBeInTheDocument()
  })
})

describe('Fee structure', () => {
  it('shows fee heads from the API, adds one, and saves the structure', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Structure')

    // default heads render from GET /fees/heads
    await waitFor(() => {
      expect(within(container).getByText('Academic')).toBeInTheDocument()
    })
    expect(within(container).getByText('Transport')).toBeInTheDocument()
    expect(within(container).getByText('Other')).toBeInTheDocument()

    // add a custom head via useCreateFeeHead → POST /fees/heads
    fireEvent.change(within(container).getByPlaceholderText(/New fee head/i), { target: { value: 'Lab fee' } })
    fireEvent.click(within(container).getByText('Add fee head'))
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch)
      const postCall = fetchMock.mock.calls.find(([url, opts]) => opts?.method === 'POST' && String(url).includes('/fees/heads'))
      expect(postCall).toBeDefined()
    })
    await waitFor(() => {
      expect(within(container).getByText('Lab fee')).toBeInTheDocument()
    })

    // edit an amount + save → PUT /fees/structure
    const firstAmount = within(container).getAllByRole('spinbutton')[0] as HTMLInputElement
    fireEvent.change(firstAmount, { target: { value: '50000' } })
    fireEvent.click(within(container).getByText('Save structure'))

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch)
      const putCall = fetchMock.mock.calls.find(([url, opts]) => opts?.method === 'PUT' && String(url).includes('/fees/structure'))
      expect(putCall).toBeDefined()
    })
    await waitFor(() => {
      expect(within(container).getByText(/Fee structure saved/i)).toBeInTheDocument()
    })
  })

  it('generates invoices for the selected academic year, term and grades', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Structure')

    await waitFor(() => {
      expect(within(container).getByText('Academic')).toBeInTheDocument()
    })

    fireEvent.change(within(container).getByPlaceholderText(/2026-27/i), { target: { value: '2026-27' } })
    fireEvent.click(within(container).getByRole('group', { name: 'Select grades' }).children[0])
    fireEvent.click(within(container).getByRole('button', { name: 'Generate invoices' }))

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch)
      const postCall = fetchMock.mock.calls.find(([url, opts]) => opts?.method === 'POST' && String(url).includes('/fees/invoices/generate'))
      expect(postCall).toBeDefined()
      const body = JSON.parse((postCall?.[1] as RequestInit).body as string)
      expect(body).toMatchObject({ academic_year: '2026-27' })
      expect(Array.isArray(body.grades)).toBe(true)
      expect(body.grades.length).toBeGreaterThan(0)
    })
    await waitFor(() => {
      expect(within(container).getByText(/Invoices generated/i)).toBeInTheDocument()
    })
  })
})
