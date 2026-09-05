import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider, useApp } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { staffAddScreens } from './staffAdd'

const AddStaffScreen = staffAddScreens['school.staff.add']

function Probe() {
  const app = useApp()
  return <div data-testid="probe">{app.staff.length}|{app.view}</div>
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/* The Add Staff screen sits behind TierGate feature="staff_support" (Platinum-only).
   AppProvider resolves `plan` from the live tenant fetched via /me/schools on session
   restore (real production code path — no test-only override). Seed a resumable
   session (tokenStore.hasSession()) and answer /auth/refresh + /auth/me + /me/schools
   with a Platinum-tier school so the gate opens the same way it would for a real
   Platinum customer, then let each test's own fetch handler cover staffAdd's own
   endpoints (roster GET, create POST). */
const TENANT_ID = 'school-1'

function authAndSchoolResponse(url: string, method: string): Response | null {
  if (url.includes('/auth/refresh')) {
    return jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })
  }
  if (url.includes('/auth/me')) {
    return jsonResponse({ data: { id: 'u1', tenant_id: TENANT_ID, roles: ['school.admin'], is_platform: false } })
  }
  if (url.includes('/me/schools') && method === 'GET') {
    return jsonResponse({
      data: [{
        id: TENANT_ID, name: 'Greenwood High', slug: 'greenwood', country: 'IN', status: 'active',
        plan_id: null, plan_name: 'Platinum', tier: 'platinum', mrr: 0, students_count: 0,
        staff_count: 0, storage_gb: 0, created: '2026-01-01', contact_name: null,
        contact_email: null, contact_phone: null, address: null, health_score: 100,
      }],
      next_cursor: null,
    })
  }
  return null
}

/** Wrap a test's own handler with the shared auth/plan responses above. */
function withPlatinumSession(handler: (url: string, method: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? (typeof input === 'string' ? 'GET' : (input as Request).method) ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method)
    if (auth) return Promise.resolve(auth)
    return Promise.resolve(handler(url, method, init))
  })
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
const setDate = (label: string, value: string) =>
  fireEvent.change(fieldOf(label).querySelector('input[type="date"]') as HTMLInputElement, { target: { value } })

/** Wait for the Platinum session restore to land — the "First name" field
 *  is unlocked (out of TierGate's aria-hidden blur) once `plan` resolves. */
async function waitForUnlockedForm() {
  await waitFor(() => {
    expect(within(fieldOf('First name')).getByRole('textbox')).toBeInTheDocument()
  })
}

function fillRequired() {
  setText('First name', 'Suresh')
  setText('Last name', 'Naidu')
  setText('Primary contact number', '9876543210')
  setText('Email address', 'suresh.naidu@school.edu')
  setSelect('Role', 'Driver')
  setSelect('Category', 'transport')
  setSelect('Department', 'Transport')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  tokenStore.set({ access_token: 'a', refresh_token: 'r' })
  tokenStore.setEmail('admin@greenwood.edu')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('Add Staff form', () => {
  it('blocks save and shows errors when required fields are empty', () => {
    vi.stubGlobal('fetch', withPlatinumSession(() => jsonResponse({ data: [], next_cursor: null })))
    renderForm()
    fireEvent.click(screen.getByText('Save staff'))
    expect(view()).not.toBe('school.staff')
    expect(screen.getAllByText('This field is required').length).toBeGreaterThan(0)
  })

  it('shows the auto-generated staff ID as read-only', async () => {
    vi.stubGlobal('fetch', withPlatinumSession(() => jsonResponse({ data: [], next_cursor: null })))
    renderForm()
    await waitForUnlockedForm()
    expect(fieldOf('Staff ID').querySelector('input')).toHaveAttribute('readonly')
  })

  it('auto-increments the staff ID past the highest existing code for this school', async () => {
    vi.stubGlobal('fetch', withPlatinumSession((url, method) => {
      if (url.includes('/staff') && method === 'GET') {
        return jsonResponse({
          data: [{
            id: 's1', name: 'Existing One', gender: 'M', department: 'Transport',
            category: 'transport', attendance_pct: 0, employee_code: 'greenwood/STF/26/0007',
          }],
          next_cursor: null,
        })
      }
      return jsonResponse({ data: [], next_cursor: null })
    }))
    renderForm()
    await waitForUnlockedForm()
    const input = fieldOf('Staff ID').querySelector('input') as HTMLInputElement
    await waitFor(() => expect(input).toHaveValue('greenwood/STF/26/0008'))
  })

  it('rejects a malformed Aadhaar number', async () => {
    vi.stubGlobal('fetch', withPlatinumSession(() => jsonResponse({ data: [], next_cursor: null })))
    renderForm()
    await waitForUnlockedForm()
    fillRequired()
    setText('Aadhaar number', '12345')
    fireEvent.click(screen.getByText('Save staff'))
    expect(screen.getByText('Aadhaar must be exactly 12 digits')).toBeInTheDocument()
    expect(view()).not.toBe('school.staff')
  })

  it('adds the staff member and navigates back when valid', async () => {
    // Return a fresh Response per call: the form mounts a roster query that reads
    // one body before the create POST, and a Response body can only be read once.
    vi.stubGlobal('fetch', withPlatinumSession(() => jsonResponse({
      data: {
        id: 'srv', name: 'Suresh Naidu', gender: 'M',
        department: 'Transport', category: 'transport', attendance_pct: 0,
      },
    })))

    renderForm()
    await waitForUnlockedForm()
    fillRequired()
    fireEvent.click(screen.getByText('Save staff'))

    await waitFor(() => expect(view()).toBe('school.staff'))
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    const staffCall = fetchMock.mock.calls.find((args) => String(args[0]).includes('/staff'))
    expect(staffCall).toBeDefined()
  })

  it('persists driving license number and expiry through staff extras', async () => {
    vi.stubGlobal('fetch', withPlatinumSession(() => jsonResponse({
      data: {
        id: 'srv', name: 'Suresh Naidu', gender: 'M',
        department: 'Transport', category: 'transport', attendance_pct: 0,
      },
    })))

    renderForm()
    await waitForUnlockedForm()
    fillRequired()
    setText('Driving license number', 'KA0120230012345')
    setDate('License expiry', '2027-01-01')
    fireEvent.click(screen.getByText('Save staff'))

    await waitFor(() => expect(view()).toBe('school.staff'))
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    const extrasCall = fetchMock.mock.calls.find((args) => String(args[0]).includes('/extras') && args[1]?.method === 'PUT')
    expect(extrasCall).toBeDefined()
    const body = JSON.parse(String(extrasCall![1]?.body))
    const extras = JSON.parse(body.extras_json)
    expect(extras.transport.license).toBe('KA0120230012345')
    expect(extras.transport.licenseExpiry).toBe('2027-01-01')
  })
})
