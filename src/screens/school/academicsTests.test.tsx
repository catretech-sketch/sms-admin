import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { academicsScreens } from './academics'

const AcademicsScreen = academicsScreens['school.academics']

afterEach(cleanup)

const DEMO_TESTS = [{
  id: 1,
  cls: 'IX-A',
  subject: 'Mathematics',
  title: 'Unit Test — Quadratics',
  date: '2026-06-16',
  maxMarks: 25,
  teacher: 'Meera Krishnan',
  source: 'teacher_app' as const,
  status: 'Scheduled' as const,
}]

function jsonBody(data: unknown) {
  return JSON.stringify(data)
}

function mockFetch(url: string): Response {
  const u = typeof url === 'string' ? url : String(url)
  const ok = { status: 200, headers: { 'Content-Type': 'application/json' } }
  if (u.includes('/assignments')) {
    return new Response(jsonBody({
      data: [{
        id: 'hw1',
        title: 'Quadratic equations — Ex 4.3',
        class_name: 'IX-A',
        subject: 'Mathematics',
        due_date: '2026-06-12T00:00:00Z',
        status: 'active',
        submissions_count: 0,
        total_students: 30,
      }],
    }), ok)
  }
  if (u.includes('/classes')) {
    return new Response(jsonBody({
      data: [{ id: 'c1', name: 'IX-A', grade: 'IX', section: 'A', teacher_id: 't1', students: 30, room: '1' }],
      next_cursor: null,
    }), ok)
  }
  if (u.includes('/teachers')) {
    return new Response(jsonBody({
      data: [{ id: 't1', name: 'Meera Krishnan' }],
      next_cursor: null,
    }), ok)
  }
  if (u.includes('/subjects')) {
    return new Response(jsonBody({
      data: [{ id: 's1', name: 'Mathematics' }],
      next_cursor: null,
    }), ok)
  }
  return new Response(jsonBody({ data: [], next_cursor: null }), ok)
}

beforeEach(() => {
  localStorage.setItem('sms_academics_pub:default:tests', JSON.stringify({
    draft: DEMO_TESTS,
    published: DEMO_TESTS,
    draftSavedAt: '2026-06-01T00:00:00Z',
    publishedAt: '2026-06-01T00:00:00Z',
  }))
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(mockFetch(url))))
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

  it('admin can add a class test', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    await within(container).findByText('Unit Test — Quadratics')
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('/classes'), expect.anything()))
    fireEvent.click(within(container).getByText('Add test'))
    const dialog = within(container).getByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText(/Unit Test 2/i), { target: { value: 'Algebra Pop Quiz' } })
    fireEvent.click(within(dialog).getByText('Add'))
    expect(await within(container).findByText('Algebra Pop Quiz')).toBeInTheDocument()
  })

  it('Homework tab shows live API homework with the Teacher app badge', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Homework')
    expect(await within(container).findByText('Quadratic equations — Ex 4.3')).toBeInTheDocument()
    expect(within(container).getAllByText('Teacher app').length).toBeGreaterThan(0)
  })
})
