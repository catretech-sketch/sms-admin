import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { examsScreens } from './exams'
import { exams as mockExams } from '@/data/mockDb'

const ExamsScreen = examsScreens['school.exams']

afterEach(cleanup)

// Map mock exams to wire shape (marksEntered → marks_entered_pct)
const wireExams = mockExams.map(({ marksEntered, ...rest }) => ({
  ...rest,
  marks_entered_pct: marksEntered,
}))

const wireExamSingle = { ...wireExams[0] }

function makeFetch() {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? (typeof input === 'string' ? 'GET' : (input as Request).method) ?? 'GET').toUpperCase()
    if (url.includes('/exams') && !url.match(/\/exams\/[^?]+/)) {
      // GET /exams or POST /exams (collection endpoint)
      if (method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ data: wireExamSingle }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      }
      return Promise.resolve(new Response(JSON.stringify({ data: wireExams, next_cursor: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }
    // PUT /exams/:id — return wrapped data
    return Promise.resolve(new Response(JSON.stringify({ data: wireExamSingle }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetch())
})

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const u = render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <ExamsScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
  const root = within(u.container)
  // Scope tab clicks to the tab bar: some labels (e.g. "Marks entry") also
  // appear as an exam status badge in the list.
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  return { ...u, root, clickTab }
}

describe('Exam lifecycle', () => {
  it('creates an exam and fires a POST to /exams', async () => {
    const { container } = renderScreen()
    fireEvent.click(within(container).getByText('Create exam'))
    const dialog = within(container).getByRole('dialog')
    const nameInput = within(dialog).getByPlaceholderText(/Term 2 Examination/i)
    fireEvent.change(nameInput, { target: { value: 'Quarterly Test 2026' } })
    fireEvent.click(within(dialog).getByText('Create exam'))
    await waitFor(() => {
      const fetchMock = vi.mocked(globalThis.fetch)
      const calls = fetchMock.mock.calls
      const postCall = calls.find((args) => {
        const req = args[0]
        const init = args[1] as RequestInit | undefined
        const url = typeof req === 'string' ? req : req instanceof URL ? req.href : (req as Request).url
        const method = (init?.method ?? (typeof req === 'string' ? 'GET' : (req as Request).method) ?? 'GET').toUpperCase()
        return url.includes('/exams') && method === 'POST'
      })
      expect(postCall).toBeDefined()
    })
  })

  it('renders an exam selector on the Marks entry tab', () => {
    const { root, clickTab } = renderScreen()
    clickTab('Marks entry')
    expect(root.getByText('Save marks')).toBeInTheDocument()
    expect(root.getAllByRole('combobox').length).toBeGreaterThanOrEqual(4)
  })

  it('toggles and saves exam attendance', () => {
    const { container, root, clickTab } = renderScreen()
    clickTab('Exam attendance')
    fireEvent.click(root.getAllByText('Absent')[0])
    fireEvent.click(root.getByText('Save attendance'))
    expect(within(container).getByText(/Attendance saved/i)).toBeInTheDocument()
  })

  it('publishes an exam and shows the audience', async () => {
    // Default role is admin (E cap only) → the modal shows the audience but
    // not the A-gated "Publish to all" button. Assert the audience render.
    const { container, root } = renderScreen()
    // Wait for the async exam list to load before clicking Publish
    const publishBtns = await root.findAllByText('Publish')
    fireEvent.click(publishBtns[0])
    const dialog = within(container).getByRole('dialog')
    expect(within(dialog).getByText('Teachers')).toBeInTheDocument()
    expect(within(dialog).getByText('Parents')).toBeInTheDocument()
    expect(within(dialog).getByText('Students')).toBeInTheDocument()
  })

  it('flags a duplicate subject in the datesheet and disables Save', async () => {
    const { container } = renderScreen()
    // Wait for the async exam list to load before clicking Datesheet
    const datesheetBtns = await within(container).findAllByText('Datesheet')
    // open the first exam's datesheet
    fireEvent.click(datesheetBtns[0])
    const dialog = within(container).getByRole('dialog')
    // per paper the selects are [Subject, Invigilator 1, Invigilator 2]
    const combos = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    const firstSubject = combos[0].value
    // set paper 2's subject (combos[3]) equal to paper 1's subject → duplicate
    fireEvent.change(combos[3], { target: { value: firstSubject } })
    expect(within(dialog).getByText(/allocated to two papers/i)).toBeInTheDocument()
    const saveBtn = within(dialog).getByText('Save datesheet').closest('button')
    expect(saveBtn).toBeDisabled()
  })
})
