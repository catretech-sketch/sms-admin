/* ============================================================
   SchoolMate — Owner console workspace
   Users & roles (RBAC) + Owner settings.
   Phase 4 screens. Frontend-only, mock data.

   Owner sits ABOVE every school's permission matrix — it is a
   separate super-role with full access that cannot be restricted.
   It grants Admin / Principal / Vice-Principal / Teacher their
   access via the interactive matrix below.
   ============================================================ */
import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useToast } from '@/lib/hooks'
import {
  PageHead, Tabs, Card, CardHead, Btn, Badge, Avatar, Search, Select, Field, Input,
  Modal, Toggle, Icon, Empty, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui'
import { ROLES, ROLE_META, PERMS, schools } from '@/data/mockDb'
import type { Role, Cap } from '@/types'

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

/* ============================================================
   Team
   ============================================================ */
interface TeamUser {
  id: string
  name: string
  email: string
  role: Role
  scope: string
  hue: number
  status: 'active' | 'invited' | 'suspended'
  last: string
}

const TEAM: TeamUser[] = [
  { id: 'U-01', name: 'Anil Mehta', email: 'anil@schoolmate.io', role: 'admin', scope: 'All schools', hue: 250, status: 'active', last: 'Just now' },
  { id: 'U-02', name: 'Sunita Rao', email: 'sunita.rao@schoolmate.io', role: 'principal', scope: 'Greenwood Valley School', hue: 330, status: 'active', last: '12m ago' },
  { id: 'U-03', name: 'Arjun Banerjee', email: 'arjun.b@schoolmate.io', role: 'vice_principal', scope: 'Greenwood Valley School', hue: 150, status: 'active', last: '1h ago' },
  { id: 'U-04', name: 'Ravi Menon', email: 'ravi.menon@schoolmate.io', role: 'admin', scope: 'St. Xavier’s High School', hue: 200, status: 'active', last: '3h ago' },
  { id: 'U-05', name: 'Meera Krishnan', email: 'meera.k@schoolmate.io', role: 'teacher', scope: 'Greenwood Valley School', hue: 20, status: 'active', last: 'Yesterday' },
  { id: 'U-06', name: 'Priya Iyer', email: 'priya.iyer@schoolmate.io', role: 'principal', scope: 'Delhi Public Academy', hue: 290, status: 'active', last: 'Yesterday' },
  { id: 'U-07', name: 'Kabir Sharma', email: 'kabir.s@schoolmate.io', role: 'admin', scope: 'Sunrise International', hue: 40, status: 'active', last: '2d ago' },
  { id: 'U-08', name: 'Fatima Khan', email: 'fatima.khan@schoolmate.io', role: 'vice_principal', scope: 'Al-Manar Academy', hue: 175, status: 'active', last: '2d ago' },
  { id: 'U-09', name: 'Rohan Das', email: 'rohan.das@schoolmate.io', role: 'teacher', scope: 'Horizon World School', hue: 110, status: 'suspended', last: '6d ago' },
  { id: 'U-10', name: 'Anika Reddy', email: 'anika.reddy@schoolmate.io', role: 'admin', scope: 'Lotus Montessori', hue: 320, status: 'active', last: '1w ago' },
  { id: 'U-11', name: 'Vivaan Gupta', email: 'vivaan.gupta@schoolmate.io', role: 'principal', scope: 'St. Xavier’s High School', hue: 215, status: 'active', last: '1w ago' },
  { id: 'U-12', name: 'Diya Nair', email: 'diya.nair@schoolmate.io', role: 'teacher', scope: 'Delhi Public Academy', hue: 80, status: 'invited', last: 'Pending' },
]

const userStatus: Record<TeamUser['status'], { tone: BadgeTone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  invited: { tone: 'warning', label: 'Invited' },
  suspended: { tone: 'danger', label: 'Suspended' },
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('admin')
  const [scope, setScope] = useState('all')

  const reset = () => { setEmail(''); setRole('admin'); setScope('all') }

  const submit = () => {
    if (!email.trim() || !email.includes('@')) {
      toast.danger('Valid email required', 'Enter the teammate’s work email address.')
      return
    }
    const where = scope === 'all' ? 'all schools' : schools.find((s) => s.id === scope)?.name ?? scope
    toast.success('Invitation sent', `${email} invited as ${ROLE_META[role].label} · ${where}.`)
    reset()
    onClose()
  }

  return (
    <Modal
      open={open} onClose={onClose} icon="user"
      title="Invite user" sub="Send an access invitation by email"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>Send invite</Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Work email" required>
          <Input icon="message" type="email" value={email} placeholder="name@schoolmate.io" onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role" required hint={ROLE_META[role].desc}>
          <Select
            options={ROLES.map((r) => ({ value: r, label: `${ROLE_META[r].label} — ${ROLE_META[r].short}` }))}
            value={role} onChange={(e) => setRole(e.target.value as Role)}
          />
        </Field>
        <Field label="Scope" required hint="Limit this user to one school, or grant access across all tenants.">
          <Select
            options={[{ value: 'all', label: 'All schools' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]}
            value={scope} onChange={(e) => setScope(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}

function TeamTab() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState('all')
  const [inviteOpen, setInviteOpen] = useState(false)

  const kpis = useMemo(() => ({
    total: TEAM.length,
    admins: TEAM.filter((u) => u.role === 'admin').length,
    active: TEAM.filter((u) => u.status === 'active').length,
  }), [])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return TEAM.filter((u) => {
      if (needle && !(u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle) || u.scope.toLowerCase().includes(needle))) return false
      if (roleF !== 'all' && u.role !== roleF) return false
      return true
    })
  }, [q, roleF])

  const columns: Column<TeamUser>[] = [
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
      render: (u) => <Badge tone={roleTone(u.role)}>{ROLE_META[u.role].label}</Badge>,
    },
    {
      key: 'scope', label: 'Scope', sortValue: (u) => u.scope,
      render: (u) => (
        <span className="row ai-center gap6 t-sm">
          <Icon name={u.scope === 'All schools' ? 'globe' : 'building'} size={14} />
          {u.scope}
        </span>
      ),
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
          <Btn variant="secondary" size="sm" icon="edit" onClick={() => toast.info('Edit access', `Adjust role & scope for ${u.name}.`)}>Edit</Btn>
          {u.status === 'suspended'
            ? <Btn variant="secondary" size="sm" icon="refresh" onClick={() => toast.success('User reactivated', `${u.name} can sign in again.`)}>Restore</Btn>
            : <Btn variant="ghost" size="sm" icon="lock" onClick={() => toast.danger('User suspended', `${u.name} can no longer sign in.`)}>Suspend</Btn>}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <Kard icon="users" label="Total users" value={kpis.total} tone="brand" />
        <Kard icon="key" label="Administrators" value={kpis.admins} tone="info" />
        <Kard icon="checkCircle" label="Active now" value={kpis.active} tone="success" />
      </div>

      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search name, email, school…" style={{ flex: 1, minWidth: 220 }} />
          <Select
            options={[{ value: 'all', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }))]}
            value={roleF} onChange={(e) => setRoleF(e.target.value)}
          />
          <Btn variant="primary" icon="plus" onClick={() => setInviteOpen(true)}>Invite user</Btn>
        </div>

        <DataTable<TeamUser>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(u) => u.id}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={<Empty icon="users" title="No users match" body="Try a different search or role filter." />}
        />
      </Card>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
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
  const save = () => toast.success('Permissions saved', 'Role access updated across all schools.')

  return (
    <div className="col gap16">
      <Card>
        <div className="row ai-center gap12 wrap">
          <span className="sm-kpi-ic" style={{ color: 'var(--brand-600)' }}><Icon name="shield" size={18} /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="fw7">Owner is a super-role</div>
            <div className="t-sm muted">
              Owner sits above every school and has full access to all modules. It grants the four
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

/* ============================================================
   Invitations
   ============================================================ */
interface Invite { id: string; email: string; role: Role; scope: string; sent: string; expires: string }
const INITIAL_INVITES: Invite[] = [
  { id: 'INV-01', email: 'diya.nair@schoolmate.io', role: 'teacher', scope: 'Delhi Public Academy', sent: '2 days ago', expires: 'in 5 days' },
  { id: 'INV-02', email: 'sahil.verma@schoolmate.io', role: 'admin', scope: 'Horizon World School', sent: '4 days ago', expires: 'in 3 days' },
  { id: 'INV-03', email: 'neha.joshi@schoolmate.io', role: 'vice_principal', scope: 'Lotus Montessori', sent: '6 days ago', expires: 'in 1 day' },
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

/* ============================================================
   OwnerUsers — shell
   ============================================================ */
function OwnerUsers() {
  const [tab, setTab] = useState('team')
  return (
    <div>
      <PageHead
        title="Users & roles"
        sub="Manage your SchoolMate team, role permissions & access invitations"
      />
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'team', label: 'Team', icon: 'users', count: TEAM.length },
          { value: 'roles', label: 'Roles & permissions', icon: 'lock' },
          { value: 'invites', label: 'Invitations', icon: 'inbox', count: INITIAL_INVITES.length },
          { value: 'audit', label: 'Audit log', icon: 'clock' },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {tab === 'team' && <TeamTab />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'invites' && <InvitationsTab />}
        {tab === 'audit' && <AuditTab />}
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
  const toast = useToast()
  const [org, setOrg] = useState('SchoolMate Technologies Pvt. Ltd.')
  const [email, setEmail] = useState('owner@schoolmate.io')
  const [phone, setPhone] = useState('+91 98765 43210')
  const [website, setWebsite] = useState('https://schoolmate.io')
  const [addr, setAddr] = useState('4th Floor, Prestige Tech Park, Bengaluru 560103')
  const [gst, setGst] = useState('29ABCDE1234F1Z5')

  return (
    <Card>
      <CardHead title="Company profile" sub="Organisation details used on invoices & reports" icon="building" />
      <div className="col gap16" style={{ marginTop: 16 }}>
        <FormGrid>
          <Field label="Organisation name" required>
            <Input icon="building" value={org} onChange={(e) => setOrg(e.target.value)} />
          </Field>
          <Field label="GST / Tax ID">
            <Input icon="doc" value={gst} onChange={(e) => setGst(e.target.value)} />
          </Field>
          <Field label="Contact email" required>
            <Input icon="message" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <Input icon="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Website">
            <Input icon="globe" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </Field>
          <Field label="Registered address">
            <Input icon="pin" value={addr} onChange={(e) => setAddr(e.target.value)} />
          </Field>
        </FormGrid>
      </div>
      <SaveBar onSave={() => toast.success('Company profile saved', 'Organisation details updated.')} />
    </Card>
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
