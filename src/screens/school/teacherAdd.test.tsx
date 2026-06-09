import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AppProvider, useApp } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { teacherAddScreens } from './teacherAdd'

const AddTeacherScreen = teacherAddScreens['school.teachers.add']

function Probe() {
  const app = useApp()
  return <div data-testid="probe">{app.teachers.length}|{app.view}</div>
}

function renderForm() {
  return render(
    <AppProvider>
      <ToastProvider>
        <Probe />
        <AddTeacherScreen />
      </ToastProvider>
    </AppProvider>,
  )
}

const probe = () => screen.getByTestId('probe').textContent ?? ''
const count = () => Number(probe().split('|')[0])
const view = () => probe().split('|')[1]

const fieldOf = (label: string) => screen.getByText(label).closest('.sm-field') as HTMLElement
const setText = (label: string, value: string) =>
  fireEvent.change(within(fieldOf(label)).getByRole('textbox'), { target: { value } })
const setSelect = (label: string, value: string) =>
  fireEvent.change(within(fieldOf(label)).getByRole('combobox'), { target: { value } })
// password inputs expose no ARIA role, so target the raw <input>
const setInput = (label: string, value: string) =>
  fireEvent.change(fieldOf(label).querySelector('input') as HTMLInputElement, { target: { value } })

function fillRequired() {
  setText('First name', 'Rajesh')
  setText('Last name', 'Kumar')
  setText('Primary contact number', '9876543210')
  setSelect('Department', 'Mathematics')
  setSelect('Designation', 'Teacher')
}

describe('Add Teacher form', () => {
  it('blocks save and shows errors when required fields are empty', () => {
    renderForm()
    const start = count()
    fireEvent.click(screen.getByText('Save teacher'))
    expect(count()).toBe(start)
    expect(view()).not.toBe('school.teachers')
    expect(screen.getAllByText('This field is required').length).toBeGreaterThan(0)
  })

  it('blocks save when passwords do not match', () => {
    renderForm()
    fillRequired()
    setInput('Password', 'secret1')
    setInput('Confirm password', 'secret2')
    fireEvent.click(screen.getByText('Save teacher'))
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(view()).not.toBe('school.teachers')
  })

  it('adds the teacher and navigates back when valid', () => {
    renderForm()
    const start = count()
    fillRequired()
    fireEvent.click(screen.getByText('Save teacher'))
    expect(count()).toBe(start + 1)
    expect(view()).toBe('school.teachers')
  })
})
