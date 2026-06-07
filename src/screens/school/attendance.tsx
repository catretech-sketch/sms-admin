/* ============================================================
   SchoolMate — Attendance
   Today's-at-a-glance summary, group control (Students ·
   Teachers · Staff · Period-wise · Geo-fence), live roster with
   search + status filter, correction action, and the [P] geofence
   locked state. Frontend-only, deterministic mock data.
   ============================================================ */
import { useMemo, useState } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can } from '@/lib/gating'
import {
  PageHead, Card, CardHead, Btn, Badge, Avatar, Search, Select, Segmented,
  Icon, Empty, DataTable, type Column, type BadgeTone,
} from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { students, teachers, staff, grades, sections, subjects } from '@/data/mockDb'

/* ---------- group model ---------- */
type Group = 'students' | 'teachers' | 'staff' | 'period' | 'geo'
const GROUP_OPTS = [
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'staff', label: 'Staff' },
  { value: 'period', label: 'Period-wise' },
  { value: 'geo', label: 'Geo-fence' },
]

/* ---------- deterministic status derivation ---------- */
type AttStatus = 'present' | 'late' | 'absent'
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
/* Higher personal attendance % => more likely present today. A thin
   band just below the threshold is treated as "late". */
function statusOf(id: string, attendance: number): AttStatus {
  const r = hash(id) % 100
  if (r >= attendance) return 'absent'
  if (r >= attendance - 7) return 'late'
  return 'present'
}
function checkIn(id: string, status: AttStatus): string {
  if (status === 'absent') return '—'
  const base = status === 'late' ? 510 : 450      // 8:30 vs 7:30 (minutes)
  const span = status === 'late' ? 30 : 40
  const m = base + (hash(id + 'c') % span)
  const hh = Math.floor(m / 60), mm = m % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const STATUS_TONE: Record<AttStatus, BadgeTone> = { present: 'success', late: 'warning', absent: 'danger' }
const STATUS_LABEL: Record<AttStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent' }

/* ---------- normalised person row ---------- */
interface Person {
  id: string; name: string; hue: number
  group: Exclude<Group, 'period' | 'geo'>
  sub: string                 // class / department / role
  status: AttStatus
  checkin: string
}
function buildPeople(group: Person['group']): Person[] {
  if (group === 'students') {
    return students.map((s) => {
      const status = statusOf(s.id, s.attendance)
      return { id: s.id, name: s.name, hue: s.avatarHue, group, sub: s.cls, status, checkin: checkIn(s.id, status) }
    })
  }
  if (group === 'teachers') {
    return teachers.map((t) => {
      const status = statusOf(t.id, t.attendance)
      return { id: t.id, name: t.name, hue: t.avatarHue, group, sub: `${t.dept} · ${t.desig}`, status, checkin: checkIn(t.id, status) }
    })
  }
  return staff.map((s) => {
    const status = statusOf(s.id, s.attendance)
    return { id: s.id, name: s.name, hue: s.avatarHue, group, sub: `${s.role} · ${s.dept}`, status, checkin: checkIn(s.id, status) }
  })
}

const SUB_LABEL: Record<Person['group'], string> = { students: 'Class', teachers: 'Department', staff: 'Role' }
const GROUP_NAME: Record<Person['group'], string> = { students: 'Students', teachers: 'Teachers', staff: 'Support staff' }
const GROUP_ICON: Record<Person['group'], string> = { students: 'users', teachers: 'cap', staff: 'briefcase' }

/* ============================================================
   Summary card (today's-at-a-glance) — clickable, drives group
   ============================================================ */
function SummaryCard({ group, tone, active, onClick }: {
  group: Person['group']; tone: string; active: boolean; onClick: () => void
}) {
  const { present, total, rate } = useMemo(() => {
    const ppl = buildPeople(group)
    const present = ppl.filter((p) => p.status !== 'absent').length
    const total = ppl.length
    return { present, total, rate: total ? Math.round((present / total) * 100) : 0 }
  }, [group])
  return (
    <Card hover onClick={onClick} style={active ? { borderColor: tone, boxShadow: `0 0 0 1px ${tone}` } : undefined}>
      <div className="row ai-center jc-between">
        <div className="row ai-center gap12">
          <span className="sm-kpi-ic" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone, marginBottom: 0 }}>
            <Icon name={GROUP_ICON[group]} size={18} />
          </span>
          <div>
            <div className="sm-kpi-val" style={{ fontSize: 24 }}>{rate}%</div>
            <div className="sm-kpi-label">{GROUP_NAME[group]} present</div>
          </div>
        </div>
        <Icon name="chevRight" size={18} style={{ color: 'var(--text-3)' }} />
      </div>
      <div className="row ai-center gap8" style={{ marginTop: 12 }}>
        <div className="sm-meter" style={{ flex: 1, width: 'auto' }}>
          <span style={{ width: `${rate}%`, background: tone }} />
        </div>
        <span className="t-xs muted3" style={{ whiteSpace: 'nowrap' }}>{present} of {total} present</span>
      </div>
    </Card>
  )
}

/* ============================================================
   Roster (Students / Teachers / Staff) — search + status filter
   ============================================================ */
function Roster({ group, editable }: { group: Person['group']; editable: boolean }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | AttStatus>('all')

  const all = useMemo(() => buildPeople(group), [group])

  /* search first, so the status counts reflect the visible set */
  const searched = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return all
    return all.filter((p) => p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term))
  }, [all, q])

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0 }
    searched.forEach((p) => { c[p.status]++ })
    return c
  }, [searched])

  const rows = useMemo(
    () => filter === 'all' ? searched : searched.filter((p) => p.status === filter),
    [searched, filter],
  )

  const presentTotal = counts.present + counts.late

  const filterOpts = [
    { value: 'all', label: `All (${searched.length})` },
    { value: 'present', label: `Present (${counts.present})` },
    { value: 'late', label: `Late (${counts.late})` },
    { value: 'absent', label: `Absent (${counts.absent})` },
  ]

  const cols: Column<Person>[] = [
    {
      key: 'name', label: 'Name', sortValue: (r) => r.name,
      render: (r) => (
        <div className="row ai-center gap12">
          <Avatar name={r.name} hue={r.hue} size={34} />
          <div>
            <div className="t-md fw6">{r.name}</div>
            <div className="t-xs muted3">{r.id}</div>
          </div>
        </div>
      ),
    },
    { key: 'sub', label: SUB_LABEL[group], sortValue: (r) => r.sub, render: (r) => <span className="t-sm muted">{r.sub}</span> },
    { key: 'checkin', label: 'Check-in', sortValue: (r) => r.checkin, render: (r) => <span className="t-sm">{r.checkin}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge> },
    {
      key: 'act', label: '', align: 'right',
      render: (r) => editable
        ? <Btn size="sm" variant="ghost" icon="edit" onClick={() => toast.info('Attendance correction', `${r.name} (${r.id}) marked present for today`)}>Correct</Btn>
        : <span className="t-xs muted3">—</span>,
    },
  ]

  return (
    <Card pad={false}>
      <CardHead
        title={`${GROUP_NAME[group]} roster`}
        sub={`${presentTotal} of ${all.length} present today`}
        icon={GROUP_ICON[group]}
        action={
          <div className="row ai-center gap8">
            <Search value={q} onChange={setQ} placeholder={`Find ${group === 'students' ? 'student' : group === 'teachers' ? 'teacher' : 'staff'}…`} style={{ width: 220 }} />
            <Select options={filterOpts} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | AttStatus)} />
          </div>
        }
      />
      <DataTable
        columns={cols}
        rows={rows}
        pageSize={8}
        rowKey={(r) => r.id}
        initialSort={{ key: 'name', dir: 'asc' }}
        empty={<Empty icon="search" title="No matches" body="No one matches your search or status filter. Try clearing the filter." />}
      />
      <div className="row ai-center jc-between" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <span className="t-sm muted">Marking is live — changes save automatically.</span>
        <Btn variant="primary" icon="check" disabled={!editable}
          onClick={() => toast.success('Attendance submitted', `${GROUP_NAME[group]} · ${presentTotal}/${all.length} present`)}>
          Submit attendance
        </Btn>
      </div>
    </Card>
  )
}

/* ============================================================
   Period-wise — periods × a selected class, marked / unmarked
   ============================================================ */
const PERIODS = 8
const classList = grades.slice(8).flatMap((g) => sections.map((s) => `${g}-${s}`))

function PeriodWise() {
  const toast = useToast()
  const [cls, setCls] = useState(classList[0])
  const slots = useMemo(() => Array.from({ length: PERIODS }, (_, i) => {
    const p = i + 1
    const h = hash(`${cls}-P${p}`)
    return { p, subject: subjects[h % subjects.length], marked: (h % 100) < 78 }
  }), [cls])
  const markedCount = slots.filter((s) => s.marked).length

  return (
    <Card pad={false}>
      <CardHead
        title="Period-wise attendance"
        sub={`${markedCount} of ${PERIODS} periods marked`}
        icon="grid"
        action={<Select options={classList} value={cls} onChange={(e) => setCls(e.target.value)} />}
      />
      <div className="sm-grid-3 gap12" style={{ padding: 16 }}>
        {slots.map((s) => (
          <Card key={s.p} style={{ borderColor: s.marked ? 'var(--success)' : 'var(--border)' }}>
            <div className="row ai-center jc-between">
              <span className="t-md fw6">Period {s.p}</span>
              <Badge tone={s.marked ? 'success' : 'neutral'} dot>{s.marked ? 'Marked' : 'Unmarked'}</Badge>
            </div>
            <div className="t-sm muted" style={{ marginTop: 8 }}>{s.subject}</div>
            {!s.marked && (
              <Btn size="sm" variant="secondary" icon="edit" style={{ marginTop: 10 }}
                onClick={() => toast.info('Mark period', `${cls} · Period ${s.p} (${s.subject})`)}>
                Mark now
              </Btn>
            )}
          </Card>
        ))}
      </div>
    </Card>
  )
}

/* ============================================================
   Geo-fence (Platinum) — sample UI behind TierGate
   ============================================================ */
const GEO_CHECKINS = [
  { name: 'Main Gate', within: 142, status: 'inside' as const },
  { name: 'Staff Parking', within: 38, status: 'inside' as const },
  { name: 'Sports Ground', within: 6, status: 'edge' as const },
  { name: 'Off-campus', within: 3, status: 'outside' as const },
]
function GeoFence() {
  return (
    <TierGate feature="attendance.geofence" title="Geo-fenced attendance">
      <Card pad={false}>
        <CardHead title="Geo-fenced attendance" sub="Auto check-in when devices enter the campus boundary" icon="pin" action={<Badge tone="info" icon="globe">Live</Badge>} />
        <div className="sm-grid-2 gap16" style={{ padding: 16 }}>
          <div style={{
            position: 'relative', minHeight: 220, borderRadius: 12, overflow: 'hidden',
            background: 'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--brand-600) 18%, var(--surface-2)), var(--surface-2))',
            border: '1px solid var(--border)',
          }}>
            <div style={{ position: 'absolute', inset: '50% auto auto 50%', transform: 'translate(-50%,-50%)', width: 150, height: 150, borderRadius: '50%', border: '2px dashed var(--brand-600)', opacity: 0.7 }} />
            <div style={{ position: 'absolute', inset: '50% auto auto 50%', transform: 'translate(-50%,-50%)', color: 'var(--brand-600)' }}><Icon name="pin" size={26} /></div>
            <span className="t-xs muted3" style={{ position: 'absolute', bottom: 10, left: 12 }}>Campus geo-fence · radius 250 m</span>
          </div>
          <div className="col gap8">
            {GEO_CHECKINS.map((g) => (
              <div key={g.name} className="row ai-center jc-between" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div className="row ai-center gap12">
                  <span className="sm-kpi-ic" style={{ marginBottom: 0 }}><Icon name="pin" size={16} /></span>
                  <div>
                    <div className="t-md fw6">{g.name}</div>
                    <div className="t-xs muted3">{g.within} people detected</div>
                  </div>
                </div>
                <Badge tone={g.status === 'inside' ? 'success' : g.status === 'edge' ? 'warning' : 'danger'} dot>
                  {g.status === 'inside' ? 'Inside fence' : g.status === 'edge' ? 'At boundary' : 'Outside'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </TierGate>
  )
}

/* ============================================================
   Screen
   ============================================================ */
function AttendanceScreen() {
  const app = useApp()
  const editable = can(app.role, 'attendance', 'E')
  const [group, setGroup] = useState<Group>('students')

  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div>
      <PageHead
        title="Attendance"
        sub={dateStr}
        actions={<Btn variant="secondary" icon="download">Export register</Btn>}
      />

      {/* Today's at a glance */}
      <div className="sm-grid-3" style={{ marginBottom: 16 }}>
        <SummaryCard group="students" tone="var(--brand-600)" active={group === 'students'} onClick={() => setGroup('students')} />
        <SummaryCard group="teachers" tone="#7c3aed" active={group === 'teachers'} onClick={() => setGroup('teachers')} />
        <SummaryCard group="staff" tone="#0d9488" active={group === 'staff'} onClick={() => setGroup('staff')} />
      </div>

      {/* Group control */}
      <div style={{ marginBottom: 16 }}>
        <Segmented value={group} onChange={(v) => setGroup(v as Group)} options={GROUP_OPTS} />
      </div>

      {/* Active group */}
      {(group === 'students' || group === 'teachers' || group === 'staff') && <Roster group={group} editable={editable} />}
      {group === 'period' && <PeriodWise />}
      {group === 'geo' && <GeoFence />}
    </div>
  )
}

import type { ComponentType } from 'react'
export const attendanceScreens: Record<string, ComponentType> = { 'school.attendance': AttendanceScreen }
