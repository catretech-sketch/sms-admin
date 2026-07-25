import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider, useApp } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { studentAddScreens } from './studentAdd'

const AddStudentScreen = studentAddScreens['school.sis.add']

/* Surfaces roster size + current view so assertions can observe the
   effect of a save without reaching into provider internals. */
function Probe() {
  const app = useApp()
  return <div data-testid="probe">{app.students.length}|{app.view}</div>
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const STUDENT_ROW = {
  id: 'srv', admission_no: 'A1', class_label: 'VIII-A', name: 'X',
  gender: 'M', grade: 'VIII', section: 'A', roll: 1, guardian_name: 'Test Father',
  guardian_phone: '9876543210', attendance_pct: 0, fee_status: 'due', fee_due: 0,
  status: 'active', house: 'Ruby', avatar_hue: 1,
}

/* Endpoint/method-aware fetch stub. Returns a *fresh* Response per call (a Response
   body can only be read once). List GETs return array envelopes so roster queries
   don't crash; the create POST returns the single created row. */
function makeFetch() {
  return vi.fn().mockImplementation((url: unknown, init?: { method?: string }) => {
    const u = String(url)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (u.includes('/classes')) {
      return Promise.resolve(jsonResponse({
        data: [{ id: 'c1', name: 'VIII-A', grade: 'VIII', section: 'A', room: null, class_teacher_id: null, student_count: 0 }],
        next_cursor: null,
      }))
    }
    if (u.includes('/students') && method === 'GET') {
      return Promise.resolve(jsonResponse({ data: [STUDENT_ROW], next_cursor: null }))
    }
    return Promise.resolve(jsonResponse({ data: STUDENT_ROW }))
  })
}

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <Probe />
          <AddStudentScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

const probe = () => screen.getByTestId('probe').textContent ?? ''

/* Fill everything except Class (a live-data picker selected separately once its
   options have loaded). Class + Section are now one combined "Class" selector. */
function fillRequired() {
  fireEvent.change(within(screen.getByText('Admission number').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: 'ADM2026999' } })
  fireEvent.change(within(screen.getByText('First name').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: 'Test' } })
  fireEvent.change(within(screen.getByText('Last name').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: 'Student' } })
  fireEvent.change(within(screen.getByText('Primary contact number').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: '9876543210' } })
  fireEvent.change(within(screen.getByText('Father name').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: 'Test Father' } })
  fireEvent.change(within(screen.getByText('Gender').closest('.sm-field') as HTMLElement).getByRole('combobox'), { target: { value: 'M' } })
  const dob = (screen.getByText('Date of birth').closest('.sm-field') as HTMLElement).querySelector('input') as HTMLInputElement
  fireEvent.change(dob, { target: { value: '2014-05-01' } })
}

const classCombo = () => within(screen.getByText('Class').closest('.sm-field') as HTMLElement).getByRole('combobox')

describe('Add Student form', () => {
  // Prior test files can leave a session/UI in localStorage; AppProvider's mount
  // restore effect would then reload it and clobber our navigation. Start clean.
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('blocks save and shows errors when required fields are empty', () => {
    renderForm()
    const start = Number(probe().split('|')[0])
    fireEvent.click(screen.getByText('Save student'))
    // roster unchanged, still on the add page
    expect(Number(probe().split('|')[0])).toBe(start)
    expect(probe().split('|')[1]).not.toBe('school.sis')
    // at least one required-field error is shown
    expect(screen.getAllByText('This field is required').length).toBeGreaterThan(0)
  })

  it('rejects a malformed Aadhaar number', () => {
    vi.stubGlobal('fetch', makeFetch())
    renderForm()
    fillRequired()
    fireEvent.change(within(screen.getByText('Aadhaar number').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: '123' } })
    fireEvent.click(screen.getByText('Save student'))
    expect(screen.getByText('Aadhaar must be exactly 12 digits')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('adds the student and opens the profile when valid', async () => {
    vi.stubGlobal('fetch', makeFetch())

    renderForm()
    // The Class picker is populated from the live class list; wait for it to load.
    await waitFor(() =>
      expect(Array.from(classCombo().querySelectorAll('option')).some(
        (o) => (o as HTMLOptionElement).value === 'VIII-A',
      )).toBe(true),
    )
    fillRequired()
    fireEvent.change(classCombo(), { target: { value: 'VIII-A' } })
    fireEvent.click(screen.getByText('Save student'))

    await waitFor(() => expect(probe().split('|')[1]).toBe('school.student'), { timeout: 10000 })
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
      (c) => String(c[0]).includes('/students'),
    )).toBe(true)

    vi.unstubAllGlobals()
  }, 20000)
})
