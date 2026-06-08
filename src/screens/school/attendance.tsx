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
  { value: 'period', label: 'Subject-wise' },
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
   Subject-wise — driven by the class's timetable. Pick a class
   and a period (P1–P8); the subject + teacher come from that
   class's published timetable. Mark each student and submit.
   ============================================================ */
const PERIODS = 8
const classList = grades.slice(8).flatMap((g) => sections.map((s) => `${g}-${s}`))
const STATUS_OPTS = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
]

/* deterministic teacher for a subject (qualified pool, falls back to all) */
function teacherForSubject(subject: string, salt: string): { id: string; name: string } {
  const pool = teachers.filter((t) => t.subjects.includes(subject))
  const list = pool.length ? pool : teachers
  const t = list[hash(subject + salt) % list.length]
  return { id: t.id, name: t.name }
}

/* a class's published daily timetable: period -> subject + teacher (deterministic) */
interface TtSlot { period: number; subject: string; teacherId: string; teacherName: string }
function classTimetable(cls: string): TtSlot[] {
  return Array.from({ length: PERIODS }, (_, i) => {
    const p = i + 1
    const subject = subjects[hash(`${cls}-P${p}`) % subjects.length]
    const t = teacherForSubject(subject, `${cls}-P${p}`)
    return { period: p, subject, teacherId: t.id, teacherName: t.name }
  })
}

function SubjectWise({ editable }: { editable: boolean }) {
  const toast = useToast()
  const [cls, setCls] = useState(students[0]?.cls ?? classList[0])
  const [period, setPeriod] = useState(1)
  const [marks, setMarks] = useState<Record<string, AttStatus>>({})

  const timetable = useMemo(() => classTimetable(cls), [cls])
  const slot = timetable[period - 1]
  const roster = useMemo(() => students.filter((s) => s.cls === cls), [cls])
  const markKey = (id: string) => `${cls}|P${period}|${id}`
  const statusFor = (s: { id: string; attendance: number }): AttStatus =>
    marks[markKey(s.id)] ?? statusOf(s.id + 'P' + period, s.attendance)
  const presentCount = roster.filter((s) => statusFor(s) !== 'absent').length

  const setStatus = (id: string, st: AttStatus) => setMarks((m) => ({ ...m, [markKey(id)]: st }))
  const markAllPresent = () =>
    setMarks((m) => ({ ...m, ...Object.fromEntries(roster.map((s) => [markKey(s.id), 'present' as AttStatus])) }))

  return (
    <Card pad={false}>
      <CardHead
        title="Subject-wise attendance"
        sub={`${cls} · from the class timetable`}
        icon="grid"
        action={
          <div className="row ai-center gap8">
            <Select options={classList} value={cls} onChange={(e) => setCls(e.target.value)} />
            <Select
              value={String(period)}
              onChange={(e) => setPeriod(Number(e.target.value))}
              options={timetable.map((t) => ({ value: String(t.period), label: `P${t.period} · ${t.subject}` }))}
            />
          </div>
        }
      />

      {/* period header — subject + teacher pulled from the timetable */}
      <div className="row ai-center jc-between gap12 wrap" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div className="row ai-center gap10">
          <Badge tone="brand" icon="clock">Period {slot.period}</Badge>
          <span className="t-md fw6">{slot.subject}</span>
          <span className="t-sm muted">· {slot.teacherName}</span>
        </div>
        <Badge tone={presentCount === roster.length ? 'success' : 'neutral'}>{presentCount}/{roster.length} present</Badge>
      </div>

      {roster.length === 0 ? (
        <div style={{ padding: 8 }}><Empty icon="users" title="No students" body={`No students are enrolled in ${cls}.`} /></div>
      ) : (
        <>
          <div className="row ai-center jc-between gap12 wrap" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-sm muted">Mark each student for {slot.subject} (Period {slot.period}).</span>
            {editable && <Btn size="sm" variant="secondary" icon="check" onClick={markAllPresent}>Mark all present</Btn>}
          </div>
          <div className="col">
            {roster.map((s) => {
              const st = statusFor(s)
              return (
                <div key={s.id} className="row ai-center jc-between gap12" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="row ai-center gap12" style={{ minWidth: 0 }}>
                    <Avatar name={s.name} hue={s.avatarHue} size={32} />
                    <div style={{ minWidth: 0 }}>
                      <div className="t-md fw6">{s.name}</div>
                      <div className="t-xs muted3">{s.id} · {s.cls}</div>
                    </div>
                  </div>
                  {editable
                    ? <Segmented value={st} onChange={(v) => setStatus(s.id, v as AttStatus)} options={STATUS_OPTS} />
                    : <Badge tone={STATUS_TONE[st]} dot>{STATUS_LABEL[st]}</Badge>}
                </div>
              )
            })}
          </div>
          <div className="row ai-center jc-between" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span className="t-sm muted">{presentCount} present · {roster.length - presentCount} absent</span>
            <Btn variant="primary" icon="check" disabled={!editable}
              onClick={() => toast.success('Attendance submitted', `${cls} · P${slot.period} ${slot.subject} · ${presentCount}/${roster.length} present`)}>
              Submit attendance
            </Btn>
          </div>
        </>
      )}
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
  const force = [
    ...teachers.map((t) => ({ id: t.id, attendance: t.attendance })),
    ...staff.map((s) => ({ id: s.id, attendance: s.attendance })),
  ]
  const inside = force.filter((p) => statusOf(p.id, p.attendance) !== 'absent').length

  return (
    <TierGate feature="attendance.geofence" title="Geo-fenced check-in">
      <Card pad={false}>
        <CardHead
          title="Geo-fenced check-in"
          sub="Auto check-in for teachers & staff entering campus"
          icon="pin"
          action={<Badge tone="info" icon="globe">Live</Badge>}
        />
        <div className="row ai-center gap10 wrap" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <Badge tone="success" icon="cap">{inside} of {force.length} teachers &amp; staff inside the fence</Badge>
          <span className="t-xs muted3">Students aren’t geo-fenced — they’re marked class- &amp; subject-wise.</span>
        </div>
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
      {group === 'period' && <SubjectWise editable={editable} />}
      {group === 'geo' && <GeoFence />}
    </div>
  )
}

import type { ComponentType } from 'react'
export const attendanceScreens: Record<string, ComponentType> = { 'school.attendance': AttendanceScreen }
