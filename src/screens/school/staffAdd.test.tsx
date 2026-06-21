import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider, useApp } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { staffAddScreens } from './staffAdd'

const AddStaffScreen = staffAddScreens['school.staff.add']

function Probe() {
  const app = useApp()
  return <div data-testid="probe">{app.staff.length}|{app.view}</div>
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
          <AddStaffScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

const probe = () => screen.getByTestId('probe').textContent ?? ''
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
  setSelect('Role', 'Driver')
  setSelect('Category', 'transport')
  setSelect('Department', 'Transport')
}

describe('Add Staff form', () => {
  it('blocks save and shows errors when required fields are empty', () => {
    renderForm()
    fireEvent.click(screen.getByText('Save staff'))
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

  it('adds the staff member and navigates back when valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'srv', name: 'Suresh Naidu', gender: 'M',
        department: 'Transport', category: 'transport', attendance_pct: 0,
      },
    })))

    renderForm()
    fillRequired()
    fireEvent.click(screen.getByText('Save staff'))

    await waitFor(() => expect(view()).toBe('school.staff'))
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/staff')

    vi.unstubAllGlobals()
  })
})
