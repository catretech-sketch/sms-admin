import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AppProvider, useApp } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { staffAddScreens } from './staffAdd'

const AddStaffScreen = staffAddScreens['school.staff.add']

function Probe() {
  const app = useApp()
  return <div data-testid="probe">{app.staff.length}|{app.view}</div>
}

function renderForm() {
  return render(
    <AppProvider>
      <ToastProvider>
        <Probe />
        <AddStaffScreen />
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

function fillRequired() {
  setText('First name', 'Suresh')
  setText('Last name', 'Naidu')
  setText('Primary contact number', '9876543210')
  setText('Role', 'Bus Driver')
  setSelect('Category', 'transport')
  setSelect('Department', 'Transport')
}

describe('Add Staff form', () => {
  it('blocks save and shows errors when required fields are empty', () => {
    renderForm()
    const start = count()
    fireEvent.click(screen.getByText('Save staff'))
    expect(count()).toBe(start)
    expect(view()).not.toBe('school.staff')
    expect(screen.getAllByText('This field is required').length).toBeGreaterThan(0)
  })

  it('rejects a malformed Aadhaar number', () => {
    renderForm()
    fillRequired()
    setText('Aadhaar number', '12345')
    fireEvent.click(screen.getByText('Save staff'))
    expect(screen.getByText('Aadhaar must be exactly 12 digits')).toBeInTheDocument()
    expect(view()).not.toBe('school.staff')
  })

  it('adds the staff member and navigates back when valid', () => {
    renderForm()
    const start = count()
    fillRequired()
    fireEvent.click(screen.getByText('Save staff'))
    expect(count()).toBe(start + 1)
    expect(view()).toBe('school.staff')
  })
})
