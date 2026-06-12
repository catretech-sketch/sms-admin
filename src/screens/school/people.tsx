/* ============================================================
   SchoolMate — People hub: Teachers, Staff & support, Parents.
   Phase 3 screens. Frontend-only, mock data.
   NOTE: per the design, calling/phone-call actions were removed —
   these screens only ever offer "Message", never a Call button.
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can } from '@/lib/gating'
import {
  PageHead, Card, Btn, Badge, Avatar, Search, Select,
  Drawer, Icon, Empty, Progress, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui'
import { students, depts } from '@/data/mockDb'
import { fmtMoney } from '@/lib/format'
import type { Teacher, Staff } from '@/types'

/* ---------- shared helpers ---------- */
const attColor = (v: number): string => (v >= 90 ? 'var(--success)' : v >= 80 ? 'var(--brand-600)' : v >= 75 ? 'var(--warning)' : 'var(--danger)')
const statusTone = (s: string): BadgeTone => (s === 'active' ? 'success' : 'neutral')
const statusLabel = (s: string): string => (s === 'active' ? 'Active' : 'Inactive')

/* ============================================================
   Teacher profile drawer (read-only)
   ============================================================ */
function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row ai-center jc-between"><span className="muted t-sm">{label}</span><span className="fw7">{value}</span></div>
  )
}

function TeacherProfile({ teacher, onClose, onMessage }: { teacher: Teacher | null; onClose: () => void; onMessage: (t: Teacher) => void }) {
  if (!teacher) return null
  return (
    <Drawer
      open={!!teacher} onClose={onClose} icon="user"
      title={teacher.name} sub={`${teacher.id} · ${teacher.desig}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          <Btn variant="primary" icon="message" onClick={() => onMessage(teacher)}>Message</Btn>
        </div>
      }
    >
      <div className="col gap16">
        <div className="row ai-center gap12">
          <Avatar name={teacher.name} hue={teacher.avatarHue} size={56} />
          <div>
            <div className="row ai-center gap8">
              <span className="fw7 t-lg">{teacher.name}</span>
              {teacher.top && <Badge tone="warning" icon="sparkle">Top performer</Badge>}
            </div>
            <div className="t-sm muted">{teacher.dept} · {teacher.gender === 'M' ? 'Male' : 'Female'}</div>
          </div>
        </div>

        <Card>
          <div className="col gap12">
            <StatRow label="Designation" value={teacher.desig} />
            <StatRow label="Subjects" value={teacher.subjects.join(', ') || '—'} />
            <StatRow label="Class teacher" value={teacher.classTeacher ?? '—'} />
            <StatRow label="Experience" value={`${teacher.exp} yrs`} />
            <StatRow label="Email" value={teacher.email} />
            <StatRow label="Status" value={<Badge tone={statusTone(teacher.status)}>{statusLabel(teacher.status)}</Badge>} />
          </div>
        </Card>

        <Card>
          <div className="col gap14">
            <div className="row ai-center jc-between">
              <span className="muted t-sm">Rating</span>
              <span className="row ai-center gap6 fw7"><span style={{ color: 'var(--gold)' }}><Icon name="sparkle" size={14} /></span>{teacher.rating.toFixed(1)}</span>
            </div>
            <div>
              <div className="row ai-center jc-between" style={{ marginBottom: 4 }}><span className="muted t-sm">Result</span><span className="fw7">{teacher.result}%</span></div>
              <Progress value={teacher.result} color={attColor(teacher.result)} />
            </div>
            <div>
              <div className="row ai-center jc-between" style={{ marginBottom: 4 }}><span className="muted t-sm">Attendance</span><span className="fw7">{teacher.attendance}%</span></div>
              <Progress value={teacher.attendance} color={attColor(teacher.attendance)} />
            </div>
            <StatRow label="Teaching load" value={`${teacher.load} periods/wk`} />
          </div>
        </Card>
      </div>
    </Drawer>
  )
}

/* ============================================================
   TeachersScreen
   ============================================================ */
function TeachersScreen() {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('all')
  const [status, setStatus] = useState('all')
  const [profile, setProfile] = useState<Teacher | null>(null)

  const editable = can(app.role, 'sis', 'E')
  const teachers = app.teachers

  const message = (t: Teacher) => toast.success('Message sent', `Notified ${t.name}.`)

  const topPerformers = useMemo(
    () => teachers.slice().sort((a, b) => b.rating - a.rating).slice(0, 4),
    [teachers],
  )

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return teachers.filter((t) => {
      if (needle && !(t.name.toLowerCase().includes(needle) || t.dept.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle))) return false
      if (dept !== 'all' && t.dept !== dept) return false
      if (status !== 'all' && t.status !== status) return false
      return true
    })
  }, [teachers, q, dept, status])

  const columns: Column<Teacher>[] = [
    {
      key: 'name', label: 'Teacher', sortValue: (t) => t.name,
      render: (t) => (
        <div className="row ai-center gap10">
          <Avatar name={t.name} hue={t.avatarHue} size={34} />
          <div>
            <div className="row ai-center gap6">
              <span className="fw6">{t.name}</span>
              {t.top && <span style={{ color: 'var(--gold)' }}><Icon name="sparkle" size={13} /></span>}
            </div>
            <div className="t-xs muted">{t.id}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'dept', label: 'Department', sortValue: (t) => t.dept,
      render: (t) => (
        <div>
          <div className="fw6">{t.dept}</div>
          <div className="t-xs muted">{t.desig}</div>
        </div>
      ),
    },
    {
      key: 'subjects', label: 'Subjects',
      render: (t) => (
        <div className="row gap4 wrap">
          {t.subjects.length ? t.subjects.map((s) => <Badge key={s} tone="neutral">{s}</Badge>) : <span className="muted">—</span>}
        </div>
      ),
    },
    {
      key: 'classTeacher', label: 'Class teacher', align: 'center', sortValue: (t) => t.classTeacher ?? '',
      render: (t) => t.classTeacher ? <Badge tone="brand">{t.classTeacher}</Badge> : <span className="muted">—</span>,
    },
    {
      key: 'exp', label: 'Experience', align: 'right', sortValue: (t) => t.exp,
      render: (t) => <span>{t.exp} yrs</span>,
    },
    {
      key: 'rating', label: 'Rating', align: 'right', sortValue: (t) => t.rating,
      render: (t) => (
        <span className="row ai-center gap4 fw6" style={{ justifyContent: 'flex-end' }}>
          <span style={{ color: 'var(--gold)' }}><Icon name="sparkle" size={13} /></span>{t.rating.toFixed(1)}
        </span>
      ),
    },
    {
      key: 'result', label: 'Result', align: 'right', sortValue: (t) => t.result,
      render: (t) => <span className="fw6">{t.result}%</span>,
    },
    {
      key: 'load', label: 'Load', align: 'right', sortValue: (t) => t.load,
      render: (t) => <span>{t.load}/wk</span>,
    },
    {
      key: 'status', label: 'Status', align: 'center', sortValue: (t) => t.status,
      render: (t) => <Badge tone={statusTone(t.status)}>{statusLabel(t.status)}</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (t) => (
        <Btn variant="secondary" size="sm" icon="message" onClick={(e) => { e.stopPropagation(); message(t) }}>Message</Btn>
      ),
    },
  ]

  return (
    <div>
      <PageHead
        title="Teachers"
        sub={`${teachers.length} teaching staff · ${app.school.name}`}
        actions={editable
          ? <Btn variant="primary" icon="plus" onClick={() => app.go('school.teachers.add')}>Add teacher</Btn>
          : <Badge tone="neutral" icon="eye">View only</Badge>}
      />

      {/* Top performers */}
      <div className="sm-card-sub" style={{ marginBottom: 10, fontWeight: 600 }}>Top performers</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {topPerformers.map((t) => (
          <Card key={t.id} hover>
            <div className="row ai-center gap12">
              <Avatar name={t.name} hue={t.avatarHue} size={44} />
              <div style={{ minWidth: 0 }}>
                <div className="fw7" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                <div className="t-xs muted">{t.dept}</div>
              </div>
            </div>
            <div className="row ai-center jc-between" style={{ marginTop: 12 }}>
              <span className="row ai-center gap4 fw7"><span style={{ color: 'var(--gold)' }}><Icon name="sparkle" size={14} /></span>{t.rating.toFixed(1)}</span>
              <Badge tone="success">{t.result}% result</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search name, department, employee ID…" style={{ flex: 1, minWidth: 220 }} />
          <Select options={['all', ...depts]} value={dept} onChange={(e) => setDept(e.target.value)} />
          <Select options={[{ value: 'all', label: 'All status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>

        <DataTable<Teacher>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(t) => t.id}
          initialSort={{ key: 'rating', dir: 'desc' }}
          onRowClick={(t) => setProfile(t)}
          empty={<Empty icon="cap" title="No teachers match" body="Try adjusting the search or filters." />}
        />
      </Card>

      <TeacherProfile teacher={profile} onClose={() => setProfile(null)} onMessage={(t) => { message(t); setProfile(null) }} />
    </div>
  )
}

/* ============================================================
   StaffScreen — non-teaching staff & support
   ============================================================ */
const CATS: { value: string; label: string; icon: string; tone: BadgeTone }[] = [
  { value: 'transport', label: 'Transport', icon: 'bus', tone: 'info' },
  { value: 'security', label: 'Security', icon: 'shield', tone: 'warning' },
  { value: 'academic', label: 'Academic', icon: 'cap', tone: 'brand' },
  { value: 'admin', label: 'Admin', icon: 'briefcase', tone: 'neutral' },
  { value: 'support', label: 'Support', icon: 'users', tone: 'success' },
]

function StaffScreen() {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')

  const editable = can(app.role, 'sis', 'E')
  const roster = app.staff

  const message = (s: Staff) => toast.success('Message sent', `Notified ${s.name}.`)

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    roster.forEach((s) => { m[s.cat] = (m[s.cat] || 0) + 1 })
    return m
  }, [roster])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return roster.filter((s) => {
      if (needle && !(s.name.toLowerCase().includes(needle) || s.role.toLowerCase().includes(needle) || s.id.toLowerCase().includes(needle))) return false
      if (cat !== 'all' && s.cat !== cat) return false
      return true
    })
  }, [q, cat, roster])

  const columns: Column<Staff>[] = [
    {
      key: 'name', label: 'Staff', sortValue: (s) => s.name,
      render: (s) => (
        <div className="row ai-center gap10">
          <Avatar name={s.name} hue={s.avatarHue} size={34} />
          <div>
            <div className="fw6">{s.name}</div>
            <div className="t-xs muted">{s.id} · {s.gender === 'M' ? 'Male' : 'Female'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role', label: 'Role', sortValue: (s) => s.role,
      render: (s) => (
        <div>
          <div className="fw6">{s.role}</div>
          <div className="t-xs muted">{s.dept}</div>
        </div>
      ),
    },
    {
      key: 'shift', label: 'Shift', align: 'center', sortValue: (s) => s.shift,
      render: (s) => <Badge tone="neutral">{s.shift}</Badge>,
    },
    {
      key: 'route', label: 'Route', align: 'center', sortValue: (s) => s.route ?? '',
      render: (s) => s.route ? <Badge tone="info">{s.route}</Badge> : <span className="muted">—</span>,
    },
    {
      key: 'attendance', label: 'Attendance', sortValue: (s) => s.attendance,
      render: (s) => (
        <div className="row ai-center gap8" style={{ minWidth: 120 }}>
          <div style={{ flex: 1 }}><Progress value={s.attendance} color={attColor(s.attendance)} /></div>
          <span className="t-sm fw6" style={{ width: 34 }}>{s.attendance}%</span>
        </div>
      ),
    },
    {
      key: 'status', label: 'Status', align: 'center', sortValue: (s) => s.status,
      render: (s) => <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (s) => (
        <Btn variant="secondary" size="sm" icon="message" onClick={(e) => { e.stopPropagation(); message(s) }}>Message</Btn>
      ),
    },
  ]

  return (
    <div>
      <PageHead
        title="Staff & support"
        sub={`${roster.length} non-teaching staff · ${app.school.name}`}
        actions={editable
          ? <Btn variant="primary" icon="plus" onClick={() => app.go('school.staff.add')}>Add staff</Btn>
          : <Badge tone="neutral" icon="eye">View only</Badge>}
      />

      {/* Category summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 16 }}>
        {CATS.map((c) => (
          <Card key={c.value} hover onClick={() => setCat((prev) => (prev === c.value ? 'all' : c.value))} style={cat === c.value ? { borderColor: 'var(--brand-600)' } : undefined}>
            <div className="row ai-center gap10">
              <span className="sm-kpi-ic"><Icon name={c.icon} size={18} /></span>
              <div>
                <div className="fw7 t-lg">{counts[c.value] || 0}</div>
                <div className="t-xs muted">{c.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search name, role, staff ID…" style={{ flex: 1, minWidth: 220 }} />
          <Select options={[{ value: 'all', label: 'All categories' }, ...CATS.map((c) => ({ value: c.value, label: c.label }))]} value={cat} onChange={(e) => setCat(e.target.value)} />
        </div>

        <DataTable<Staff>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(s) => s.id}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={<Empty icon="users" title="No staff match" body="Try adjusting the search or category." />}
        />
      </Card>
    </div>
  )
}

/* ============================================================
   ParentsScreen — derived from students (grouped by guardian)
   ============================================================ */
interface Ward { name: string; cls: string }
interface Parent {
  id: string
  name: string
  phone: string
  hue: number
  wards: Ward[]
  due: number
}

function ParentsScreen() {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')

  const message = (p: Parent) => toast.success('Message sent', `Notified ${p.name}.`)

  const parents = useMemo<Parent[]>(() => {
    const map = new Map<string, Parent>()
    students.forEach((s) => {
      const key = s.guardian
      const existing = map.get(key)
      if (existing) {
        existing.wards.push({ name: s.name, cls: s.cls })
        existing.due += s.feeDue
      } else {
        map.set(key, {
          id: 'PAR-' + s.id,
          name: s.guardian,
          phone: s.phone,
          hue: s.avatarHue,
          wards: [{ name: s.name, cls: s.cls }],
          due: s.feeDue,
        })
      }
    })
    return Array.from(map.values())
  }, [])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return parents
    return parents.filter((p) => p.name.toLowerCase().includes(needle))
  }, [q, parents])

  const columns: Column<Parent>[] = [
    {
      key: 'name', label: 'Parent / guardian', sortValue: (p) => p.name,
      render: (p) => (
        <div className="row ai-center gap10">
          <Avatar name={p.name} hue={p.hue} size={34} />
          <div>
            <div className="fw6">{p.name}</div>
            <div className="t-xs muted">{p.wards.length} ward{p.wards.length > 1 ? 's' : ''}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'wards', label: 'Wards', sortValue: (p) => p.wards.length,
      render: (p) => (
        <div className="col gap4">
          {p.wards.map((w, i) => (
            <div key={i} className="row ai-center gap6 t-sm">
              <span className="fw6">{w.name}</span>
              <Badge tone="neutral">{w.cls}</Badge>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'phone', label: 'Phone', sortValue: (p) => p.phone,
      render: (p) => <span className="t-sm muted">{p.phone}</span>,
    },
    {
      key: 'due', label: 'Outstanding dues', align: 'right', sortValue: (p) => p.due,
      render: (p) => <Badge tone={p.due > 0 ? 'danger' : 'success'}>{p.due > 0 ? fmtMoney(p.due) : 'Cleared'}</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (p) => (
        <Btn variant="secondary" size="sm" icon="message" onClick={(e) => { e.stopPropagation(); message(p) }}>Message</Btn>
      ),
    },
  ]

  return (
    <div>
      <PageHead title="Parents" sub={`${parents.length} guardians · ${app.school.name}`} />

      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search guardian name…" style={{ flex: 1, minWidth: 220 }} />
        </div>

        <DataTable<Parent>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(p) => p.id}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={<Empty icon="users" title="No parents match" body="Try a different guardian name." />}
        />
      </Card>
    </div>
  )
}

/* ---------- export contract ---------- */
export const peopleScreens: Record<string, ComponentType> = {
  'school.teachers': TeachersScreen,
  'school.staff': StaffScreen,
  'school.parents': ParentsScreen,
}
