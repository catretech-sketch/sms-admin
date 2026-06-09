import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

function renderForm() {
  return render(
    <AppProvider>
      <ToastProvider>
        <Probe />
        <AddStudentScreen />
      </ToastProvider>
    </AppProvider>,
  )
}

const probe = () => screen.getByTestId('probe').textContent ?? ''
const before = () => Number(probe().split('|')[0])

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
    const start = before()
    fireEvent.click(screen.getByText('Save student'))
    // roster unchanged, still on the add page
    expect(before()).toBe(start)
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

  it('adds the student and navigates back when valid', () => {
    renderForm()
    const start = before()
    fillRequired()
    fireEvent.click(screen.getByText('Save student'))
    expect(before()).toBe(start + 1)
    expect(probe().split('|')[1]).toBe('school.sis')
  })
})
