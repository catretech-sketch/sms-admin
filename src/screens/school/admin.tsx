/* ============================================================
   SchoolMate — School console: administration screens.
   Reports · Settings · Identity & access (RBAC).
   Phase 5 screens. Frontend-only, mock data.

   - Reports is its own sidebar tab (Academic / Attendance /
     Finance / Operations categories with Excel export).
   - Settings covers school profile & branding, localization and
     plan / feature visibility with upgrade prompts.
   - Identity & access is Admin-only (the router guards non-admins)
     and pairs a Users table with an interactive permission matrix.
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast, useTheme } from '@/lib/hooks'
import { tierIncludes, caps, effectiveCaps, cellState, overrideCount, NEXT_CELL_STATE } from '@/lib/gating'
import {
  PageHead, Tabs, Card, CardHead, Btn, Badge, TierPill, Avatar, Search, Select,
  Field, Input, Toggle, Icon, Empty, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui'
import { ROLES, ROLE_META, PERMS, TIER_META, teachers, staff } from '@/data/mockDb'
import type { Role, Cap, Tier, CellState, UserOverrides } from '@/types'

/* ============================================================
   Reports
   ============================================================ */
interface ReportDef { name: string; desc: string }
const REPORT_CATEGORIES: { value: string; label: string; icon: string; reports: ReportDef[] }[] = [
  {
    value: 'academic', label: 'Academic', icon: 'cap',
    reports: [
      { name: 'Consolidated mark sheet', desc: 'Subject-wise marks & grades for every class & section.' },
      { name: 'Class performance summary', desc: 'Pass %, averages and toppers across all classes.' },
      { name: 'Weak-student tracker', desc: 'Students below 40% flagged for remedial action.' },
      { name: 'Subject analysis', desc: 'Mean, median & distribution per subject and exam.' },
    ],
  },
  {
    value: 'attendance', label: 'Attendance', icon: 'check',
    reports: [
      { name: 'Daily attendance register', desc: 'Present / absent / late per class for the period.' },
      { name: 'Monthly attendance summary', desc: 'Per-student attendance % rolled up by month.' },
      { name: 'Chronic absentee list', desc: 'Students under 75% attendance for the term.' },
      { name: 'Staff attendance report', desc: 'Teaching & non-teaching staff attendance log.' },
    ],
  },
  {
    value: 'finance', label: 'Finance', icon: 'rupee',
    reports: [
      { name: 'Fee collection summary', desc: 'Collected, pending & waived fees by grade.' },
      { name: 'Outstanding dues register', desc: 'Student-wise pending balances with ageing.' },
      { name: 'Daily collection report', desc: 'Receipts by mode (cash / online / cheque).' },
      { name: 'Payroll register', desc: 'Gross, deductions & net pay for all staff.' },
    ],
  },
  {
    value: 'operations', label: 'Operations', icon: 'box',
    reports: [
      { name: 'Transport route manifest', desc: 'Buses, routes, stops & assigned students.' },
      { name: 'Library circulation report', desc: 'Issued, returned & overdue titles.' },
      { name: 'Inventory & assets', desc: 'Stock levels and asset allocation by department.' },
      { name: 'Visitor & gate log', desc: 'Entry / exit records for visitors and vehicles.' },
    ],
  },
]

const PERIODS = ['Term 1 · 2026', 'Term 2 · 2026', 'Mid-Term · 2026', 'Full Year · 2025-26']

function SchoolReports() {
  const toast = useToast()
  const [cat, setCat] = useState('academic')
  const [period, setPeriod] = useState(PERIODS[0])

  const active = REPORT_CATEGORIES.find((c) => c.value === cat) ?? REPORT_CATEGORIES[0]

  const exportRow = (name: string) =>
    toast.success('Exported .xlsx', `${name} (${period}) downloaded.`)

  return (
    <div>
      <PageHead
        title="Reports"
        sub="Generate & export school reports across academics, attendance, finance and operations"
        actions={
          <Select
            options={PERIODS}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        }
      />
      <Tabs
        value={cat} onChange={setCat}
        tabs={REPORT_CATEGORIES.map((c) => ({ value: c.value, label: c.label, icon: c.icon, count: c.reports.length }))}
      />
      <div style={{ marginTop: 16 }}>
        <Card pad={false}>
          <CardHead
            title={`${active.label} reports`}
            sub={`${active.reports.length} reports · ${period}`}
            icon={active.icon}
          />
          {active.reports.length === 0
            ? <div style={{ padding: 8 }}><Empty icon="doc" title="No reports" body="No reports available for this category." /></div>
            : (
              <div className="col">
                {active.reports.map((r) => (
                  <div key={r.name} className="row ai-center gap12 wrap" style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
                    <span className="sm-card-ic"><Icon name="doc" size={16} /></span>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div className="fw6">{r.name}</div>
                      <div className="t-xs muted">{r.desc}</div>
                    </div>
                    <Badge tone="neutral" icon="calendar">{period}</Badge>
                    <Btn variant="secondary" size="sm" icon="download" onClick={() => exportRow(r.name)}>Export Excel</Btn>
                  </div>
                ))}
              </div>
            )}
        </Card>
      </div>
    </div>
  )
}

/* ============================================================
   Settings
   ============================================================ */
const LANG_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी Hindi' },
  { value: 'ar', label: 'العربية Arabic (RTL)' },
  { value: 'ta', label: 'தமிழ் Tamil' },
]

/* Each visible plan feature maps to the gating key for its tier:
   silver -> 'sis', gold -> 'hr_payroll', platinum -> 'transport.gps'. */
const FEATURE_GROUPS: { tier: Tier; key: string; features: string[] }[] = [
  { tier: 'silver', key: 'sis', features: ['SIS · Academics · Attendance', 'Examinations & report cards', 'Fees & online payments', 'Communication & complaints'] },
  { tier: 'gold', key: 'hr_payroll', features: ['HR & Payroll', 'Weak-student analytics', 'Advanced reporting'] },
  { tier: 'platinum', key: 'transport.gps', features: ['Geo-fenced attendance', 'Live GPS bus tracking', 'Dedicated support'] },
]

function SettingsScreen() {
  const app = useApp()
  const toast = useToast()
  const { theme, toggleTheme } = useTheme()

  const nextTier: Tier = app.plan === 'silver' ? 'gold' : 'platinum'

  return (
    <div>
      <PageHead title="Settings" sub={app.school.name} />
      <div className="sm-grid-2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'flex-start' }}>
        {/* Left column */}
        <div className="col gap16">
          <Card>
            <CardHead title="School profile & branding" icon="building" />
            <div className="row ai-center gap14" style={{ marginTop: 16 }}>
              <div className="sm-card-ic" style={{ background: app.school.color, color: '#fff', width: 54, height: 54, fontSize: 20, fontWeight: 700, borderRadius: 14 }}>
                {app.school.logo}
              </div>
              <div className="flex1" style={{ flex: 1 }}>
                <Field label="School name"><Input defaultValue={app.school.name} /></Field>
              </div>
            </div>
            <div className="sm-grid-2" style={{ marginTop: 14 }}>
              <Field label="City"><Input icon="pin" defaultValue={app.school.city} /></Field>
              <Field label="Timezone"><Input icon="globe" defaultValue={app.school.tz} /></Field>
            </div>
            <div className="row gap8 jc-end" style={{ marginTop: 16 }}>
              <Btn variant="primary" icon="check" onClick={() => toast.success('Profile saved', 'School profile & branding updated.')}>Save changes</Btn>
            </div>
          </Card>

          <Card>
            <CardHead title="Localization" sub="Language · direction · theme" icon="globe" />
            <div style={{ marginTop: 16 }}>
              <Field label="Default language">
                <Select options={LANG_OPTIONS} value={app.lang} onChange={(e) => app.setLang(e.target.value)} />
              </Field>
            </div>
            <div className="row ai-center jc-between" style={{ marginTop: 14 }}>
              <div>
                <div className="fw6 t-md">Right-to-left layout</div>
                <div className="t-xs muted">Auto-enabled for Arabic & Urdu</div>
              </div>
              <Toggle checked={app.dir === 'rtl'} onChange={() => app.setLang(app.dir === 'rtl' ? 'en' : 'ar')} />
            </div>
            <div className="row ai-center jc-between" style={{ marginTop: 14 }}>
              <div>
                <div className="fw6 t-md">Dark mode</div>
                <div className="t-xs muted">Theme preference</div>
              </div>
              <Toggle checked={theme === 'dark'} onChange={toggleTheme} />
            </div>
          </Card>
        </div>

        {/* Right column */}
        <Card pad={false}>
          <CardHead
            title="Plan & feature visibility"
            sub={`Current plan: ${TIER_META[app.plan].label}`}
            icon="layers"
            action={<TierPill plan={app.plan} />}
          />
          <div className="col" style={{ padding: '4px 16px 12px' }}>
            {FEATURE_GROUPS.map((g) => {
              const unlocked = tierIncludes(app.plan, g.key)
              return (
                <div key={g.tier} style={{ marginTop: 12 }}>
                  <div className="row ai-center jc-between" style={{ marginBottom: 4 }}>
                    <TierPill plan={g.tier} />
                    {unlocked
                      ? <Badge tone="success" soft>Included</Badge>
                      : <Badge tone="neutral" icon="lock">Locked</Badge>}
                  </div>
                  {g.features.map((f) => (
                    <div key={f} className="row ai-center gap10" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      {unlocked
                        ? <Icon name="checkCircle" size={17} style={{ color: 'var(--success)' }} />
                        : <Icon name="lock" size={16} style={{ color: TIER_META[g.tier].color }} />}
                      <span className="t-md" style={{ color: unlocked ? 'var(--text)' : 'var(--text-2)', fontWeight: unlocked ? 500 : 400 }}>{f}</span>
                    </div>
                  ))}
                </div>
              )
            })}
            {app.plan !== 'platinum' && (
              <Btn
                variant={app.plan === 'silver' ? 'gold' : 'platinum'} icon="sparkle"
                style={{ width: '100%', marginTop: 16 }}
                onClick={() => app.upgrade(nextTier)}
              >
                Upgrade to {TIER_META[nextTier].label}
              </Btn>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ============================================================
   Identity & access (RBAC) — Admin only
   ============================================================ */
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

/* ---------- Users (built from the teachers + staff sample) ---------- */
interface SchoolUser {
  id: string
  name: string
  email: string
  role: Role
  hue: number
  status: 'active' | 'invited' | 'suspended'
  last: string
}

const LAST_SEEN = ['Just now', '8m ago', '40m ago', '2h ago', 'Yesterday', '3d ago']
const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '.')

const SCHOOL_USERS: SchoolUser[] = (() => {
  const out: SchoolUser[] = []
  /* leadership comes off the top of the (rating-sorted) teacher list */
  const leaders: Role[] = ['admin', 'principal', 'vice_principal']
  teachers.slice(0, 3).forEach((t, i) => {
    out.push({ id: t.id, name: t.name, email: t.email, role: leaders[i], hue: t.avatarHue, status: 'active', last: LAST_SEEN[i] })
  })
  /* teaching staff */
  teachers.slice(3, 9).forEach((t, i) => {
    out.push({
      id: t.id, name: t.name, email: t.email, role: 'teacher', hue: t.avatarHue,
      status: t.status === 'inactive' ? 'suspended' : 'active', last: LAST_SEEN[i % LAST_SEEN.length],
    })
  })
  /* office staff get admin-level data-entry access */
  staff.slice(0, 3).forEach((s, i) => {
    out.push({
      id: s.id, name: s.name, email: `${slug(s.name)}@school.edu`, role: 'admin', hue: s.avatarHue,
      status: i === 2 ? 'invited' : 'active', last: i === 2 ? 'Pending' : LAST_SEEN[(i + 2) % LAST_SEEN.length],
    })
  })
  return out
})()

/* A couple of users ship with per-user overrides so the feature is visible on load. */
const SAMPLE_OVERRIDES: Record<string, UserOverrides> = {
  [SCHOOL_USERS[3].id]: { fees: { V: 'grant' } },        // a teacher granted fee visibility
  [SCHOOL_USERS[4].id]: { attendance: { E: 'revoke' } }, // a teacher with attendance edit removed
}

const userStatus: Record<SchoolUser['status'], { tone: BadgeTone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  invited: { tone: 'warning', label: 'Invited' },
  suspended: { tone: 'danger', label: 'Suspended' },
}

function InviteModalContent({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('teacher')

  const submit = () => {
    if (!email.trim() || !email.includes('@')) {
      toast.danger('Valid email required', 'Enter the staff member’s work email address.')
      return
    }
    toast.success('Invitation sent', `${email} invited as ${ROLE_META[role].label}.`)
    onDone()
  }

  return (
    <Card>
      <CardHead title="Invite staff member" sub="Send an access invitation by email" icon="user" />
      <div className="col gap16" style={{ marginTop: 16 }}>
        <Field label="Work email" required>
          <Input icon="message" type="email" value={email} placeholder="name@school.edu" onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role" required hint={ROLE_META[role].desc}>
          <Select
            options={ROLES.map((r) => ({ value: r, label: `${ROLE_META[r].label} — ${ROLE_META[r].short}` }))}
            value={role} onChange={(e) => setRole(e.target.value as Role)}
          />
        </Field>
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onDone}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>Send invite</Btn>
        </div>
      </div>
    </Card>
  )
}

function UsersTab() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState('all')
  const [inviting, setInviting] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, UserOverrides>>(SAMPLE_OVERRIDES)
  const [editing, setEditing] = useState<SchoolUser | null>(null)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return SCHOOL_USERS.filter((u) => {
      if (needle && !(u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))) return false
      if (roleF !== 'all' && u.role !== roleF) return false
      return true
    })
  }, [q, roleF])

  const columns: Column<SchoolUser>[] = [
    {
      key: 'name', label: 'User', sortValue: (u) => u.name,
      render: (u) => (
        <div className="row ai-center gap10">
          <Avatar name={u.name} hue={u.hue} size={34} />
          <div>
            <div className="fw6">{u.name}</div>
            <div className="t-xs muted">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role', label: 'Role', sortValue: (u) => u.role,
      render: (u) => {
        const n = overrideCount(overrides[u.id] ?? {})
        return (
          <div className="row ai-center gap6">
            <Badge tone={roleTone(u.role)}>{ROLE_META[u.role].label}</Badge>
            {n > 0 && <Badge tone="neutral">{n} custom</Badge>}
          </div>
        )
      },
    },
    {
      key: 'status', label: 'Status', align: 'center', sortValue: (u) => u.status,
      render: (u) => <Badge tone={userStatus[u.status].tone}>{userStatus[u.status].label}</Badge>,
    },
    {
      key: 'last', label: 'Last active', align: 'right', sortValue: (u) => u.last,
      render: (u) => <span className="t-sm muted">{u.last}</span>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (u) => (
        <div className="row gap6 jc-end">
          <Btn variant="secondary" size="sm" icon="edit" onClick={() => setEditing(u)}>Edit</Btn>
          {u.status === 'suspended'
            ? <Btn variant="secondary" size="sm" icon="refresh" onClick={() => toast.success('User reactivated', `${u.name} can sign in again.`)}>Restore</Btn>
            : <Btn variant="ghost" size="sm" icon="lock" onClick={() => toast.danger('User suspended', `${u.name} can no longer sign in.`)}>Suspend</Btn>}
        </div>
      ),
    },
  ]

  if (inviting) return <InviteModalContent onDone={() => setInviting(false)} />
  if (editing) return (
    <UserAccessEditor
      user={editing}
      initial={overrides[editing.id] ?? {}}
      onSave={(ov) => { setOverrides((m) => ({ ...m, [editing.id]: ov })); setEditing(null) }}
      onCancel={() => setEditing(null)}
    />
  )

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <Search value={q} onChange={setQ} placeholder="Search name or email…" style={{ flex: 1, minWidth: 220 }} />
        <Select
          options={[{ value: 'all', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }))]}
          value={roleF} onChange={(e) => setRoleF(e.target.value)}
        />
        <Btn variant="primary" icon="plus" onClick={() => setInviting(true)}>Invite user</Btn>
      </div>
      <DataTable<SchoolUser>
        columns={columns}
        rows={rows}
        pageSize={10}
        rowKey={(u) => u.id}
        initialSort={{ key: 'name', dir: 'asc' }}
        empty={<Empty icon="users" title="No users match" body="Try a different search or role filter." />}
      />
    </Card>
  )
}

/* ---------- Roles & permissions matrix ---------- */
type Matrix = Record<string, Record<Role, Cap[]>>

function clonePerms(): Matrix {
  const out: Matrix = {}
  for (const mod of Object.keys(PERMS)) {
    out[mod] = { admin: [], principal: [], vice_principal: [], teacher: [] }
    for (const r of ROLES) out[mod][r] = [...PERMS[mod][r]]
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
        transition: 'all .12s ease',
      }}
    >
      {cap}
    </button>
  )
}

function UserAccessEditor({ user, initial, onSave, onCancel }: {
  user: SchoolUser
  initial: UserOverrides
  onSave: (ov: UserOverrides) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [ov, setOv] = useState<UserOverrides>(initial)

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
  const save = () => {
    onSave(ov)
    toast.success('Permissions saved', `${count} override${count === 1 ? '' : 's'} for ${user.name}.`)
  }

  return (
    <div className="col gap16">
      <Card>
        <div className="row ai-center gap12 wrap">
          <Avatar name={user.name} hue={user.hue} size={40} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="fw7">{user.name}</div>
            <div className="t-sm muted">{user.email}</div>
          </div>
          <Badge tone={roleTone(user.role)}>{ROLE_META[user.role].label}</Badge>
          <Btn variant="ghost" size="sm" icon="arrowLeft" onClick={onCancel}>Back</Btn>
        </div>
      </Card>

      <Card pad={false}>
        <CardHead
          title="Per-user access"
          sub="Tap V / E / A to cycle inherit → grant → revoke for this user"
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
                const eff = effectiveCaps(user.role, mod, ov)
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

function RolesTab() {
  const toast = useToast()
  const [matrix, setMatrix] = useState<Matrix>(clonePerms)

  const toggle = (mod: string, role: Role, cap: Cap) => {
    setMatrix((m) => {
      const cur = m[mod][role]
      const next = cur.includes(cap) ? cur.filter((c) => c !== cap) : [...cur, cap]
      return { ...m, [mod]: { ...m[mod], [role]: next } }
    })
  }

  const reset = () => { setMatrix(clonePerms()); toast.info('Matrix reset', 'Reverted to the saved permission set.') }
  const save = () => toast.success('Permissions saved', 'Role access updated for this school.')

  return (
    <div className="col gap16">
      <Card>
        <div className="row ai-center gap12 wrap">
          <span className="sm-kpi-ic" style={{ color: 'var(--brand-600)' }}><Icon name="shield" size={18} /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="fw7">Owner is a super-role</div>
            <div className="t-sm muted">
              Owner sits above the school and has full access to every module. It grants the four
              school roles their access below and <strong>cannot itself be restricted</strong>.
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
              <Btn variant="primary" size="sm" icon="check" onClick={save}>Save changes</Btn>
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
                {ROLES.map((r) => <th key={r} className="ta-center">{ROLE_META[r].label}</th>)}
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
                  {ROLES.map((r) => (
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

/* ---------- Invitations ---------- */
interface Invite { id: string; email: string; role: Role; sent: string; expires: string }
const INITIAL_INVITES: Invite[] = [
  { id: 'INV-01', email: 'neha.joshi@school.edu', role: 'teacher', sent: '2 days ago', expires: 'in 5 days' },
  { id: 'INV-02', email: 'sahil.verma@school.edu', role: 'admin', sent: '4 days ago', expires: 'in 3 days' },
  { id: 'INV-03', email: 'priya.nair@school.edu', role: 'vice_principal', sent: '6 days ago', expires: 'in 1 day' },
]

function InvitationsTab() {
  const toast = useToast()
  const [invites, setInvites] = useState<Invite[]>(INITIAL_INVITES)

  const resend = (inv: Invite) => toast.success('Invitation resent', `A fresh link was emailed to ${inv.email}.`)
  const revoke = (inv: Invite) => {
    setInvites((list) => list.filter((i) => i.id !== inv.id))
    toast.danger('Invitation revoked', `${inv.email} can no longer join.`)
  }

  return (
    <Card pad={false}>
      <CardHead title="Pending invitations" sub={`${invites.length} awaiting acceptance`} icon="inbox" />
      {invites.length === 0
        ? <div style={{ padding: 8 }}><Empty icon="inbox" title="No pending invitations" body="Invite staff from the Users tab." /></div>
        : (
          <div className="col">
            {invites.map((inv) => (
              <div key={inv.id} className="row ai-center gap12 wrap" style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
                <Avatar name={inv.email} size={34} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="fw6">{inv.email}</div>
                  <div className="t-xs muted"><Badge tone={roleTone(inv.role)}>{ROLE_META[inv.role].label}</Badge></div>
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

/* ---------- Audit log ---------- */
interface AuditRow { id: string; who: string; hue: number; action: string; target: string; module: string; when: string; tone: BadgeTone }
const AUDIT: AuditRow[] = [
  { id: 'A-0', who: 'Ravi Menon', hue: 200, action: 'Granted View', target: 'Neha Joshi · Fees', module: 'fees', when: 'Just now', tone: 'success' },
  { id: 'A-1', who: 'Ravi Menon', hue: 200, action: 'Granted Approve', target: 'Principal · Fees', module: 'fees', when: 'Just now', tone: 'success' },
  { id: 'A-2', who: 'Ravi Menon', hue: 200, action: 'Invited user', target: 'neha.joshi@school.edu', module: 'identity', when: '12m ago', tone: 'info' },
  { id: 'A-3', who: 'Sunita Rao', hue: 330, action: 'Published results', target: 'Term 1 · Grade X', module: 'exams', when: '1h ago', tone: 'success' },
  { id: 'A-4', who: 'Ravi Menon', hue: 200, action: 'Suspended user', target: 'Rohan Das', module: 'identity', when: '3h ago', tone: 'danger' },
  { id: 'A-5', who: 'Arjun Banerjee', hue: 150, action: 'Revoked Edit', target: 'Teacher · Attendance', module: 'attendance', when: 'Yesterday', tone: 'warning' },
  { id: 'A-6', who: 'Ravi Menon', hue: 200, action: 'Updated branding', target: 'School colour', module: 'settings', when: '2 days ago', tone: 'info' },
  { id: 'A-7', who: 'Sunita Rao', hue: 330, action: 'Changed language', target: 'Default → हिन्दी', module: 'settings', when: '3 days ago', tone: 'neutral' },
]

function AuditTab() {
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return AUDIT
    return AUDIT.filter((a) => (a.who + a.action + a.target + a.module).toLowerCase().includes(needle))
  }, [q])

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

function IdentityScreen() {
  const [tab, setTab] = useState('users')
  return (
    <div>
      <PageHead
        title="Identity & access"
        sub="Manage staff accounts, role permissions & access invitations"
      />
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'users', label: 'Users', icon: 'users', count: SCHOOL_USERS.length },
          { value: 'roles', label: 'Roles & permissions', icon: 'lock' },
          { value: 'invites', label: 'Invitations', icon: 'inbox', count: INITIAL_INVITES.length },
          { value: 'audit', label: 'Audit log', icon: 'clock' },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {tab === 'users' && <UsersTab />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'invites' && <InvitationsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}

/* ---------- export contract ---------- */
export const adminScreens: Record<string, ComponentType> = {
  'school.reports': SchoolReports,
  'school.settings': SettingsScreen,
  'school.identity': IdentityScreen,
}
