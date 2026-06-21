import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { academicsScreens } from './academics'

const AcademicsScreen = academicsScreens['school.academics']

afterEach(cleanup)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], next_cursor: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
})

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const u = render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <AcademicsScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  return { ...u, clickTab }
}

describe('Academics — teacher-created items', () => {
  it('Tests tab shows seeded teacher-created class tests with the Teacher app badge', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    expect(within(container).getByText('Unit Test — Quadratics')).toBeInTheDocument()
    expect(within(container).getAllByText('Teacher app').length).toBeGreaterThan(0)
  })

  it('admin can add a class test', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    fireEvent.click(within(container).getByText('Add test'))
    const dialog = within(container).getByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText(/Unit Test 2/i), { target: { value: 'Algebra Pop Quiz' } })
    fireEvent.click(within(dialog).getByText('Add'))
    expect(within(container).getByText('Algebra Pop Quiz')).toBeInTheDocument()
  })

  it('Homework tab shows a teacher name + source badge', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Homework')
    expect(within(container).getByText('Quadratic equations — Ex 4.3')).toBeInTheDocument()
    expect(within(container).getAllByText('Teacher app').length).toBeGreaterThan(0)
  })
})
