import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { financeScreens } from './finance'

const FeesScreen = financeScreens['school.fees']

afterEach(cleanup)

let feeHeads: Record<string, unknown>[] = []

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  feeHeads = [
    { id: 'h1', name: 'Academic', code: 'ACAD', active: true, is_system: true },
    { id: 'h2', name: 'Transport', active: true },
    { id: 'h3', name: 'Other', active: true },
  ]
  vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'

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

    if (u.includes('/fees/invoices') && method === 'POST') {
      return jsonOk({ data: { id: Date.now(), student_id: 'stu-1', student_name: 'Test', cls: '10A', fee_type: 'transport', amount: 1000, mode: 'UPI', ref: '', date: '01 Jan 2026' } })
    }

    return jsonOk({ data: [], next_cursor: null })
  }))
})

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const u = render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <FeesScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  return { ...u, clickTab }
}

describe('Fee collection history', () => {
  it('records a payment with a fee type and POSTs to /fees/invoices', async () => {
    const { container } = renderScreen()
    fireEvent.click(within(container).getAllByText('Record')[0])
    const dialog = within(container).getByRole('dialog')
    // first combobox in the modal is the Fee type select
    const typeSelect = within(dialog).getAllByRole('combobox')[0]
    fireEvent.change(typeSelect, { target: { value: 'transport' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    const fetchMock = vi.mocked(fetch)
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([url, opts]) => opts?.method === 'POST' && String(url).includes('/fees/invoices'))
      expect(postCall).toBeDefined()
    })
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
