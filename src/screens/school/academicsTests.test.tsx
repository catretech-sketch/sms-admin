import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { __resetTimetablePublishMemoryForTests } from '@/lib/academicsPublish'
import { __resetClassSubjectsMemoryForTests } from '@/api/classSubjects'
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

function mockFetch(url: string, init?: RequestInit): Response {
  const u = typeof url === 'string' ? url : String(url)
  const ok = { status: 200, headers: { 'Content-Type': 'application/json' } }
  if (u.includes('/class-tests') && (init?.method ?? 'GET').toUpperCase() === 'PUT') {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    return new Response(jsonBody({
      data: {
        draft_json: body.draft_json ?? JSON.stringify(DEMO_TESTS),
        published_json: body.published_json ?? JSON.stringify(DEMO_TESTS),
        draft_saved_at: body.draft_saved_at ?? '2026-06-01T00:00:00Z',
        published_at: body.published_at ?? '2026-06-01T00:00:00Z',
      },
    }), ok)
  }
  if (/\/classes\/[^/]+\/subjects/.test(u)) {
    if (u.includes('/c1/')) {
      return new Response(jsonBody({ data: [{ name: 'Mathematics' }, { name: 'Science' }] }), ok)
    }
    if (u.includes('/c2/')) {
      return new Response(jsonBody({ data: [{ name: 'English' }] }), ok)
    }
    return new Response(jsonBody({ data: [] }), ok)
  }
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
      data: [
        { id: 'c1', name: 'IX-A', grade: 'IX', section: 'A', teacher_id: 't1', students: 30, room: '1' },
        { id: 'c2', name: 'IX-B', grade: 'IX', section: 'B', teacher_id: 't1', students: 28, room: '2' },
      ],
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
      data: [
        { id: 's1', name: 'Mathematics' },
        { id: 's2', name: 'English' },
        { id: 's3', name: 'Hindi' },
      ],
      next_cursor: null,
    }), ok)
  }
  if (u.includes('/academic-periods')) {
    return new Response(jsonBody({
      data: {
        draft_json: null,
        published_json: null,
        draft_saved_at: null,
        published_at: null,
      },
    }), ok)
  }
  if (u.includes('/class-tests')) {
    return new Response(jsonBody({
      data: {
        draft_json: JSON.stringify(DEMO_TESTS),
        published_json: JSON.stringify(DEMO_TESTS),
        draft_saved_at: '2026-06-01T00:00:00Z',
        published_at: '2026-06-01T00:00:00Z',
      },
    }), ok)
  }
  return new Response(jsonBody({ data: [], next_cursor: null }), ok)
}

beforeEach(() => {
  __resetTimetablePublishMemoryForTests()
  __resetClassSubjectsMemoryForTests()
  localStorage.setItem('sms_academics_pub:default:tests', JSON.stringify({
    draft: DEMO_TESTS,
    published: DEMO_TESTS,
    draftSavedAt: '2026-06-01T00:00:00Z',
    publishedAt: '2026-06-01T00:00:00Z',
  }))
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => Promise.resolve(mockFetch(url, init))))
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
  it('Tests tab shows seeded teacher-created class tests with the Teacher app badge', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    expect(await within(container).findByText('Unit Test — Quadratics')).toBeInTheDocument()
    expect(within(container).getAllByText('Teacher app').length).toBeGreaterThan(0)
  }, 15_000)

  it('Add class test Class dropdown lists live classes from GET /classes', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    await within(container).findByText('Unit Test — Quadratics')
    fireEvent.click(within(container).getByText('Add test'))
    const dialog = within(container).getByRole('dialog')
    const classField = within(dialog).getByText('Class').closest('.sm-field') as HTMLElement
    await waitFor(() => {
      expect(within(classField).getByRole('option', { name: 'IX-A' })).toBeInTheDocument()
    })
    expect(within(classField).getByRole('combobox')).toHaveValue('IX-A')
  }, 15_000)

  it('Add class test Subject dropdown lists only subjects mapped to the selected class', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    await within(container).findByText('Unit Test — Quadratics')
    fireEvent.click(within(container).getByText('Add test'))
    const dialog = within(container).getByRole('dialog')
    const classField = within(dialog).getByText('Class').closest('.sm-field') as HTMLElement
    const subjectField = within(dialog).getByText('Subject').closest('.sm-field') as HTMLElement
    await waitFor(() => {
      expect(within(classField).getByRole('combobox')).toHaveValue('IX-A')
    })
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/classes/c1/subjects'))).toBe(true)
    })
    await waitFor(() => {
      expect(within(subjectField).getByRole('option', { name: 'Mathematics' })).toBeInTheDocument()
      expect(within(subjectField).getByRole('option', { name: 'Science' })).toBeInTheDocument()
    })
    expect(within(subjectField).queryByRole('option', { name: 'Hindi' })).not.toBeInTheDocument()
    expect(within(subjectField).queryByRole('option', { name: 'English' })).not.toBeInTheDocument()

    fireEvent.change(within(classField).getByRole('combobox'), { target: { value: 'IX-B' } })
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/classes/c2/subjects'))).toBe(true)
    })
    await waitFor(() => {
      expect(within(subjectField).getByRole('option', { name: 'English' })).toBeInTheDocument()
    })
    expect(within(subjectField).queryByRole('option', { name: 'Mathematics' })).not.toBeInTheDocument()
    expect(within(subjectField).queryByRole('option', { name: 'Science' })).not.toBeInTheDocument()
    expect(within(subjectField).queryByRole('option', { name: 'Hindi' })).not.toBeInTheDocument()
  }, 15_000)

  it('admin can add a class test and persist it through PUT /class-tests', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    await within(container).findByText('Unit Test — Quadratics')
    fireEvent.click(within(container).getByText('Add test'))
    const dialog = within(container).getByRole('dialog')
    const classField = within(dialog).getByText('Class').closest('.sm-field') as HTMLElement
    await waitFor(() => {
      expect(within(classField).getByRole('option', { name: 'IX-A' })).toBeInTheDocument()
    })
    fireEvent.change(within(dialog).getByPlaceholderText(/Unit Test 2/i), { target: { value: 'Algebra Pop Quiz' } })
    fireEvent.click(within(dialog).getByText('Add'))
    expect(await within(container).findByText('Algebra Pop Quiz')).toBeInTheDocument()
    await waitFor(() => {
      const put = vi.mocked(fetch).mock.calls.find(([url, init]) =>
        String(url).includes('/class-tests') && (init as RequestInit | undefined)?.method === 'PUT')
      expect(put).toBeTruthy()
      const body = JSON.parse((put![1] as RequestInit).body as string) as { draft_json?: string }
      expect(body.draft_json).toContain('Algebra Pop Quiz')
      expect(body.draft_json).toContain('IX-A')
    })
  }, 15_000)

  it('Homework tab shows live API homework with the Teacher app badge', async () => {
    const { container, clickTab } = renderScreen()
    clickTab('Homework')
    expect(await within(container).findByText('Quadratic equations — Ex 4.3')).toBeInTheDocument()
    expect(within(container).getAllByText('Teacher app').length).toBeGreaterThan(0)
  }, 15_000)
})
