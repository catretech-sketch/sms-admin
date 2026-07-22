/* ============================================================
   SchoolMate — Owner console workspace
   Users & roles (RBAC) + Owner settings.

   SaaS: school scope is ONLY the owner's mapped tenants from
   /me/schools (or all clients for platform). Never demo schools
   from other clients.
   ============================================================ */
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp, useToast } from '@/lib/hooks'
import {
  PageHead, Tabs, Card, CardHead, Btn, Badge, Avatar, Search, Select, Field, Input,
  Modal, Toggle, Icon, Empty, DataTable, Spinner,
  type Column, type BadgeTone,
} from '@/components/ui'
import { SchoolPhoto } from '@/components/SchoolMark'
import { EditSchoolProfileModal } from '@/components/EditSchoolProfileModal'
import { ROLE_META, PERMS } from '@/data/mockDb'
import type { Role, GateRole, Cap, School } from '@/types'
import { usePortfolioSchools, useSwitchSchool } from '@/api/hooks/useOwner'
import { clientToSchool } from '@/api/ownerMap'
import {
  inviteUser, assignableSchoolRoles,
  listSchoolUsers, setUserRoles, getUserPermissions, setUserPermissions,
  overridesFromApi, fromApiRole, type SchoolUserDto,
} from '@/api/users'
import { useRoleTemplate, useSetRoleTemplate } from '@/api/hooks/useRoleTemplates'
import type { RoleTemplateOverride } from '@/api/roleTemplates'
import { caps, effectiveCaps, cellState, overrideCount, NEXT_CELL_STATE } from '@/lib/gating'
import type { UserOverrides, CellState } from '@/types'
import { switchSchool } from '@/api/mySchools'
import { ApiError } from '@/api/client'

/* ---------- shared helpers ---------- */
const CAPS: Cap[] = ['V', 'E', 'A']
const CAP_LABEL: Record<Cap, string> = { V: 'View', E: 'Edit', A: 'Approve' }
const CAP_TONE: Record<Cap, BadgeTone> = { V: 'info', E: 'warning', A: 'success' }
const CAP_COLOR: Record<Cap, string> = { V: 'var(--info)', E: 'var(--warning)', A: 'var(--success)' }

const MODULE_LABEL: Record<string, string> = {
  setup: 'School setup',
  dashboard: 'Dashboard',
  identity: 'Identity & access',
  sis: 'Student information',
  academics: 'Academics',
  attendance: 'Attendance',
  exams: 'Exams & results',
  fees: 'Fees & finance',
  hr: 'HR & payroll',
  communication: 'Communication',
  operations: 'Operations',
  settings: 'Settings',
}

const roleTone = (r: Role): BadgeTone =>
  r === 'principal' ? 'success' : r === 'vice_principal' ? 'brand' : r === 'admin' ? 'info' : 'neutral'

/* ---------- scope (owner's mapped schools only) ---------- */
export const ALL_SCHOOLS = 'All my schools'

/** True when the scope grants every school in this owner's portfolio. */
export function isAllSchools(scope: string[]): boolean {
  return scope.includes(ALL_SCHOOLS)
}

/** Compact label for the table: "All my schools" | "<name>" | "N schools". */
export function scopeLabel(scope: string[]): string {
  if (isAllSchools(scope)) return ALL_SCHOOLS
  if (scope.length === 0) return 'No school'
  if (scope.length === 1) return scope[0]
  return `${scope.length} schools`
}

/** Toggle a school in the working scope, enforcing All-vs-specific + non-empty. */
export function toggleScope(scope: string[], school: string): string[] {
  if (school === ALL_SCHOOLS) return [ALL_SCHOOLS]
  const specifics = scope.filter((s) => s !== ALL_SCHOOLS)
  const next = specifics.includes(school)
    ? specifics.filter((s) => s !== school)
    : [...specifics, school]
  return next.length === 0 ? [ALL_SCHOOLS] : next
}

/** Scope stores school ids (or ALL_SCHOOLS). Resolve to tenant ids for invites. */
function resolveScopeIds(scope: string[], schools: School[]): string[] {
  if (isAllSchools(scope) || scope.length === 0) return schools.map((s) => s.id)
  const ids = new Set(schools.map((s) => s.id))
  return scope.filter((s) => ids.has(s))
}

export function scopeLabelForSchools(scope: string[], schools: School[]): string {
  if (isAllSchools(scope)) return ALL_SCHOOLS
  const names = schools.filter((s) => scope.includes(s.id)).map((s) => s.name)
  if (names.length === 0) return scopeLabel(scope)
  if (names.length === 1) return names[0]
  return `${names.length} schools`
}

/* ============================================================
   Team
   ============================================================ */
/* Multi-school scope: only schools returned for this login (mapped tenants). */
function ScopePicker({
  scope, onChange, schools,
}: {
  scope: string[]
  onChange: (next: string[]) => void
  schools: School[]
}) {
  const all = isAllSchools(scope)
  if (schools.length === 0) {
    return (
      <Field label="Scope" hint="Create a school first — access is limited to your mapped schools.">
        <div className="t-sm muted">No schools mapped to this login.</div>
      </Field>
    )
  }
  return (
    <Field label="Scope (school id)" required hint="Pick by school id — only your mapped tenants.">
      <div className="col gap8" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
        <label className="row ai-center gap8" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={all} onChange={() => onChange(toggleScope(scope, ALL_SCHOOLS))} />
          <span className="fw6">{ALL_SCHOOLS}</span>
          <span className="t-xs muted">({schools.length})</span>
        </label>
        {schools.map((s) => (
          <label key={s.id} className="row ai-center gap8" style={{ cursor: 'pointer', opacity: all ? 0.6 : 1 }}>
            <input
              type="checkbox"
              checked={!all && scope.includes(s.id)}
              onChange={() => onChange(toggleScope(scope, s.id))}
            />
            <span>
              {s.name}
              <span className="t-xs muted" style={{ marginLeft: 6 }} title={s.id}>{s.id.slice(0, 8)}…</span>
            </span>
          </label>
        ))}
      </div>
    </Field>
  )
}

function InviteModal({
  open, onClose, schools, onInvited, actorRole,
}: {
  open: boolean
  onClose: () => void
  schools: School[]
  onInvited: () => void
  actorRole: Role
}) {
  const toast = useToast()
  const roleOptions = assignableSchoolRoles(actorRole)
  const defaultRole: Role = roleOptions.includes('admin') ? 'admin' : roleOptions[0] ?? 'teacher'
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>(defaultRole)
  const [scope, setScope] = useState<string[]>([ALL_SCHOOLS])
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setEmail('')
    setRole(defaultRole)
    setScope([ALL_SCHOOLS])
    setBusy(false)
  }

  const submit = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast.danger('Valid email required', 'Enter the teammate’s work email address.')
      return
    }
    const tenantIds = resolveScopeIds(scope, schools)
    if (tenantIds.length === 0) {
      toast.danger('No school selected', 'Pick at least one of your schools.')
      return
    }
    setBusy(true)
    try {
      for (const tenantId of tenantIds) {
        await switchSchool(tenantId)
        await inviteUser(email.trim(), role)
      }
      const where = scopeLabelForSchools(scope, schools)
      onInvited()
      toast.success(
        'Invite sent',
        `${ROLE_META[role].label} · ${where}. ${email} got a 6-digit setup code by email (not a link). They open SchoolMate → set password with that code → then they can sign in.`,
      )
      reset()
      onClose()
    } catch (e) {
      toast.danger('Send invite failed', e instanceof ApiError ? e.message : 'Could not invite for that school.')
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open} onClose={onClose} icon="user"
      title="Send invite"
      sub="CRM login access only: Admin · Principal · Vice-Principal. Teachers & staff use the Onboard form (name, address, documents)."
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={() => { void submit() }} disabled={busy || schools.length === 0 || roleOptions.length === 0}>
            {busy ? 'Sending…' : 'Send invite'}
          </Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Work email" required>
          <Input icon="message" type="email" value={email} placeholder="admin@school.edu" onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field
          label="CRM role"
          required
          hint={ROLE_META[role]?.desc ?? 'Choose a CRM access role.'}
        >
          <Select
            options={roleOptions.map((r) => ({
              value: r,
              label: `${ROLE_META[r].label} — CRM access`,
            }))}
            value={role} onChange={(e) => setRole(e.target.value as Role)}
          />
        </Field>
        <ScopePicker scope={scope} onChange={setScope} schools={schools} />
      </div>
    </Modal>
  )
}

/** Open People onboard form (teacher/staff) — name, address, documents — not CRM Send invite. */
function OnboardPeopleModal({
  open, onClose, schools, kind,
}: {
  open: boolean
  onClose: () => void
  schools: School[]
  kind: 'teacher' | 'staff'
}) {
  const app = useApp()
  const toast = useToast()
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && schools[0]) setSchoolId(schools[0].id)
  }, [open, schools])

  const submit = async () => {
    const school = schools.find((s) => s.id === schoolId)
    if (!school) {
      toast.danger('Pick a school', 'Choose which school to onboard into.')
      return
    }
    setBusy(true)
    try {
      const ok = await app.enterSchool(school.id, school)
      if (!ok) {
        toast.danger('School not active', 'Catre must activate the school before onboarding teachers or staff.')
        return
      }
      onClose()
      app.go(kind === 'teacher' ? 'school.teachers.add' : 'school.staff.add')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open} onClose={onClose} icon="user"
      title={kind === 'teacher' ? 'Onboard teacher' : 'Onboard staff'}
      sub="Opens the full form (name, address, documents). CRM roles use Send invite."
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" icon="arrowRight" onClick={() => { void submit() }} disabled={busy || !schoolId}>
            {busy ? 'Opening…' : 'Open onboard form'}
          </Btn>
        </div>
      }
    >
      <Field label="School" required hint="Teacher/staff records belong to one school id.">
        <Select
          options={schools.map((s) => ({ value: s.id, label: `${s.name} · ${s.id.slice(0, 8)}…` }))}
          value={schoolId}
          onChange={(e) => setSchoolId(e.target.value)}
        />
      </Field>
    </Modal>
  )
}

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

interface TeamRow { id: string; name: string; email: string; role: Role; status: string; last: string }

function mapTeamRow(u: SchoolUserDto): TeamRow {
  const email = u.email ?? '—'
  return {
    id: u.id,
    name: email.includes('@') ? email.split('@')[0] : email,
    email,
    role: fromApiRole(u.roles[0] ?? 'teacher'),
    status: u.status,
    last: u.created_at,
  }
}

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
      render: (u) => {
        const crmRoles = assignableSchoolRoles(app.role)
        const isCrmRole = crmRoles.includes(u.role)
        return (
          <div className="row gap6 jc-end">
            <Btn variant="secondary" size="sm" icon="edit" onClick={() => { void openEditor(u) }}>Permissions</Btn>
            {isCrmRole ? (
              <Select
                options={crmRoles.map((r) => ({ value: r, label: ROLE_META[r].label }))}
                value={u.role}
                onChange={(e) => {
                  const role = e.target.value as Role
                  void setUserRoles(u.id, [role]).then(
                    () => { setRows((list) => list.map((x) => (x.id === u.id ? { ...x, role } : x))); toast.success('Role updated', `${ROLE_META[role].label} · ${u.name}`) },
                    (err) => toast.danger('Role update failed', err instanceof ApiError ? err.message : 'Try again.'),
                  )
                }}
              />
            ) : (
              <Badge tone={roleTone(u.role)}>{ROLE_META[u.role].label}</Badge>
            )}
          </div>
        )
      },
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

/* small KPI card local to this file (avoids spark dependency) */
function Kard({ icon, label, value, tone }: { icon: string; label: string; value: ReactNode; tone: BadgeTone }) {
  return (
    <Card>
      <div className="row ai-center gap12">
        <span className="sm-kpi-ic"><Icon name={icon} size={18} /></span>
        <div>
          <div className="fw7 t-xl">{value}</div>
          <div className="t-xs muted">{label}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}><Badge tone={tone} dot>{label.split(' ')[0]}</Badge></div>
      </div>
    </Card>
  )
}

/* ============================================================
   Roles & permissions — interactive matrix
   ============================================================ */
type Matrix = Record<string, Record<GateRole, Cap[]>>

const OWNER_CONSOLE_ROLES: GateRole[] = ['admin', 'principal', 'vice_principal', 'teacher']

function clonePerms(): Matrix {
  const out: Matrix = {}
  for (const mod of Object.keys(PERMS)) {
    out[mod] = { admin: [], principal: [], vice_principal: [], teacher: [], staff: [] }
    for (const r of OWNER_CONSOLE_ROLES) out[mod][r] = [...PERMS[mod][r]]
  }
  return out
}

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

function CapChip({ cap, active, locked, onClick }: { cap: Cap; active: boolean; locked?: boolean; onClick?: () => void }) {
  const color = CAP_COLOR[cap]
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      title={`${CAP_LABEL[cap]}${locked ? ' (locked)' : ''}`}
      style={{
        width: 30, height: 26, borderRadius: 7, fontSize: 12, fontWeight: 700,
        cursor: locked ? 'default' : 'pointer',
        border: `1px solid ${active ? color : 'var(--border)'}`,
        background: active ? color : 'transparent',
        color: active ? '#fff' : 'var(--text-2)',
        opacity: locked ? 0.85 : 1,
        transition: 'all .12s ease',
      }}
    >
      {cap}
    </button>
  )
}

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

/* ============================================================
   Invitations
   ============================================================ */
interface Invite { id: string; email: string; role: Role; scope: string; sent: string; expires: string }

function InvitationsTab({ schoolId }: { schoolId: string }) {
  const toast = useToast()
  const [invites, setInvites] = useState<Invite[]>([])

  if (!schoolId) return <SelectSchoolPrompt />

  const resend = (inv: Invite) => toast.success('Invitation resent', `A fresh link was emailed to ${inv.email}.`)
  const revoke = (inv: Invite) => {
    setInvites((list) => list.filter((i) => i.id !== inv.id))
    toast.danger('Invitation revoked', `${inv.email} can no longer join.`)
  }

  return (
    <Card pad={false}>
      <CardHead title="Pending invitations" sub={`${invites.length} awaiting acceptance`} icon="inbox" />
      {invites.length === 0
        ? <div style={{ padding: 8 }}><Empty icon="inbox" title="No pending invitations" body="Invite teammates from the Team tab." /></div>
        : (
          <div className="col">
            {invites.map((inv) => (
              <div key={inv.id} className="row ai-center gap12 wrap" style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
                <Avatar name={inv.email} size={34} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="fw6">{inv.email}</div>
                  <div className="t-xs muted row ai-center gap6">
                    <Badge tone={roleTone(inv.role)}>{ROLE_META[inv.role].label}</Badge>
                    <span><Icon name="building" size={12} /> {inv.scope}</span>
                  </div>
                </div>
                <div className="t-xs muted" style={{ minWidth: 120 }}>Sent {inv.sent} · expires {inv.expires}</div>
                <div className="row gap6">
                  <Btn variant="secondary" size="sm" icon="refresh" onClick={() => resend(inv)}>Resend</Btn>
                  <Btn variant="ghost" size="sm" icon="trash" onClick={() => revoke(inv)}>Revoke</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
    </Card>
  )
}

/* ============================================================
   Audit log
   ============================================================ */
interface AuditRow { id: string; who: string; hue: number; action: string; target: string; module: string; when: string; tone: BadgeTone }
const AUDIT: AuditRow[] = [
  { id: 'A-1', who: 'Anil Mehta', hue: 250, action: 'Granted Approve', target: 'Principal · Fees', module: 'fees', when: 'Just now', tone: 'success' },
  { id: 'A-2', who: 'Anil Mehta', hue: 250, action: 'Invited user', target: 'diya.nair@schoolmate.io', module: 'identity', when: '12m ago', tone: 'info' },
  { id: 'A-3', who: 'Ravi Menon', hue: 200, action: 'Changed plan', target: 'Sunrise International → Gold', module: 'settings', when: '1h ago', tone: 'brand' },
  { id: 'A-4', who: 'Anil Mehta', hue: 250, action: 'Suspended user', target: 'Rohan Das', module: 'identity', when: '3h ago', tone: 'danger' },
  { id: 'A-5', who: 'Sunita Rao', hue: 330, action: 'Published results', target: 'Term 1 · Grade X', module: 'exams', when: 'Yesterday', tone: 'success' },
  { id: 'A-6', who: 'Anil Mehta', hue: 250, action: 'Revoked Edit', target: 'Teacher · Attendance', module: 'attendance', when: 'Yesterday', tone: 'warning' },
  { id: 'A-7', who: 'Kabir Sharma', hue: 40, action: 'Regenerated API key', target: 'Production key', module: 'settings', when: '2 days ago', tone: 'neutral' },
  { id: 'A-8', who: 'Anil Mehta', hue: 250, action: 'Updated branding', target: 'Accent colour', module: 'settings', when: '3 days ago', tone: 'info' },
]

function AuditTab({ schoolId }: { schoolId: string }) {
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return AUDIT
    return AUDIT.filter((a) => (a.who + a.action + a.target + a.module).toLowerCase().includes(needle))
  }, [q])

  if (!schoolId) return <SelectSchoolPrompt />

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <Search value={q} onChange={setQ} placeholder="Search activity…" style={{ flex: 1, minWidth: 220 }} />
        <Badge tone="neutral" icon="clock">Last 7 days</Badge>
      </div>
      {rows.length === 0
        ? <div style={{ padding: 8 }}><Empty icon="doc" title="No activity" body="Nothing matches that search." /></div>
        : (
          <div className="col">
            {rows.map((a) => (
              <div key={a.id} className="row ai-center gap12 wrap" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <Avatar name={a.who} hue={a.hue} size={32} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="t-sm">
                    <span className="fw6">{a.who}</span> <span className="muted">{a.action.toLowerCase()}</span> <span className="fw6">{a.target}</span>
                  </div>
                  <div className="t-xs muted">{a.module}</div>
                </div>
                <Badge tone={a.tone}>{a.action}</Badge>
                <div className="t-xs muted" style={{ minWidth: 90, textAlign: 'right' }}>{a.when}</div>
              </div>
            ))}
          </div>
        )}
    </Card>
  )
}

/* ============================================================
   OwnerUsers — shell
   ============================================================ */
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

/* ============================================================
   Owner settings
   ============================================================ */
function FormGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>{children}</div>
}

function SaveBar({ onSave }: { onSave: () => void }) {
  return (
    <div className="row gap8 jc-end" style={{ marginTop: 16 }}>
      <Btn variant="primary" icon="check" onClick={onSave}>Save changes</Btn>
    </div>
  )
}

/* ---------- Company ---------- */
function CompanyTab() {
  const app = useApp()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: clients = [], isLoading, isError } = usePortfolioSchools(app.isPlatform)
  const schools = useMemo(() => clients.map(clientToSchool), [clients])
  const [editId, setEditId] = useState<string | null>(null)
  const editSchool = schools.find((s) => s.id === editId) ?? null
  const editClient = clients.find((c) => c.id === editId) ?? null

  if (isLoading) {
    return (
      <Card>
        <CardHead title="Company profile" sub="Edit school name, address, logo and photo" icon="building" />
        <div className="row ai-center jc-center" style={{ padding: 48 }}><Spinner /></div>
      </Card>
    )
  }

  if (isError || schools.length === 0) {
    return (
      <Card>
        <CardHead title="Company profile" sub="Edit school name, address, logo and photo" icon="building" />
        <Empty
          icon="building"
          title="No schools yet"
          body="Create a school first, then edit its profile, logo and round dashboard photo here."
        />
      </Card>
    )
  }

  return (
    <div className="col gap16">
      <EditSchoolProfileModal
        open={!!editSchool}
        school={editSchool}
        client={editClient}
        isPlatform={app.isPlatform}
        onClose={() => setEditId(null)}
        onSaved={(s) => {
          app.rememberSchool(s)
          void qc.invalidateQueries({ queryKey: ['owner'] })
        }}
      />
      <Card>
        <CardHead
          title="School profiles"
          sub="Owner / admin can edit name, address, contact, logo and school image for each school"
          icon="building"
        />
        <div className="col gap10" style={{ marginTop: 16 }}>
          {schools.map((s) => (
            <div
              key={s.id}
              className="row ai-center gap12"
              style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}
            >
              <SchoolPhoto school={s} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-md fw6">{s.name}</div>
                <div className="t-xs muted3">{s.city} · {s.status}</div>
              </div>
              <Btn size="sm" icon="edit" onClick={() => setEditId(s.id)}>Edit</Btn>
              <Btn
                size="sm"
                variant="secondary"
                icon="arrowRight"
                onClick={() => {
                  void app.enterSchool(s.id, s).then((ok) => {
                    if (!ok) {
                      toast.info(
                        'School not active',
                        `${s.name} opens only after Catre approves payment. You can still Edit profile and images.`,
                      )
                    }
                  })
                }}
              >
                Open
              </Btn>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ---------- Branding ---------- */
const ACCENTS = ['#4f46e5', '#16a34a', '#0ea5e9', '#f59e0b', '#ec4899', '#0d9488']

function BrandingTab() {
  const toast = useToast()
  const [accent, setAccent] = useState(ACCENTS[0])
  const [logoUrl, setLogoUrl] = useState('https://cdn.schoolmate.io/logo.svg')
  const [darkDefault, setDarkDefault] = useState(false)
  const [showSchoolLogos, setShowSchoolLogos] = useState(true)
  const [whiteLabel, setWhiteLabel] = useState(false)

  return (
    <div className="col gap16">
      <Card>
        <CardHead title="Brand identity" sub="Colours & logo applied across tenant consoles" icon="sparkle" />
        <div className="col gap16" style={{ marginTop: 16 }}>
          <Field label="Accent colour" hint="Used for primary buttons, links & highlights.">
            <div className="row ai-center gap8 wrap">
              {ACCENTS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setAccent(c)}
                  title={c}
                  style={{
                    width: 30, height: 30, borderRadius: 8, cursor: 'pointer', background: c,
                    border: accent === c ? '2px solid var(--text)' : '2px solid transparent',
                  }}
                />
              ))}
              <Input value={accent} onChange={(e) => setAccent(e.target.value)} style={{ width: 120 }} />
            </div>
          </Field>
          <FormGrid>
            <Field label="Logo URL" hint="SVG or PNG, transparent background recommended.">
              <Input icon="globe" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            </Field>
            <Field label="Favicon URL">
              <Input icon="globe" placeholder="https://cdn.schoolmate.io/favicon.ico" defaultValue="" />
            </Field>
          </FormGrid>
        </div>
      </Card>

      <Card>
        <CardHead title="Display options" icon="settings" />
        <div className="col gap12" style={{ marginTop: 16 }}>
          <Toggle checked={darkDefault} onChange={() => setDarkDefault((v) => !v)} label="Default to dark theme for new users" />
          <Toggle checked={showSchoolLogos} onChange={() => setShowSchoolLogos((v) => !v)} label="Show individual school logos in the switcher" />
          <Toggle checked={whiteLabel} onChange={() => setWhiteLabel((v) => !v)} label="White-label (hide “Powered by SchoolMate”)" />
        </div>
        <SaveBar onSave={() => toast.success('Branding saved', 'Brand settings applied across consoles.')} />
      </Card>
    </div>
  )
}

/* ---------- Default policies ---------- */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function PoliciesTab() {
  const toast = useToast()
  const [days, setDays] = useState<Record<string, boolean>>({ Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false })
  const [grading, setGrading] = useState('cbse')
  const [periodStart, setPeriodStart] = useState('08:00')
  const [periodEnd, setPeriodEnd] = useState('14:30')
  const [periodLen, setPeriodLen] = useState('45')
  const [weekStart, setWeekStart] = useState('Mon')
  const [lockAttendance, setLockAttendance] = useState(true)

  const toggleDay = (d: string) => setDays((m) => ({ ...m, [d]: !m[d] }))

  return (
    <div className="col gap16">
      <Card>
        <CardHead title="Working days" sub="Applied as the default calendar for new schools" icon="calendar" />
        <div className="row gap8 wrap" style={{ marginTop: 16 }}>
          {DAYS.map((d) => (
            <button
              key={d} type="button" onClick={() => toggleDay(d)}
              style={{
                padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                border: `1px solid ${days[d] ? 'var(--brand-600)' : 'var(--border)'}`,
                background: days[d] ? 'var(--brand-600)' : 'transparent',
                color: days[d] ? '#fff' : 'var(--text-2)',
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title="Academic defaults" icon="cap" />
        <div className="col gap16" style={{ marginTop: 16 }}>
          <FormGrid>
            <Field label="Grading scheme">
              <Select
                options={[
                  { value: 'cbse', label: 'CBSE (A1–E2)' },
                  { value: 'pct', label: 'Percentage (0–100)' },
                  { value: 'gpa', label: 'GPA (0–10)' },
                  { value: 'letter', label: 'Letter (A–F)' },
                ]}
                value={grading} onChange={(e) => setGrading(e.target.value)}
              />
            </Field>
            <Field label="Week starts on">
              <Select options={DAYS} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </Field>
            <Field label="School day starts">
              <Input type="time" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </Field>
            <Field label="School day ends">
              <Input type="time" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
            <Field label="Period length (minutes)">
              <Input type="number" value={periodLen} onChange={(e) => setPeriodLen(e.target.value)} />
            </Field>
          </FormGrid>
          <Toggle checked={lockAttendance} onChange={() => setLockAttendance((v) => !v)} label="Lock attendance after the school day ends" />
        </div>
        <SaveBar onSave={() => toast.success('Policies saved', 'Default policies updated for new schools.')} />
      </Card>
    </div>
  )
}

/* ---------- API & webhooks ---------- */
function ApiTab() {
  const toast = useToast()
  const [apiKey, setApiKey] = useState('smk_demo_0000xxxxxxxxxxxxxxxxxxxxxxxx')
  const [revealed, setRevealed] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('https://hooks.schoolmate.io/v1/events')
  const [secret, setSecret] = useState('whsec_3b9f1a2c4d6e8f0a1b2c3d4e5f6a7b8c')
  const [enrolEvt, setEnrolEvt] = useState(true)
  const [feeEvt, setFeeEvt] = useState(true)
  const [attEvt, setAttEvt] = useState(false)

  const masked = apiKey.slice(0, 7) + '•'.repeat(18) + apiKey.slice(-4)

  const regenerate = () => {
    const hex = '0123456789abcdef'
    let k = 'smk_demo_'
    for (let i = 0; i < 32; i++) k += hex[Math.floor(Math.random() * 16)]
    setApiKey(k)
    setRevealed(false)
    toast.danger('API key regenerated', 'The previous key has been revoked immediately.')
  }

  const copy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(apiKey).catch(() => {})
    toast.success('Copied', 'API key copied to clipboard.')
  }

  return (
    <div className="col gap16">
      <Card>
        <CardHead title="API access" sub="Use this key to authenticate server-side integrations" icon="key" />
        <div className="col gap16" style={{ marginTop: 16 }}>
          <Field label="Production API key" hint="Keep this secret. Treat it like a password.">
            <div className="row ai-center gap8 wrap">
              <Input
                value={revealed ? apiKey : masked} readOnly icon="lock"
                style={{ flex: 1, minWidth: 260, fontFamily: 'monospace' }}
              />
              <Btn variant="ghost" size="sm" icon={revealed ? 'lock' : 'eye'} onClick={() => setRevealed((v) => !v)}>
                {revealed ? 'Hide' : 'Reveal'}
              </Btn>
              <Btn variant="secondary" size="sm" icon="clipboard" onClick={copy}>Copy</Btn>
              <Btn variant="danger" size="sm" icon="refresh" onClick={regenerate}>Regenerate</Btn>
            </div>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Webhooks" sub="Receive real-time event notifications" icon="zap" />
        <div className="col gap16" style={{ marginTop: 16 }}>
          <FormGrid>
            <Field label="Endpoint URL">
              <Input icon="globe" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            </Field>
            <Field label="Signing secret">
              <Input icon="lock" value={secret} onChange={(e) => setSecret(e.target.value)} style={{ fontFamily: 'monospace' }} />
            </Field>
          </FormGrid>
          <div>
            <div className="sm-card-sub" style={{ marginBottom: 8, fontWeight: 600 }}>Subscribed events</div>
            <div className="col gap12">
              <Toggle checked={enrolEvt} onChange={() => setEnrolEvt((v) => !v)} label="student.enrolled" />
              <Toggle checked={feeEvt} onChange={() => setFeeEvt((v) => !v)} label="fee.paid" />
              <Toggle checked={attEvt} onChange={() => setAttEvt((v) => !v)} label="attendance.submitted" />
            </div>
          </div>
        </div>
        <div className="row gap8 jc-end" style={{ marginTop: 16 }}>
          <Btn variant="ghost" icon="zap" onClick={() => toast.info('Test event sent', 'A sample payload was delivered to your endpoint.')}>Send test</Btn>
          <Btn variant="primary" icon="check" onClick={() => toast.success('Webhooks saved', 'Endpoint configuration updated.')}>Save changes</Btn>
        </div>
      </Card>
    </div>
  )
}

function OwnerSettings() {
  const [tab, setTab] = useState('company')
  return (
    <div>
      <PageHead title="Owner settings" sub="Organisation-wide configuration for your SchoolMate account" />
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'company', label: 'Company', icon: 'building' },
          { value: 'branding', label: 'Branding', icon: 'sparkle' },
          { value: 'policies', label: 'Default policies', icon: 'calendar' },
          { value: 'api', label: 'API & webhooks', icon: 'key' },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {tab === 'company' && <CompanyTab />}
        {tab === 'branding' && <BrandingTab />}
        {tab === 'policies' && <PoliciesTab />}
        {tab === 'api' && <ApiTab />}
      </div>
    </div>
  )
}

/* ---------- export contract ---------- */
export const workspaceScreens: Record<string, ComponentType> = {
  'owner.users': OwnerUsers,
  'owner.settings': OwnerSettings,
}
