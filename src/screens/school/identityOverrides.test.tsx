import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { adminScreens } from './admin'

const IdentityScreen = adminScreens['school.identity']

const mockUsers = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'admin@school.edu',
    phone: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    roles: ['school.admin'],
  },
]

vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>()
  return {
    ...actual,
    listSchoolUsers: vi.fn(async () => mockUsers),
    getUserPermissions: vi.fn(async () => []),
    setUserPermissions: vi.fn(async (_id: string, ov: import('@/types').UserOverrides) => {
      const rows: { module: string; cap: string; effect: string }[] = []
      for (const [module, caps] of Object.entries(ov)) {
        if (!caps) continue
        for (const [cap, effect] of Object.entries(caps)) {
          if (effect) rows.push({ module, cap, effect })
        }
      }
      return rows
    }),
    setUserRoles: vi.fn(async () => mockUsers[0]),
  }
})

const getRoleTemplateMock = vi.fn(async () => [] as import('@/api/roleTemplates').RoleTemplateOverride[])
const setRoleTemplateMock = vi.fn(async (overrides: import('@/api/roleTemplates').RoleTemplateOverride[]) => overrides)

vi.mock('@/api/roleTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/roleTemplates')>()
  return {
    ...actual,
    getRoleTemplate: (...args: []) => getRoleTemplateMock(...args),
    setRoleTemplate: (...args: [import('@/api/roleTemplates').RoleTemplateOverride[]]) => setRoleTemplateMock(...args),
  }
})

afterEach(cleanup)

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <IdentityScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

function moduleRow(container: HTMLElement, label: string): HTMLElement {
  const cell = within(container).getByText(label)
  return cell.closest('tr') as HTMLElement
}

describe('per-user access editor (by user id)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('opens from Permissions, cycles a capability, saves against user id', async () => {
    const { container } = renderScreen()
    await waitFor(() => expect(within(container).getByText(/admin@school\.edu/i)).toBeInTheDocument())

    fireEvent.click(within(container).getAllByRole('button', { name: /^permissions$/i })[0])
    await waitFor(() => expect(within(container).getByText(/Per-user access/i)).toBeInTheDocument())

    const row = moduleRow(container, 'Fees & finance')
    const vChip = within(row).getByTitle(/^View —/)
    fireEvent.click(vChip)
    expect(within(row).getByTitle('View — grant')).toBeInTheDocument()

    fireEvent.click(within(container).getByText('Save changes'))
    await waitFor(() => expect(within(container).getByText(/Permissions saved/i)).toBeInTheDocument())
  })

  it('cycles a cell through grant, revoke, and back to inherit', async () => {
    const { container } = renderScreen()
    await waitFor(() => expect(within(container).getByText(/admin@school\.edu/i)).toBeInTheDocument())
    fireEvent.click(within(container).getAllByRole('button', { name: /^permissions$/i })[0])
    await waitFor(() => expect(within(container).getByText(/Per-user access/i)).toBeInTheDocument())

    const row = moduleRow(container, 'Fees & finance')
    const eChip = within(row).getByTitle(/^Edit —/)

    fireEvent.click(eChip)
    expect(within(row).getByTitle('Edit — grant')).toBeInTheDocument()
    fireEvent.click(within(row).getByTitle('Edit — grant'))
    expect(within(row).getByTitle('Edit — revoke')).toBeInTheDocument()
    fireEvent.click(within(row).getByTitle('Edit — revoke'))
    expect(within(row).getByTitle('Edit — inherit')).toBeInTheDocument()
  })
})

describe('role template matrix (Roles & permissions tab)', () => {
  beforeEach(() => { vi.clearAllMocks(); getRoleTemplateMock.mockResolvedValue([]) })

  it('loads the saved template, toggles a cap, and PUTs the overrides on save', async () => {
    const { container } = renderScreen()
    await waitFor(() => expect(within(container).getByText(/admin@school\.edu/i)).toBeInTheDocument())

    fireEvent.click(within(container).getByRole('button', { name: /roles & permissions/i }))
    await waitFor(() => expect(within(container).getByText('Permission matrix')).toBeInTheDocument())
    await waitFor(() => expect(getRoleTemplateMock).toHaveBeenCalled())

    // dashboard row: teacher starts with only 'V' granted — toggle 'E' on.
    const row = moduleRow(container, 'Dashboard')
    const cells = within(row).getAllByRole('cell')
    const teacherCell = cells[5] // module, owner, admin, principal, vice_principal, teacher, staff
    fireEvent.click(within(teacherCell).getByText('E'))

    fireEvent.click(within(container).getByText('Save changes'))
    await waitFor(() => expect(within(container).getByText(/Permissions saved/i)).toBeInTheDocument())

    expect(setRoleTemplateMock).toHaveBeenCalledTimes(1)
    const overrides = setRoleTemplateMock.mock.calls[0][0]
    expect(overrides).toContainEqual({ role: 'teacher', module: 'dashboard', cap: 'E', effect: 'grant' })
  })

  it('shows an error toast when saving fails', async () => {
    setRoleTemplateMock.mockRejectedValueOnce(new Error('boom'))
    const { container } = renderScreen()
    await waitFor(() => expect(within(container).getByText(/admin@school\.edu/i)).toBeInTheDocument())

    fireEvent.click(within(container).getByRole('button', { name: /roles & permissions/i }))
    await waitFor(() => expect(within(container).getByText('Permission matrix')).toBeInTheDocument())

    fireEvent.click(within(container).getByText('Save changes'))
    await waitFor(() => expect(within(container).getByText(/Could not save/i)).toBeInTheDocument())
  })
})
