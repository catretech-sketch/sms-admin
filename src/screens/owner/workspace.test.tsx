import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { workspaceScreens, ALL_SCHOOLS, isAllSchools, scopeLabel, toggleScope } from './workspace'

vi.mock('@/api/hooks/useOwner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/hooks/useOwner')>()
  return {
    ...actual,
    usePortfolioSchools: () => ({
      data: [
        { id: '11111111-1111-1111-1111-111111111111', name: 'Alpha Public School', country: 'Bengaluru', tier: 'gold', status: 'active', students_count: 10, staff_count: 2, mrr: 0, health_score: 80 },
        { id: '22222222-2222-2222-2222-222222222222', name: 'Beta High School', country: 'Mumbai', tier: 'silver', status: 'active', students_count: 20, staff_count: 3, mrr: 0, health_score: 70 },
      ],
      isLoading: false,
      isError: false,
    }),
  }
})

vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>()
  return {
    ...actual,
    inviteUser: vi.fn().mockResolvedValue(undefined),
    listSchoolUsers: vi.fn().mockResolvedValue([
      { id: 'U-1', email: 'neha@school.edu', phone: null, status: 'active', created_at: '2026-07-01T00:00:00Z', roles: ['school.teacher'] },
    ]),
    setUserRoles: vi.fn().mockResolvedValue({ id: 'U-1', email: 'neha@school.edu', phone: null, status: 'active', created_at: '2026-07-01T00:00:00Z', roles: ['school.admin'] }),
    getUserPermissions: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('@/api/mySchools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/mySchools')>()
  return {
    ...actual,
    switchSchool: vi.fn().mockResolvedValue({}),
    listMySchools: vi.fn().mockResolvedValue({ data: [] }),
  }
})

const OwnerUsers = workspaceScreens['owner.users']

afterEach(cleanup)

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <OwnerUsers />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

/** Seed a logged-in owner via AppProvider internals by mocking auth finish path is heavy —
 *  Team tab shows owner only when app.user is set. Drive Edit from invited row after invite,
 *  or assert empty owner when not logged in. */
describe('owner Users & roles — school picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a school picker sourced from portfolio schools, not other clients', async () => {
    const { container } = renderScreen()
    await waitFor(() => {
      expect(within(container).getByText('Alpha Public School')).toBeInTheDocument()
      expect(within(container).getByText('Beta High School')).toBeInTheDocument()
    })
    expect(within(container).queryByText('Greenwood Valley School')).toBeNull()
  })

  it('scope picker inside Send invite still lists only portfolio schools', async () => {
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    const inviteBtn = await waitFor(() => within(container).getByRole('button', { name: /send invite/i }))
    fireEvent.click(inviteBtn)
    const dialog = within(container).getByRole('dialog')
    expect(within(dialog).getByText('Alpha Public School')).toBeInTheDocument()
    expect(within(dialog).getByText('Beta High School')).toBeInTheDocument()
    expect(within(dialog).queryByText('Greenwood Valley School')).toBeNull()
  })

  it('selecting a school calls switchSchool with that tenant id', async () => {
    const { switchSchool } = await import('@/api/mySchools')
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    await waitFor(() => expect(switchSchool).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111'))
  })
})

describe('TeamTab — real data', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows the select-school prompt before a school is chosen', () => {
    const { container } = renderScreen()
    expect(within(container).getByText('Select a school')).toBeInTheDocument()
  })

  it('loads real users once a school is selected', async () => {
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    await waitFor(() => expect(within(container).getByText('neha@school.edu')).toBeInTheDocument())
  })
})

describe('scope helpers', () => {
  it('isAllSchools detects the All sentinel', () => {
    expect(isAllSchools([ALL_SCHOOLS])).toBe(true)
    expect(isAllSchools(['Alpha Public School'])).toBe(false)
  })
  it('scopeLabel summarises the scope', () => {
    expect(scopeLabel([ALL_SCHOOLS])).toBe('All my schools')
    expect(scopeLabel(['Alpha Public School'])).toBe('Alpha Public School')
    expect(scopeLabel(['Alpha Public School', 'Beta High School'])).toBe('2 schools')
  })
  it('toggleScope: picking a specific school replaces All', () => {
    expect(toggleScope([ALL_SCHOOLS], 'Alpha Public School')).toEqual(['Alpha Public School'])
  })
  it('toggleScope: picking All replaces specifics', () => {
    expect(toggleScope(['Alpha Public School', 'Beta High School'], ALL_SCHOOLS)).toEqual([ALL_SCHOOLS])
  })
  it('toggleScope: adds and removes specific schools', () => {
    expect(toggleScope(['Alpha Public School'], 'Beta High School'))
      .toEqual(['Alpha Public School', 'Beta High School'])
    expect(toggleScope(['Alpha Public School', 'Beta High School'], 'Beta High School'))
      .toEqual(['Alpha Public School'])
  })
  it('toggleScope: removing the last specific falls back to All (never empty)', () => {
    expect(toggleScope(['Alpha Public School'], 'Alpha Public School')).toEqual([ALL_SCHOOLS])
  })
})
