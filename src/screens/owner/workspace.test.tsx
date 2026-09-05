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
    removeUserAccess: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/api/roleTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/roleTemplates')>()
  return {
    ...actual,
    getRoleTemplate: vi.fn().mockResolvedValue([]),
    setRoleTemplate: vi.fn().mockResolvedValue([{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }]),
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

  it('does not show an editable role select for a teacher row (non-CRM role)', async () => {
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    const row = await waitFor(() => within(container).getByText('neha@school.edu').closest('tr'))
    expect(row).not.toBeNull()
    const rowScope = within(row as HTMLElement)
    // The row's role is Teacher, which is not a CRM role — the actions cell must show
    // it read-only (Badge), never a <select> that would default to a CRM role like Admin.
    expect(rowScope.queryByRole('combobox')).toBeNull()
    expect(rowScope.getAllByText('Teacher').length).toBeGreaterThan(0)
  })

  it('remove access requires 2 steps: Continue, then typing the exact name', async () => {
    const { removeUserAccess } = await import('@/api/users')
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    await waitFor(() => within(container).getByText('neha@school.edu'))
    fireEvent.click(within(container).getByRole('button', { name: /remove/i }))

    // Step 1: Continue, no destructive action yet.
    expect(within(container).getByText('Remove access')).toBeInTheDocument()
    expect(within(container).queryByRole('button', { name: /remove access/i })).not.toBeInTheDocument()
    fireEvent.click(within(container).getByRole('button', { name: /continue/i }))

    // Step 2: disabled until the exact name is typed.
    const confirmBtn = within(container).getByRole('button', { name: /remove access/i })
    expect(confirmBtn).toBeDisabled()
    const input = within(container).getByPlaceholderText('neha') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'neha' } })
    expect(confirmBtn).toBeEnabled()
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(removeUserAccess).toHaveBeenCalledWith('U-1'))
  })
})

describe('InviteModal — ambient tenant restore (regression)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('restores the ambient tenant to the selected school after inviting across other schools', async () => {
    // Whole-branch review finding 2: switchSchool mutates the GLOBAL token store. Inviting
    // across multiple tenants (default scope = "All my schools") leaves the ambient JWT
    // pointed at the LAST invited school, not the one still selected in the picker — desyncing
    // every subsequent ambient-tenant fetch (Team/Roles/Audit) from the visible schoolId.
    const { switchSchool } = await import('@/api/mySchools')
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))

    const alphaId = '11111111-1111-1111-1111-111111111111'
    fireEvent.change(picker, { target: { value: alphaId } })

    const inviteBtn = await waitFor(() => within(container).getByRole('button', { name: /send invite/i }))
    fireEvent.click(inviteBtn)

    const dialog = within(container).getByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText('admin@school.edu'), { target: { value: 'new.admin@school.edu' } })

    // Default scope is "All my schools" — invites Alpha then Beta (Beta invited last).
    fireEvent.click(within(dialog).getByRole('button', { name: /send invite/i }))

    await waitFor(() => expect(within(container).queryByRole('dialog')).toBeNull())

    // The FINAL switchSchool call must restore the ambient tenant to Alpha — the school still
    // selected in the picker — not leave it on Beta (the last-invited tenant).
    const calls = vi.mocked(switchSchool).mock.calls.map((c) => c[0])
    expect(calls.at(-1)).toBe(alphaId)
  })
})

describe('RolesTab — real data, staff dropped', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('does not render a Staff column', async () => {
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    fireEvent.click(within(container).getByRole('button', { name: /roles & permissions/i }))
    await waitFor(() => expect(within(container).getByText('Teacher')).toBeInTheDocument())
    expect(within(container).queryByText('Staff')).toBeNull()
  })

  it('shows School B\'s permissions after switching, never School A\'s stale cached matrix (regression: cross-tenant race)', async () => {
    // Whole-branch review finding 1: switching schools invalidates the (ambient, shared)
    // roleTemplate query key and triggers a background refetch — while that refetch is in
    // flight, templateQ.data still holds School A's cached value. RolesTab must wait for the
    // fresh fetch to settle before hydrating (and locking) the matrix, otherwise it silently
    // shows — and can SAVE — School A's permissions under School B's header.
    const { getRoleTemplate, setRoleTemplate } = await import('@/api/roleTemplates')
    vi.mocked(getRoleTemplate)
      .mockResolvedValueOnce([{ role: 'admin', module: 'fees', cap: 'V', effect: 'grant' }]) // School A
      .mockResolvedValueOnce([{ role: 'admin', module: 'fees', cap: 'A', effect: 'grant' }]) // School B

    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))

    // Select School A and open Roles tab — hydrates from School A's template (fetch #1).
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    fireEvent.click(within(container).getByRole('button', { name: /roles & permissions/i }))
    await waitFor(() => expect(getRoleTemplate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(within(container).getByRole('button', { name: /save changes/i })).toBeInTheDocument())

    // Switch to School B — invalidates the shared roleTemplate query key and triggers fetch #2.
    fireEvent.change(picker, { target: { value: '22222222-2222-2222-2222-222222222222' } })
    await waitFor(() => expect(getRoleTemplate).toHaveBeenCalledTimes(2))

    // Assert the FINAL settled state reflects School B's override, never School A's — including
    // on Save, which is what would otherwise corrupt School B's real role template.
    fireEvent.click(within(container).getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(setRoleTemplate).toHaveBeenCalled())
    const sent = vi.mocked(setRoleTemplate).mock.calls.at(-1)![0]
    expect(sent).toContainEqual({ role: 'admin', module: 'fees', cap: 'A', effect: 'grant' })
    expect(sent).not.toContainEqual({ role: 'admin', module: 'fees', cap: 'V', effect: 'grant' })
  })
})

vi.mock('@/api/invitations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/invitations')>()
  return {
    ...actual,
    listInvitations: vi.fn().mockResolvedValue([
      { id: 'INV-1', email: 'priya@school.edu', phone: null, roleLabel: 'Principal', invitedAt: '2026-07-20T00:00:00Z', expiresAt: '2026-07-21T00:00:00Z', status: 'pending' },
    ]),
  }
})

describe('InvitationsTab — real data', () => {
  it('loads real invitations once a school is selected', async () => {
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    fireEvent.click(within(container).getByRole('button', { name: /invitations/i }))
    await waitFor(() => expect(within(container).getByText('priya@school.edu')).toBeInTheDocument())
  })
})

vi.mock('@/api/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/audit')>()
  return {
    ...actual,
    listAuditLog: vi.fn().mockResolvedValue({
      data: [{ id: 'A-1', actorId: 'U-1', actorName: 'Anita Rao', action: 'user.role_changed', target: 'U-2', at: '2026-07-22T10:00:00Z' }],
      nextCursor: null,
    }),
  }
})

describe('AuditTab — real data', () => {
  it('loads real audit entries and never shows the old fake names', async () => {
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    fireEvent.click(within(container).getByRole('button', { name: /audit log/i }))
    await waitFor(() => expect(within(container).getByText('Anita Rao')).toBeInTheDocument())
    expect(within(container).queryByText('Anil Mehta')).toBeNull()
    expect(within(container).queryByText('Ravi Menon')).toBeNull()
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
