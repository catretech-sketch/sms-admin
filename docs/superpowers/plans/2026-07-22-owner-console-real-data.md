# Owner Console Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire the Owner Console's "Users & roles" screen (`src/screens/owner/workspace.tsx`) — Team, Roles & Permissions, Invitations, Audit log — from local mock state to the real backend APIs already built and tested for the school-level Identity & access screen, gated behind a school picker.

**Architecture:** Lift a single `schoolId` selection into `OwnerUsers`, backed by the existing `switchSchool(tenantId)` mutation (mints a tenant-scoped JWT). Each of the four tabs receives `schoolId` as a prop and, once non-empty, calls the exact same API modules/hooks already used by `src/screens/school/admin.tsx` (`src/api/users.ts`, `src/api/roleTemplates.ts`, `src/api/invitations.ts`, `src/api/audit.ts` + their hooks). No backend changes.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest + Testing Library.

## Global Constraints

- No backend changes — every API used here already exists and is already tested.
- School picker sits once in `OwnerUsers`, shared by all 4 tabs — not per-tab.
- Selecting a school calls `switchSchool(tenantId)` directly (not `app.enterSchool`) so the owner stays inside the Owner Console.
- After a successful school switch, invalidate the `['roleTemplate']` and `['audit']` React Query cache keys — those two hooks' query keys don't include a tenant/school id, so without invalidation they'd show the previous school's cached data after a switch.
- Team invites and the Roles & Permissions matrix are CRM-role-scoped: `admin`, `principal`, `vice_principal`, `teacher` — **`staff` is dropped** from the Roles matrix columns (Team's invite role picker is already CRM-only via `assignableSchoolRoles`, no change needed there).
- No Suspend/Restore on the Team tab — no deactivate/reactivate endpoint exists anywhere in the backend.
- No cross-school aggregation — one selected school's data at a time.
- Before a school is selected, every tab shows a "select a school" empty state instead of fetching.
- Run `npx vitest run <touched test files>` after each task; run `npx tsc -b --noEmit` after each task.
- Frequent small commits — one per task.
- Full spec: `docs/superpowers/specs/2026-07-22-owner-console-real-data-design.md`.

---

## File Map

| File | Change |
|---|---|
| `src/screens/owner/workspace.tsx` | `OwnerUsers` shell gains school picker + switch/invalidate logic; `TeamTab`, `RolesTab`, `InvitationsTab`, `AuditTab` all rewired to real data, scoped by `schoolId` prop; mock `TeamUser`/`Invite`/`AuditRow`/`AUDIT`/`userStatus` (Team's) removed; `EditUserModal` replaced by a school-scoped `UserAccessEditor` |
| `src/screens/owner/workspace.test.tsx` | New/updated coverage per task; fixes the pre-existing "Invite user"/"Send invite" label mismatch |

---

## Task 1: School picker shell in `OwnerUsers`

**Files:**
- Modify: `src/screens/owner/workspace.tsx` (`OwnerUsers`, near line 812)
- Test: `src/screens/owner/workspace.test.tsx`

**Interfaces:**
- Consumes: `usePortfolioSchools` (existing), `useSwitchSchool` (existing, `src/api/hooks/useOwner.ts:71-73`), `clientToSchool` (existing, `src/api/ownerMap.ts`).
- Produces: `OwnerUsers` passes `schoolId: string` to `TeamTab`/`RolesTab`/`InvitationsTab`/`AuditTab` (all four still take no props today — Tasks 2-5 add the prop to each). A shared `<Empty>` "select a school" state is available for reuse: extract as a small local component `SelectSchoolPrompt()` in the same file, used by all four tabs.

- [ ] **Step 1: Confirm typecheck baseline**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Write the failing test**

Add to `src/screens/owner/workspace.test.tsx`, replacing the existing single test in the `describe('owner Users & roles — mapped schools only', ...)` block (this also fixes the pre-existing "Invite user" vs "Send invite" label bug — the real button says "Send invite", not "Invite user"):

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: FAIL — no school-picker `<select>` with an accessible name "Select school" exists yet, and the "Send invite" button assertion may already pass (fixing the pre-existing bug) but the picker tests fail.

- [ ] **Step 4: Add the school picker to `OwnerUsers`**

Replace the current `OwnerUsers` (`workspace.tsx:812-837`):

```tsx
function SelectSchoolPrompt() {
  return (
    <Card>
      <Empty icon="building" title="Select a school" body="Pick one of your mapped schools above to manage its team, roles, invitations and activity." />
    </Card>
  )
}

function OwnerUsers() {
  const toast = useToast()
  const qc = useQueryClient()
  const app = useApp()
  const { data: clients = [] } = usePortfolioSchools(app.isPlatform)
  const schools = useMemo(() => clients.map((c, i) => clientToSchool(c, i)), [clients])
  const [tab, setTab] = useState('team')
  const [schoolId, setSchoolId] = useState('')
  const [switching, setSwitching] = useState(false)
  const switchSchoolMut = useSwitchSchool()

  const selectSchool = (id: string) => {
    if (!id || id === schoolId) { setSchoolId(id); return }
    setSwitching(true)
    switchSchoolMut.mutate(id, {
      onSuccess: () => {
        setSchoolId(id)
        void qc.invalidateQueries({ queryKey: ['roleTemplate'] })
        void qc.invalidateQueries({ queryKey: ['audit'] })
      },
      onError: () => toast.danger('Could not switch school', 'Try again.'),
      onSettled: () => setSwitching(false),
    })
  }

  return (
    <div>
      <PageHead
        title="Users & roles"
        sub="Workspace team for your mapped schools only — other clients never appear"
      />
      <div className="row ai-center gap12 wrap" style={{ marginBottom: 16 }}>
        <Field label="School" hint="Pick a mapped school to manage its team, roles, invitations and audit log.">
          <Select
            aria-label="Select school"
            options={[{ value: '', label: schools.length ? 'Select a school…' : 'No schools mapped' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]}
            value={schoolId}
            onChange={(e) => selectSchool(e.target.value)}
            disabled={switching}
          />
        </Field>
        {switching && <Spinner size={18} />}
      </div>
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'team', label: 'Team', icon: 'users' },
          { value: 'roles', label: 'Roles & permissions', icon: 'lock' },
          { value: 'invites', label: 'Invitations', icon: 'inbox' },
          { value: 'audit', label: 'Audit log', icon: 'clock' },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {tab === 'team' && <TeamTab schoolId={schoolId} schools={schools} />}
        {tab === 'roles' && <RolesTab schoolId={schoolId} />}
        {tab === 'invites' && <InvitationsTab schoolId={schoolId} />}
        {tab === 'audit' && <AuditTab schoolId={schoolId} />}
      </div>
    </div>
  )
}
```

Add `SelectSchoolPrompt` and the `schoolId`/`schools` props to the four tab function signatures — for this task only, make the minimal change to each tab's signature so the file compiles (`function TeamTab({ schoolId, schools }: { schoolId: string; schools: School[] })`, `function RolesTab({ schoolId }: { schoolId: string })`, `function InvitationsTab({ schoolId }: { schoolId: string })`, `function AuditTab({ schoolId }: { schoolId: string })`) — the props are unused inside each tab body until Tasks 2-5 rewire them; add a leading `if (!schoolId) return <SelectSchoolPrompt />` at the top of each tab body so the empty state is visibly correct even before later tasks land.

Add `useQueryClient` and `useSwitchSchool` to the top import block:
```typescript
import { useSwitchSchool } from '@/api/hooks/useOwner'
```
(`useQueryClient` is already imported at `workspace.tsx:10`.)

- [ ] **Step 5: Run tests**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: all PASS.

- [ ] **Step 6: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/screens/owner/workspace.tsx src/screens/owner/workspace.test.tsx
git commit -m "feat(owner): add shared school picker to Users & roles screen"
```

---

## Task 2: Rewire `TeamTab` to real data

**Files:**
- Modify: `src/screens/owner/workspace.tsx` (`TeamTab`, `InviteModal`, remove `EditUserModal`)
- Test: `src/screens/owner/workspace.test.tsx`

**Interfaces:**
- Consumes: `listSchoolUsers`, `setUserRoles`, `getUserPermissions`, `setUserPermissions`, `overridesFromApi`, `assignableSchoolRoles`, `fromApiRole` (all existing, `@/api/users`), `useInviteUser` (`@/api/hooks/useUserMutations`), `useRoleTemplate` (`@/api/hooks/useRoleTemplates`), `caps`/`effectiveCaps`/`cellState`/`overrideCount`/`NEXT_CELL_STATE` (`@/lib/gating`), `schoolId: string` and `schools: School[]` props from Task 1.
- Produces: `TeamTab` rewired; a `UserAccessEditor` component + `OverrideChip` helper, ported into this file (copied from `admin.tsx:1165-1187` and `1189-1291` — reproduced in full below since this plan can't assume the implementer reads a second file's internals). Task 3 does not depend on this task's output (`RolesTab` is independent), but this task's `UserAccessEditor` is self-contained within `TeamTab`'s section of the file.

- [ ] **Step 1: Confirm typecheck baseline**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Write the failing test**

Replace the `describe('owner Users & roles — school picker', ...)` invite-scope test's setup is unaffected; add a new `describe` block to `workspace.test.tsx`:

```typescript
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

describe('TeamTab — real data', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows the select-school prompt before a school is chosen', () => {
    const { container } = renderScreen()
    expect(within(container).getByText(/select a school/i)).toBeInTheDocument()
  })

  it('loads real users once a school is selected', async () => {
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    await waitFor(() => expect(within(container).getByText('neha@school.edu')).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: FAIL — `TeamTab` still shows local mock state / the select-school guard from Task 1 renders for every school (since `TeamTab` doesn't yet fetch anything).

- [ ] **Step 4: Rewrite `TeamTab`, remove `EditUserModal`, add `UserAccessEditor`/`OverrideChip`**

Add these imports to the top of `workspace.tsx` (alongside the existing ones):
```typescript
import {
  listSchoolUsers, setUserRoles, getUserPermissions, setUserPermissions,
  overridesFromApi, fromApiRole, type SchoolUserDto,
} from '@/api/users'
import { useInviteUser } from '@/api/hooks/useUserMutations'
import { useRoleTemplate } from '@/api/hooks/useRoleTemplates'
import { caps, effectiveCaps, cellState, overrideCount, NEXT_CELL_STATE } from '@/lib/gating'
import type { UserOverrides, CellState } from '@/types'
```

Add `OverrideChip` (verbatim port of `admin.tsx:1165-1187`) directly before `TeamTab`:
```tsx
function OverrideChip({ cap, state, onClick }: { cap: Cap; state: CellState; onClick: () => void }) {
  const granted = state === 'grant'
  const revoked = state === 'revoke'
  const color = CAP_COLOR[cap]
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${CAP_LABEL[cap]} — ${state}`}
      aria-label={`${CAP_LABEL[cap]}: ${state}`}
      style={{
        width: 30, height: 26, borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: `1px solid ${granted ? color : revoked ? 'var(--danger)' : 'var(--border)'}`,
        background: granted ? color : 'transparent',
        color: granted ? '#fff' : revoked ? 'var(--danger)' : 'var(--text-2)',
        textDecoration: revoked ? 'line-through' : 'none',
      }}
    >
      {cap}
    </button>
  )
}
```

Replace the local `SchoolUser`-shaped row type: reuse the wire-mapped shape directly (no need for a separate `TeamUser` interface). Add:
```typescript
interface TeamRow { id: string; name: string; email: string; role: Role; status: string; last: string }

function mapTeamRow(u: SchoolUserDto): TeamRow {
  return {
    id: u.id,
    name: u.email.split('@')[0],
    email: u.email,
    role: fromApiRole(u.roles[0] ?? 'teacher'),
    status: u.status,
    last: u.created_at,
  }
}
```

Add `UserAccessEditor` (adapted from `admin.tsx:1189-1291` — same body, `user: TeamRow` instead of `SchoolUser`):
```tsx
function UserAccessEditor({ user, initial, onSave, onCancel }: {
  user: TeamRow
  initial: UserOverrides
  onSave: (ov: UserOverrides) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [ov, setOv] = useState<UserOverrides>(initial)
  const templateQ = useRoleTemplate()
  const tenantOverrides = templateQ.data ?? []

  const cycle = (mod: string, cap: Cap) => {
    setOv((prev) => {
      const next = NEXT_CELL_STATE[cellState(mod, cap, prev)]
      const modOv = { ...(prev[mod] ?? {}) }
      if (next === 'inherit') delete modOv[cap]
      else modOv[cap] = next
      const out = { ...prev }
      if (Object.keys(modOv).length === 0) delete out[mod]
      else out[mod] = modOv
      return out
    })
  }

  const count = overrideCount(ov)
  const reset = () => { setOv(initial); toast.info('Overrides reset', 'Reverted to the last saved overrides.') }
  const save = () => { onSave(ov) }

  return (
    <div className="col gap16">
      <Card>
        <div className="row ai-center gap12 wrap">
          <Avatar name={user.name} size={40} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="fw7">{user.name}</div>
            <div className="t-sm muted">{user.email}</div>
            <div className="t-xs muted" title={user.id}>User id · {user.id}</div>
          </div>
          <Badge tone={roleTone(user.role)}>{ROLE_META[user.role].label}</Badge>
          <Btn variant="ghost" size="sm" icon="arrowLeft" onClick={onCancel}>Back</Btn>
        </div>
      </Card>

      <Card pad={false}>
        <CardHead
          title="Per-user access (by id)"
          sub="Tap V / E / A to cycle inherit → grant → revoke — saved against this user id"
          icon="user"
          action={
            <div className="row ai-center gap8">
              <Badge tone="neutral">{count} override{count === 1 ? '' : 's'}</Badge>
              <Btn variant="ghost" size="sm" icon="refresh" onClick={reset}>Reset</Btn>
              <Btn variant="primary" size="sm" icon="check" onClick={save}>Save changes</Btn>
            </div>
          }
        />
        <div style={{ overflowX: 'auto' }}>
          <table className="sm-table">
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Module</th>
                <th className="ta-center">Role default</th>
                <th className="ta-center">This user</th>
                <th className="ta-center">Effective</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(PERMS).map((mod) => {
                const roleCaps = caps(user.role, mod)
                const eff = effectiveCaps(user.role, mod, ov, tenantOverrides)
                return (
                  <tr key={mod}>
                    <td>
                      <div className="fw6">{MODULE_LABEL[mod] ?? mod}</div>
                      <div className="t-xs muted">{mod}</div>
                    </td>
                    <td className="ta-center">
                      <span className="t-xs muted">{roleCaps.length ? roleCaps.join(' · ') : '—'}</span>
                    </td>
                    <td className="ta-center">
                      <div className="row gap4" style={{ justifyContent: 'center' }}>
                        {CAPS.map((c) => (
                          <OverrideChip key={c} cap={c} state={cellState(mod, c, ov)} onClick={() => cycle(mod, c)} />
                        ))}
                      </div>
                    </td>
                    <td className="ta-center">
                      <div className="row gap4" style={{ justifyContent: 'center' }}>
                        {eff.length
                          ? eff.map((c) => <Badge key={c} tone={CAP_TONE[c]}>{c}</Badge>)
                          : <span className="t-xs muted">No access</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
```

Replace the whole `TeamTab` function body:
```tsx
function TeamTab({ schoolId, schools }: { schoolId: string; schools: School[] }) {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState('all')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [onboardKind, setOnboardKind] = useState<'teacher' | 'staff' | null>(null)
  const [rows, setRows] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, UserOverrides>>({})
  const [editing, setEditing] = useState<TeamRow | null>(null)
  const inviteUser = useInviteUser()

  const reload = async () => {
    if (!schoolId) return
    setLoading(true); setError(false)
    try {
      setRows((await listSchoolUsers()).map(mapTeamRow))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [schoolId])

  if (!schoolId) return <SelectSchoolPrompt />

  const filtered = rows.filter((u) => {
    const needle = q.trim().toLowerCase()
    if (needle && !(u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))) return false
    if (roleF !== 'all' && u.role !== roleF) return false
    return true
  })

  const openEditor = async (u: TeamRow) => {
    try {
      const perms = await getUserPermissions(u.id)
      setOverrides((m) => ({ ...m, [u.id]: overridesFromApi(perms) }))
    } catch {
      setOverrides((m) => ({ ...m, [u.id]: m[u.id] ?? {} }))
    }
    setEditing(u)
  }

  if (editing) {
    return (
      <UserAccessEditor
        user={editing}
        initial={overrides[editing.id] ?? {}}
        onCancel={() => setEditing(null)}
        onSave={(ov) => {
          void setUserPermissions(editing.id, ov).then(
            () => { setOverrides((m) => ({ ...m, [editing.id]: ov })); toast.success('Access saved', `Updated overrides for ${editing.name}.`); setEditing(null) },
            (e) => toast.danger('Could not save', e instanceof ApiError ? e.message : 'Try again.'),
          )
        }}
      />
    )
  }

  const columns: Column<TeamRow>[] = [
    {
      key: 'name', label: 'User', sortValue: (u) => u.name,
      render: (u) => (
        <div className="row ai-center gap10">
          <Avatar name={u.name} size={34} />
          <div>
            <div className="fw6">{u.name}</div>
            <div className="t-xs muted">{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', label: 'Role', sortValue: (u) => u.role, render: (u) => <Badge tone={roleTone(u.role)}>{ROLE_META[u.role].label}</Badge> },
    { key: 'status', label: 'Status', align: 'center', sortValue: (u) => u.status, render: (u) => <Badge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status}</Badge> },
    {
      key: 'actions', label: '', align: 'right',
      render: (u) => (
        <div className="row gap6 jc-end">
          <Btn variant="secondary" size="sm" icon="edit" onClick={() => { void openEditor(u) }}>Permissions</Btn>
          <Select
            options={assignableSchoolRoles(app.role).map((r) => ({ value: r, label: ROLE_META[r].label }))}
            value={assignableSchoolRoles(app.role).includes(u.role) ? u.role : assignableSchoolRoles(app.role)[0]}
            onChange={(e) => {
              const role = e.target.value as Role
              void setUserRoles(u.id, [role]).then(
                () => { setRows((list) => list.map((x) => (x.id === u.id ? { ...x, role } : x))); toast.success('Role updated', `${ROLE_META[role].label} · ${u.name}`) },
                (err) => toast.danger('Role update failed', err instanceof ApiError ? err.message : 'Try again.'),
              )
            }}
          />
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
        <Kard icon="users" label="Workspace users" value={rows.length} tone="brand" />
        <Kard icon="checkCircle" label="Active" value={rows.filter((u) => u.status === 'active').length} tone="success" />
      </div>

      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search name, email…" style={{ flex: 1, minWidth: 220 }} />
          <Select
            options={[{ value: 'all', label: 'All roles' }, ...assignableSchoolRoles('owner').map((r) => ({ value: r, label: ROLE_META[r].label }))]}
            value={roleF} onChange={(e) => setRoleF(e.target.value)}
          />
          <Btn variant="primary" icon="plus" onClick={() => setInviteOpen(true)}>Send invite</Btn>
          <Btn variant="secondary" icon="cap" onClick={() => setOnboardKind('teacher')}>Onboard teacher</Btn>
          <Btn variant="secondary" icon="briefcase" onClick={() => setOnboardKind('staff')}>Onboard staff</Btn>
        </div>
        <div className="t-xs muted" style={{ padding: '0 16px 12px' }}>
          Send invite = CRM users (Admin / Principal / Vice-Principal). Teachers &amp; staff = onboard form with name, address &amp; documents.
        </div>

        {loading ? (
          <div style={{ padding: 24 }}><Spinner /></div>
        ) : error ? (
          <div style={{ padding: 8 }}>
            <Empty icon="alert" title="Could not load users" body="Try again." />
            <div className="row jc-center" style={{ marginTop: 12 }}>
              <Btn variant="secondary" onClick={() => void reload()}>Retry</Btn>
            </div>
          </div>
        ) : (
          <DataTable<TeamRow>
            columns={columns}
            rows={filtered}
            pageSize={10}
            rowKey={(u) => u.id}
            initialSort={{ key: 'name', dir: 'asc' }}
            empty={<Empty icon="users" title="No users match" body="Try a different search or role filter." />}
          />
        )}
      </Card>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        schools={schools}
        actorRole={app.role === 'owner' || app.user?.role === 'owner' ? 'owner' : app.role}
        onInvited={() => void reload()}
      />
      {onboardKind && (
        <OnboardPeopleModal open kind={onboardKind} schools={schools} onClose={() => setOnboardKind(null)} />
      )}
    </div>
  )
}
```

Simplify `InviteModal`'s `onInvited` callback — it now just triggers a reload rather than constructing a fake row. Change its prop type (`workspace.tsx:160`) from:
```typescript
  onInvited: (user: TeamUser) => void
```
to:
```typescript
  onInvited: () => void
```
And change the call site inside `submit()` (`workspace.tsx:195-204`) from:
```typescript
      onInvited({
        id: `inv-${Date.now()}`,
        name: email.trim().split('@')[0],
        email: email.trim(),
        role,
        scope: isAllSchools(scope) ? [ALL_SCHOOLS] : resolveScopeIds(scope, schools),
        hue: 200,
        status: 'invited',
        last: 'Pending',
      })
```
to:
```typescript
      onInvited()
```

Delete `EditUserModal` entirely (`workspace.tsx:254-299`, no longer used — replaced by `UserAccessEditor` above). Delete the now-unused `TeamUser` interface (`workspace.tsx:95-104`) and `userStatus` (`workspace.tsx:106-110`, Team's copy — not the school console's, this file has its own). `ScopePicker`'s only remaining caller is `InviteModal` — keep `ScopePicker` as-is, it's still used there.

- [ ] **Step 5: Run tests**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: all PASS.

- [ ] **Step 6: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Manual verification note**

No browser available in an automated pass — if run manually: Owner Console → Users & roles → select a school → Team tab shows real users for that school; Send invite creates a real invite; Permissions opens the real per-user editor; switching schools reloads a different user list.

- [ ] **Step 8: Commit**

```bash
git add src/screens/owner/workspace.tsx src/screens/owner/workspace.test.tsx
git commit -m "feat(owner): wire Team tab to real per-school user data"
```

---

## Task 3: Rewire `RolesTab` — CRM roles only, `staff` dropped

**Files:**
- Modify: `src/screens/owner/workspace.tsx` (`RolesTab`, `clonePerms`)
- Test: `src/screens/owner/workspace.test.tsx`

**Interfaces:**
- Consumes: `useRoleTemplate`/`useSetRoleTemplate` (added in Task 2's imports), `schoolId: string` prop.
- Produces: `RolesTab` persists real tenant-scoped role-template overrides restricted to `OWNER_CONSOLE_ROLES = ['admin', 'principal', 'vice_principal', 'teacher']`.

- [ ] **Step 1: Confirm typecheck baseline**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Write the failing test**

```typescript
vi.mock('@/api/roleTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/roleTemplates')>()
  return {
    ...actual,
    getRoleTemplate: vi.fn().mockResolvedValue([]),
    setRoleTemplate: vi.fn().mockResolvedValue([{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }]),
  }
})

describe('RolesTab — real data, staff dropped', () => {
  it('does not render a Staff column', async () => {
    const { container } = renderScreen()
    const picker = await waitFor(() => within(container).getByLabelText(/select school/i))
    fireEvent.change(picker, { target: { value: '11111111-1111-1111-1111-111111111111' } })
    fireEvent.click(within(container).getByRole('button', { name: /roles & permissions/i }))
    await waitFor(() => expect(within(container).getByText('Teacher')).toBeInTheDocument())
    expect(within(container).queryByText('Staff')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: FAIL — `RolesTab` still renders all 5 `ROLES` columns including Staff (mock matrix), and doesn't call `getRoleTemplate`.

- [ ] **Step 4: Rewrite `RolesTab`**

Add near the top of the Roles section (after the existing `type Matrix = ...` line):
```typescript
const OWNER_CONSOLE_ROLES: GateRole[] = ['admin', 'principal', 'vice_principal', 'teacher']
```

Replace `clonePerms` to only seed the 4 CRM roles (drop `staff`):
```typescript
function clonePerms(): Matrix {
  const out: Matrix = {}
  for (const mod of Object.keys(PERMS)) {
    out[mod] = { admin: [], principal: [], vice_principal: [], teacher: [], staff: [] }
    for (const r of OWNER_CONSOLE_ROLES) out[mod][r] = [...PERMS[mod][r]]
  }
  return out
}
```
(`Matrix`'s type still has a `staff` key structurally since it mirrors `GateRole`, but it's simply never populated/rendered/sent — this keeps the type identical to the school console's `Matrix` for easy code reuse, while `staff` stays an always-empty array.)

Add the same `applyTenantOverrides`/`matrixToOverrides` helpers used by the school console (verbatim, adapted to skip `staff`):
```typescript
function applyTenantOverrides(base: Matrix, tenantOv: RoleTemplateOverride[]): Matrix {
  const out: Matrix = {}
  for (const mod of Object.keys(base)) {
    out[mod] = { admin: [...base[mod].admin], principal: [...base[mod].principal], vice_principal: [...base[mod].vice_principal], teacher: [...base[mod].teacher], staff: [] }
  }
  for (const t of tenantOv) {
    if (t.role === 'staff') continue
    const row = out[t.module]?.[t.role]
    if (!row) continue
    if (t.effect === 'grant' && !row.includes(t.cap)) row.push(t.cap)
    if (t.effect === 'revoke') out[t.module][t.role] = row.filter((c) => c !== t.cap)
  }
  return out
}

function matrixToOverrides(matrix: Matrix): RoleTemplateOverride[] {
  const out: RoleTemplateOverride[] = []
  for (const mod of Object.keys(matrix)) {
    for (const role of OWNER_CONSOLE_ROLES) {
      for (const cap of matrix[mod][role]) out.push({ role, module: mod, cap, effect: 'grant' })
      for (const cap of PERMS[mod][role]) {
        if (!matrix[mod][role].includes(cap)) out.push({ role, module: mod, cap, effect: 'revoke' })
      }
    }
  }
  return out
}
```

Add the import: `import type { RoleTemplateOverride } from '@/api/roleTemplates'`.

Replace the whole `RolesTab` function:
```tsx
function RolesTab({ schoolId }: { schoolId: string }) {
  const toast = useToast()
  const templateQ = useRoleTemplate()
  const setTemplate = useSetRoleTemplate()
  const [matrix, setMatrix] = useState<Matrix>(clonePerms)
  const [loadedFromServer, setLoadedFromServer] = useState(false)

  useEffect(() => { setLoadedFromServer(false) }, [schoolId])
  useEffect(() => {
    if (schoolId && templateQ.data && !loadedFromServer) {
      setMatrix(applyTenantOverrides(clonePerms(), templateQ.data))
      setLoadedFromServer(true)
    }
  }, [schoolId, templateQ.data, loadedFromServer])

  if (!schoolId) return <SelectSchoolPrompt />

  const toggle = (mod: string, role: GateRole, cap: Cap) => {
    setMatrix((m) => {
      const cur = m[mod][role]
      const next = cur.includes(cap) ? cur.filter((c) => c !== cap) : [...cur, cap]
      return { ...m, [mod]: { ...m[mod], [role]: next } }
    })
  }

  const reset = () => {
    setMatrix(applyTenantOverrides(clonePerms(), templateQ.data ?? []))
    toast.info('Matrix reset', 'Reverted to the saved permission set.')
  }

  const save = () => {
    setTemplate.mutate(matrixToOverrides(matrix), {
      onSuccess: () => toast.success('Permissions saved', 'Role access updated for this school.'),
      onError: (e) => toast.danger('Could not save', e instanceof ApiError ? e.message : 'Try again.'),
    })
  }

  if (templateQ.isLoading) return <Card><Spinner /></Card>
  if (templateQ.isError) {
    return (
      <Card>
        <Empty icon="alert" title="Could not load permissions" body="Try again." />
        <div className="row jc-center" style={{ marginTop: 12 }}>
          <Btn variant="secondary" onClick={() => templateQ.refetch()}>Retry</Btn>
        </div>
      </Card>
    )
  }

  return (
    <div className="col gap16">
      <Card>
        <div className="row ai-center gap12 wrap">
          <span className="sm-kpi-ic" style={{ color: 'var(--brand-600)' }}><Icon name="shield" size={18} /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="fw7">Owner is a super-role</div>
            <div className="t-sm muted">
              Owner sits above every school and has full access to all modules. It grants CRM
              roles their access below and <strong>cannot itself be restricted</strong>.
            </div>
          </div>
          <div className="row gap6 wrap">
            {CAPS.map((c) => <Badge key={c} tone={CAP_TONE[c]}>{c} · {CAP_LABEL[c]}</Badge>)}
          </div>
        </div>
      </Card>

      <Card pad={false}>
        <CardHead
          title="Permission matrix"
          sub="Tap V / E / A to grant or revoke per module, per role"
          icon="lock"
          action={
            <div className="row gap8">
              <Btn variant="ghost" size="sm" icon="refresh" onClick={reset}>Reset</Btn>
              <Btn variant="primary" size="sm" icon="check" disabled={setTemplate.isPending} onClick={save}>
                {setTemplate.isPending ? 'Saving…' : 'Save changes'}
              </Btn>
            </div>
          }
        />
        <div style={{ overflowX: 'auto' }}>
          <table className="sm-table">
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Module</th>
                <th className="ta-center">
                  <span className="row ai-center gap4" style={{ justifyContent: 'center' }}>
                    <Icon name="shield" size={13} /> Owner
                  </span>
                </th>
                {OWNER_CONSOLE_ROLES.map((r) => <th key={r} className="ta-center">{ROLE_META[r].label}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.keys(matrix).map((mod) => (
                <tr key={mod}>
                  <td>
                    <div className="fw6">{MODULE_LABEL[mod] ?? mod}</div>
                    <div className="t-xs muted">{mod}</div>
                  </td>
                  <td className="ta-center">
                    <div className="row gap4" style={{ justifyContent: 'center' }}>
                      {CAPS.map((c) => <CapChip key={c} cap={c} active locked />)}
                      <span style={{ color: 'var(--text-2)', alignSelf: 'center', marginLeft: 2 }}><Icon name="lock" size={13} /></span>
                    </div>
                  </td>
                  {OWNER_CONSOLE_ROLES.map((r) => (
                    <td key={r} className="ta-center">
                      <div className="row gap4" style={{ justifyContent: 'center' }}>
                        {CAPS.map((c) => (
                          <CapChip key={c} cap={c} active={matrix[mod][r].includes(c)} onClick={() => toggle(mod, r, c)} />
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
```

Note `CapChip` already exists in this file (`workspace.tsx:599-620`) — no change needed there.

- [ ] **Step 5: Run tests**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: all PASS.

- [ ] **Step 6: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/screens/owner/workspace.tsx src/screens/owner/workspace.test.tsx
git commit -m "feat(owner): wire Roles & permissions tab to real per-school role templates, CRM roles only"
```

---

## Task 4: Rewire `InvitationsTab`

**Files:**
- Modify: `src/screens/owner/workspace.tsx` (`InvitationsTab`)
- Test: `src/screens/owner/workspace.test.tsx`

**Interfaces:**
- Consumes: `listInvitations`, `type Invitation` (`@/api/invitations`), `useResendInvitation`/`useRevokeInvitation` (`@/api/hooks/useInvitationMutations`), `schoolId: string` prop.
- Produces: `InvitationsTab` shows real per-school invitations — this is a verbatim port of `admin.tsx`'s `InvitationsTab` (`admin.tsx:1419-1512`), scoped by `schoolId` instead of the ambient tenant.

- [ ] **Step 1: Confirm typecheck baseline**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Write the failing test**

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: FAIL — `InvitationsTab` still starts with an empty local array and never calls `listInvitations`.

- [ ] **Step 4: Rewrite `InvitationsTab`**

Add imports:
```typescript
import { listInvitations, type Invitation } from '@/api/invitations'
import { useResendInvitation, useRevokeInvitation } from '@/api/hooks/useInvitationMutations'
```

Replace the whole `InvitationsTab` function (delete the local `Invite` interface too):
```tsx
function InvitationsTab({ schoolId }: { schoolId: string }) {
  const toast = useToast()
  const [invites, setInvites] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const resend = useResendInvitation()
  const revoke = useRevokeInvitation()

  const reload = async () => {
    if (!schoolId) return
    setLoading(true); setError(false)
    try {
      setInvites(await listInvitations())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [schoolId])

  if (!schoolId) return <SelectSchoolPrompt />

  const statusTone = (s: Invitation['status']): 'neutral' | 'success' | 'danger' =>
    s === 'accepted' ? 'success' : s === 'revoked' || s === 'expired' ? 'danger' : 'neutral'

  const pendingCount = invites.filter((i) => i.status === 'pending' || i.status === 'expired').length

  const doResend = (inv: Invitation) => {
    resend.mutate(inv.id, {
      onSuccess: () => { toast.success('Invitation resent', `A fresh link was emailed to ${inv.email ?? inv.phone}.`); void reload() },
      onError: (e) => toast.danger('Could not resend', e instanceof ApiError ? e.message : 'Try again.'),
    })
  }

  const doRevoke = (inv: Invitation) => {
    revoke.mutate(inv.id, {
      onSuccess: () => { toast.danger('Invitation revoked', `${inv.email ?? inv.phone} can no longer join.`); void reload() },
      onError: (e) => toast.danger('Could not revoke', e instanceof ApiError ? e.message : 'Try again.'),
    })
  }

  return (
    <Card pad={false}>
      <CardHead title="Invitations" sub={`${pendingCount} awaiting acceptance`} icon="inbox" />
      {loading ? (
        <div style={{ padding: 16 }} className="t-sm muted">Loading invitations…</div>
      ) : error ? (
        <div style={{ padding: 8 }}>
          <Empty icon="alert" title="Could not load invitations" body="Try again." />
          <div className="row jc-center" style={{ marginTop: 12 }}>
            <Btn variant="secondary" onClick={() => void reload()}>Retry</Btn>
          </div>
        </div>
      ) : invites.length === 0 ? (
        <div style={{ padding: 8 }}><Empty icon="inbox" title="No invitations" body="Invite teammates from the Team tab." /></div>
      ) : (
        <div className="col">
          {invites.map((inv) => (
            <div key={inv.id} className="row ai-center gap12 wrap" style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
              <Avatar name={inv.email ?? inv.phone ?? '?'} size={34} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="fw6">{inv.email ?? inv.phone}</div>
                <div className="t-xs muted row ai-center gap6">
                  <Badge tone="neutral">{inv.roleLabel}</Badge>
                  <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                </div>
              </div>
              <div className="t-xs muted" style={{ minWidth: 160 }}>
                Sent {new Date(inv.invitedAt).toLocaleDateString()} · expires {new Date(inv.expiresAt).toLocaleDateString()}
              </div>
              <div className="row gap6">
                {inv.status !== 'accepted' && inv.status !== 'revoked' && (
                  <Btn variant="secondary" size="sm" icon="refresh" onClick={() => doResend(inv)}>Resend</Btn>
                )}
                {inv.status === 'pending' && (
                  <Btn variant="ghost" size="sm" icon="trash" onClick={() => doRevoke(inv)}>Revoke</Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: all PASS.

- [ ] **Step 6: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/screens/owner/workspace.tsx src/screens/owner/workspace.test.tsx
git commit -m "feat(owner): wire Invitations tab to real per-school invitations"
```

---

## Task 5: Rewire `AuditTab`

**Files:**
- Modify: `src/screens/owner/workspace.tsx` (`AuditTab`)
- Test: `src/screens/owner/workspace.test.tsx`

**Interfaces:**
- Consumes: `useAuditLog` (`@/api/hooks/useAudit`), `type AuditEntry` (`@/api/audit`), `schoolId: string` prop.
- Produces: `AuditTab` shows real per-school audit entries — a verbatim port of `admin.tsx`'s `AuditTab` (`admin.tsx:1521-1578`), scoped by `schoolId`.

- [ ] **Step 1: Confirm typecheck baseline**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Write the failing test**

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: FAIL — `AuditTab` still filters the hardcoded `AUDIT` array; "Anil Mehta" is present, "Anita Rao" is not.

- [ ] **Step 4: Rewrite `AuditTab`, remove the mock `AUDIT` array**

Add imports:
```typescript
import { useAuditLog } from '@/api/hooks/useAudit'
import type { AuditEntry } from '@/api/audit'
```

Delete the `AuditRow` interface and the hardcoded `AUDIT` array (`workspace.tsx:760-770`). Add an action-label map and replace the whole `AuditTab` function:
```tsx
const AUDIT_ACTION_LABEL: Record<string, string> = {
  'user.role_changed': 'Changed role',
  'user.permissions_changed': 'Changed permissions',
  'role_template.updated': 'Updated role template',
}

function AuditTab({ schoolId }: { schoolId: string }) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [rows, setRows] = useState<AuditEntry[]>([])
  const action = q.trim() || undefined
  const auditQ = useAuditLog({ action, cursor })

  useEffect(() => { setCursor(undefined); setRows([]) }, [action, schoolId])
  useEffect(() => {
    if (!schoolId || !auditQ.data) return
    setRows((prev) => (cursor ? [...prev, ...auditQ.data.data] : auditQ.data.data))
  }, [schoolId, auditQ.data, cursor])

  if (!schoolId) return <SelectSchoolPrompt />

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <Search value={q} onChange={setQ} placeholder="Filter by action, e.g. user.role_changed…" style={{ flex: 1, minWidth: 220 }} />
        <Badge tone="neutral" icon="clock">Recent activity</Badge>
      </div>
      {auditQ.isLoading && rows.length === 0 ? (
        <div style={{ padding: 24 }}><Spinner /></div>
      ) : auditQ.isError ? (
        <div style={{ padding: 8 }}>
          <Empty icon="alert" title="Could not load activity" body="Try again." />
          <div className="row jc-center" style={{ marginTop: 12 }}>
            <Btn variant="secondary" onClick={() => auditQ.refetch()}>Retry</Btn>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 8 }}><Empty icon="doc" title="No activity yet" body="Nothing matches that search." /></div>
      ) : (
        <div className="col">
          {rows.map((a) => (
            <div key={a.id} className="row ai-center gap12 wrap" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <Avatar name={a.actorName ?? 'System'} size={32} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="t-sm">
                  <span className="fw6">{a.actorName ?? 'System'}</span>{' '}
                  <span className="muted">{(AUDIT_ACTION_LABEL[a.action] ?? a.action).toLowerCase()}</span>{' '}
                  {a.target && <span className="fw6">{a.target}</span>}
                </div>
              </div>
              <Badge tone="info">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</Badge>
              <div className="t-xs muted" style={{ minWidth: 140, textAlign: 'right' }}>{new Date(a.at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      {auditQ.data?.nextCursor && (
        <div className="row jc-center" style={{ padding: 16 }}>
          <Btn variant="ghost" size="sm" disabled={auditQ.isFetching} onClick={() => setCursor(auditQ.data!.nextCursor!)}>
            {auditQ.isFetching ? 'Loading…' : 'Load more'}
          </Btn>
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/screens/owner/workspace.test.tsx
```
Expected: all PASS.

- [ ] **Step 6: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/screens/owner/workspace.tsx src/screens/owner/workspace.test.tsx
git commit -m "feat(owner): wire Audit log tab to real per-school activity, remove fake AUDIT data"
```

---

## Task 6: Full verification

- [ ] **Step 1: Full frontend test suite**

```
npx vitest run
```
Expected: all PASS, except the already-known, unrelated pre-existing gaps (untracked-module load failures like `@/api/classSubjects`) — confirm no NEW failures beyond that baseline.

- [ ] **Step 2: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors in `workspace.tsx`/`workspace.test.tsx` (pre-existing unrelated errors elsewhere are out of scope).

- [ ] **Step 3: Manual end-to-end pass** (if a browser is available)

1. Log in as an owner with 2+ mapped schools → Users & roles.
2. Select School A → Team shows School A's real users; Send invite creates a real invite;
   Roles & permissions shows only Admin/Principal/Vice-Principal/Teacher columns (no
   Staff); toggle a cap → Save → reload → persisted; Invitations shows real pending
   invites; Audit log shows real entries (no "Anil Mehta"/"Ravi Menon"/etc.).
3. Switch to School B → all four tabs refetch and show School B's data, not School A's
   stale cache.
4. Confirm no console errors, no unmocked-network warnings in tests.

## Self-Review Checklist

| Requirement (from spec) | Covered |
|---|---|
| School picker shared across all 4 tabs | Task 1 |
| `switchSchool` used directly (not `enterSchool`) | Task 1 |
| Cache invalidation on school switch (`roleTemplate`, `audit` keys) | Task 1 |
| Team tab real data + CRM-only invite roles | Task 2 |
| Suspend/Restore removed | Task 2 (columns dropped from `TeamTab`'s table) |
| Roles matrix: CRM roles only, `staff` dropped | Task 3 |
| Invitations tab real data | Task 4 |
| Audit tab real data, fake `AUDIT` array removed | Task 5 |
| Pre-existing "Invite user"/"Send invite" test label bug fixed | Task 1 |
| Empty state before school selection, all 4 tabs | Tasks 1-5 (`SelectSchoolPrompt`) |
| No backend changes | True across all tasks — verify no task touches `sms-backend` |
| Tests for all new/changed behavior | Every task has a test step |
| Frequent commits | One commit per task (6 commits total) |
