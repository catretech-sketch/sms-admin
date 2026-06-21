import { describe, it, expect, vi } from 'vitest'
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

function fillRequired() {
  const setByLabel = (label: string, value: string) => {
    const field = screen.getByText(label).closest('.sm-field') as HTMLElement
    const control = within(field).getByRole(label === 'Class' || label === 'Section' || label === 'Gender' ? 'combobox' : 'textbox')
    fireEvent.change(control, { target: { value } })
  }
  // text inputs (date inputs have no textbox role, so target them directly)
  fireEvent.change(within(screen.getByText('Admission number').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: 'ADM2026999' } })
  fireEvent.change(within(screen.getByText('First name').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: 'Test' } })
  fireEvent.change(within(screen.getByText('Last name').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: 'Student' } })
  fireEvent.change(within(screen.getByText('Primary contact number').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: '9876543210' } })
  setByLabel('Class', 'VIII')
  setByLabel('Section', 'A')
  setByLabel('Gender', 'M')
  const dob = (screen.getByText('Date of birth').closest('.sm-field') as HTMLElement).querySelector('input') as HTMLInputElement
  fireEvent.change(dob, { target: { value: '2014-05-01' } })
}

describe('Add Student form', () => {
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
    renderForm()
    fillRequired()
    fireEvent.change(within(screen.getByText('Aadhaar number').closest('.sm-field') as HTMLElement).getByRole('textbox'), { target: { value: '123' } })
    fireEvent.click(screen.getByText('Save student'))
    expect(screen.getByText('Aadhaar must be exactly 12 digits')).toBeInTheDocument()
  })

  it('adds the student and navigates back when valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'srv', admission_no: 'A1', class_label: '1-A', name: 'X',
        gender: 'M', grade: '1', section: 'A', roll: 1, guardian: 'g',
        phone: '1', attendance: 0, fee_status: 'due', fee_due: 0,
        status: 'active', house: 'Ruby', avatar_hue: 1,
      },
    })))

    renderForm()
    fillRequired()
    fireEvent.click(screen.getByText('Save student'))

    await waitFor(() => expect(probe().split('|')[1]).toBe('school.sis'))
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/students')

    vi.unstubAllGlobals()
  })
})
