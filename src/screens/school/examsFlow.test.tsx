import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { examsScreens } from './exams'

const ExamsScreen = examsScreens['school.exams']

afterEach(cleanup)

function renderScreen() {
  const u = render(
    <AppProvider>
      <ToastProvider>
        <ExamsScreen />
      </ToastProvider>
    </AppProvider>,
  )
  const root = within(u.container)
  // Scope tab clicks to the tab bar: some labels (e.g. "Marks entry") also
  // appear as an exam status badge in the list.
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  return { ...u, root, clickTab }
}

describe('Exam lifecycle', () => {
  it('creates an exam and shows it in the list', () => {
    const { container } = renderScreen()
    fireEvent.click(within(container).getByText('Create exam'))
    const dialog = within(container).getByRole('dialog')
    const nameInput = within(dialog).getByPlaceholderText(/Term 2 Examination/i)
    fireEvent.change(nameInput, { target: { value: 'Quarterly Test 2026' } })
    fireEvent.click(within(dialog).getByText('Create exam'))
    expect(within(container).getByText('Quarterly Test 2026')).toBeInTheDocument()
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

  it('publishes an exam and shows the audience', () => {
    // Default role is admin (E cap only) → the modal shows the audience but
    // not the A-gated "Publish to all" button. Assert the audience render.
    const { container, root } = renderScreen()
    fireEvent.click(root.getAllByText('Publish')[0])
    const dialog = within(container).getByRole('dialog')
    expect(within(dialog).getByText('Teachers')).toBeInTheDocument()
    expect(within(dialog).getByText('Parents')).toBeInTheDocument()
    expect(within(dialog).getByText('Students')).toBeInTheDocument()
  })
})
