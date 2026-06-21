import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { financeScreens } from './finance'

const FeesScreen = financeScreens['school.fees']

afterEach(cleanup)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((_url: string, opts?: RequestInit) => {
    if (opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: Date.now(), student_id: 'stu-1', student_name: 'Test', cls: '10A', fee_type: 'transport', amount: 1000, mode: 'UPI', ref: '', date: '01 Jan 2026' }),
      })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [], next_cursor: null }),
    })
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

  it('shows configurable fee heads, adds one, and saves', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Structure')
    // default heads render as column headers
    expect(within(container).getByText('Academic')).toBeInTheDocument()
    expect(within(container).getByText('Transport')).toBeInTheDocument()
    expect(within(container).getByText('Other')).toBeInTheDocument()
    // add a custom head
    fireEvent.change(within(container).getByPlaceholderText(/New fee head/i), { target: { value: 'Lab fee' } })
    fireEvent.click(within(container).getByText('Add fee head'))
    expect(within(container).getByText('Lab fee')).toBeInTheDocument()
    // edit an amount + save
    const firstAmount = within(container).getAllByRole('spinbutton')[0] as HTMLInputElement
    fireEvent.change(firstAmount, { target: { value: '50000' } })
    fireEvent.click(within(container).getByText('Save structure'))
    expect(within(container).getByText(/Fee structure saved/i)).toBeInTheDocument()
  })
})
