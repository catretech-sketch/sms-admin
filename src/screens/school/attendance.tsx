/* ============================================================
   SchoolMate — Attendance
   Students: class-wise (day/month) — marks from CRM + teacher app.
   Teachers: check-ins from teacher app + present/absent edit.
   Staff: photos + present/absent. Geo-fence: Platinum preview.
   ============================================================ */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can } from '@/lib/gating'
import {
  PageHead, Card, CardHead, Btn, Badge, Avatar, Search, Select, Segmented, Input,
  Icon, Empty, DataTable, type Column, type BadgeTone,
  DemoBadge,
} from '@/components/ui'
import { TierGate, RestrictedScreen } from '@/components/shell/gates'
import { useStudents } from '@/api/hooks/useStudents'
import { useTeachers } from '@/api/hooks/useTeachers'
import { useStaff } from '@/api/hooks/useStaff'
import { usePrincipalAttendance } from '@/api/hooks/usePrincipalAttendance'
import { peoplePhotoUrl } from '@/api/peopleExtras'
import {
  loadPeopleAttendance, savePeopleAttendance, effectivePeopleStatus,
  countPeoplePresent, PEOPLE_ATTENDANCE_CHANGED, type CheckInInfo,
  fetchRemotePeopleAttendance, pushPeopleAttendance,
} from '@/api/peopleAttendance'
import { ClassWiseStudents } from './attendanceClassWise'
import { listAllLocalAttendance, type AttendanceStatus } from '@/api/attendance'
import { listAllLocalPeopleAttendance } from '@/api/peopleAttendance'
import { buildStudentRegisterRows, registerToCsv, type RegisterRow } from '@/lib/attendanceExport'
import { downloadTextFile } from '@/lib/feeExport'
import type { Teacher, Staff, Role } from '@/types'

type Group = 'students' | 'teachers' | 'staff' | 'geo'
type AttStatus = AttendanceStatus

/** Owner / Admin / Principal / VP — full school roll (students + teachers + staff). */
function seesAllPeople(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'principal' || role === 'vice_principal'
}

/** Leadership can always mark anyone present/absent; teachers keep class Edit from the matrix. */
function canMarkAttendance(role: Role): boolean {
  if (seesAllPeople(role)) return true
  return can(role, 'attendance', 'E')
}

const GROUP_OPTS_ALL = [
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'staff', label: 'Staff' },
  { value: 'geo', label: 'Geo-fence' },
]

const GROUP_OPTS_TEACHER = [
  { value: 'students', label: 'Students' },
]

const STATUS_TONE: Record<AttStatus, BadgeTone> = { present: 'success', late: 'warning', absent: 'danger' }
const STATUS_LABEL: Record<AttStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent' }
const STATUS_OPTS = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
]

const SUB_LABEL = { students: 'Class', teachers: 'Department', staff: 'Role' } as const
const GROUP_NAME = { students: 'Students', teachers: 'Teachers', staff: 'Support staff' } as const
const GROUP_ICON = { students: 'users', teachers: 'cap', staff: 'briefcase' } as const

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ============================================================
   Summary cards — live headcount + today's present count
   ============================================================ */
function SummaryCard({ group, tone, active, onClick }: {
  group: 'students' | 'teachers' | 'staff'; tone: string; active: boolean; onClick: () => void
}) {
  const studentsQ = useStudents()
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  const today = todayIso()
  const principalQ = usePrincipalAttendance(today, group === 'students' || group === 'teachers')

  // Re-read local teacher/staff marks after a roster save.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (group === 'students') return
    const bump = () => setTick((n) => n + 1)
    window.addEventListener(PEOPLE_ATTENDANCE_CHANGED, bump)
    window.addEventListener('focus', bump)
    return () => {
      window.removeEventListener(PEOPLE_ATTENDANCE_CHANGED, bump)
      window.removeEventListener('focus', bump)
    }
  }, [group])

  const people =
    group === 'students' ? (studentsQ.data ?? [])
    : group === 'teachers' ? (teachersQ.data ?? [])
    : (staffQ.data ?? [])
  const total = group === 'students'
    ? Math.max(principalQ.data?.studentTotal ?? 0, people.length)
    : people.length

  const present = useMemo(() => {
    if (group === 'students') return principalQ.data?.presentTotal ?? 0
    const roster = (group === 'teachers' ? teachersQ.data : staffQ.data) ?? []
    const marks = loadPeopleAttendance(group, today)
    const checkIn = new Map<string, CheckInInfo>()
    for (const s of principalQ.data?.staff ?? []) {
      checkIn.set(s.teacherId, { checkedIn: s.checkedIn, at: s.checkInAt })
      checkIn.set(s.name.toLowerCase(), { checkedIn: s.checkedIn, at: s.checkInAt })
    }
    return countPeoplePresent(
      group,
      roster.map((p) => ({ id: p.id, name: p.name })),
      marks,
      { checkIn, principalKnown: principalQ.isSuccess },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, today, teachersQ.data, staffQ.data, principalQ.data, principalQ.isSuccess, tick])

  const rate = group === 'students'
    ? (total > 0 ? Math.round((present / total) * 100) : Math.round(Number(principalQ.data?.overallPct) || 0))
    : (total ? Math.round((present / total) * 100) : 0)

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
      <div className="t-sm muted" style={{ marginTop: 10 }}>
        Today · live
      </div>
      <div className="row ai-center gap8" style={{ marginTop: 10 }}>
        <div className="sm-meter" style={{ flex: 1, width: 'auto' }}>
          <span style={{ width: `${rate}%`, background: tone }} />
        </div>
        <span className="t-xs muted3" style={{ whiteSpace: 'nowrap' }}>{present} of {total} present</span>
      </div>
    </Card>
  )
}

/* ============================================================
   Teachers / Staff roster — photos + present/absent (owner/admin/principal)
   ============================================================ */
interface PersonRow {
  id: string
  name: string
  hue: number
  sub: string
  ytd: number
  photo?: string
  status: AttStatus
  appCheckIn?: boolean
  checkInAt?: string | null
}

function StaffRoster({ group, editable }: { group: 'teachers' | 'staff'; editable: boolean }) {
  const toast = useToast()
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  const [date, setDate] = useState(todayIso)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | AttStatus>('all')
  const [draft, setDraft] = useState<Record<string, AttStatus>>({})
  const [saved, setSaved] = useState<Record<string, AttStatus>>({})
  const principalQ = usePrincipalAttendance(date, group === 'teachers')

  useEffect(() => {
    setSaved(loadPeopleAttendance(group, date))
    setDraft({})
    let cancelled = false
    void fetchRemotePeopleAttendance(group, date).then((remote) => {
      if (cancelled || !remote || !Object.keys(remote).length) return
      savePeopleAttendance(group, date, { ...loadPeopleAttendance(group, date), ...remote })
      setSaved(loadPeopleAttendance(group, date))
    })
    return () => { cancelled = true }
  }, [group, date])

  const appCheckIn = useMemo(() => {
    const m = new Map<string, CheckInInfo>()
    for (const s of principalQ.data?.staff ?? []) {
      m.set(s.teacherId, { checkedIn: s.checkedIn, at: s.checkInAt })
      m.set(s.name.toLowerCase(), { checkedIn: s.checkedIn, at: s.checkInAt })
    }
    return m
  }, [principalQ.data])

  const statusOf = (id: string, name: string): AttStatus => {
    if (draft[id]) return draft[id]
    return effectivePeopleStatus(
      group,
      { id, name },
      saved,
      { checkIn: appCheckIn, principalKnown: principalQ.isSuccess },
    )
  }

  const all = useMemo((): PersonRow[] => {
    if (group === 'teachers') {
      return (teachersQ.data ?? []).map((t: Teacher) => {
        const hit = appCheckIn.get(t.id) ?? appCheckIn.get(t.name.toLowerCase())
        return {
          id: t.id,
          name: t.name,
          hue: t.avatarHue,
          sub: `${t.dept} · ${t.desig}`,
          ytd: Number(t.attendance) || 0,
          photo: peoplePhotoUrl('teacher', t.id),
          status: statusOf(t.id, t.name),
          appCheckIn: hit?.checkedIn,
          checkInAt: hit?.at,
        }
      })
    }
    return (staffQ.data ?? []).map((s: Staff) => ({
      id: s.id,
      name: s.name,
      hue: s.avatarHue,
      sub: `${s.role} · ${s.dept}`,
      ytd: Number(s.attendance) || 0,
      photo: peoplePhotoUrl('staff', s.id),
      status: statusOf(s.id, s.name),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, teachersQ.data, staffQ.data, draft, saved, appCheckIn, principalQ.isSuccess])

  const searched = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return all
    return all.filter((p) => p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term))
  }, [all, q])

  const rows = useMemo(
    () => (filter === 'all' ? searched : searched.filter((p) => p.status === filter)),
    [searched, filter],
  )

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0 }
    searched.forEach((p) => { c[p.status]++ })
    return c
  }, [searched])

  const presentTotal = counts.present + counts.late
  const onRoll = all.length
  const absentOrUnmarked = Math.max(0, onRoll - presentTotal)
  const attendancePct = onRoll ? Math.round((presentTotal / onRoll) * 100) : 0

  const filterOpts = [
    { value: 'all', label: `All (${searched.length})` },
    { value: 'present', label: `Present (${counts.present})` },
    { value: 'late', label: `Late (${counts.late})` },
    { value: 'absent', label: `Absent (${counts.absent})` },
  ]

  const setStatus = (id: string, st: AttStatus) => setDraft((d) => ({ ...d, [id]: st }))

  const markAll = (st: AttStatus) =>
    setDraft((d) => ({ ...d, ...Object.fromEntries(all.map((p) => [p.id, st])) }))

  const submit = () => {
    const marks: Record<string, AttStatus> = { ...saved }
    for (const p of all) marks[p.id] = statusOf(p.id, p.name)
    savePeopleAttendance(group, date, marks)
    setSaved(marks)
    setDraft({})
    void pushPeopleAttendance(group, date, marks)
    toast.success('Attendance saved', `${GROUP_NAME[group]} · ${date} · ${presentTotal}/${onRoll} present`)
  }

  const cols: Column<PersonRow>[] = [
    {
      key: 'name', label: 'Name', sortValue: (r) => r.name,
      render: (r) => (
        <div className="row ai-center gap12">
          <Avatar name={r.name} hue={r.hue} size={44} src={r.photo} />
          <div>
            <div className="t-md fw6">{r.name}</div>
            <div className="t-xs muted3">
              {r.id}
              {r.appCheckIn ? ` · app in ${r.checkInAt ? new Date(r.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    { key: 'sub', label: SUB_LABEL[group], sortValue: (r) => r.sub, render: (r) => <span className="t-sm muted">{r.sub}</span> },
    {
      key: 'source', label: 'Source',
      render: (r) => group === 'teachers' && r.appCheckIn
        ? <Badge tone="info" icon="phone">Teacher app</Badge>
        : <Badge tone="neutral">Manual</Badge>,
    },
    {
      key: 'ytd', label: 'YTD %', sortValue: (r) => r.ytd,
      render: (r) => <Badge tone={r.ytd >= 90 ? 'success' : r.ytd >= 75 ? 'warning' : 'danger'} dot>{r.ytd}%</Badge>,
    },
    {
      key: 'status', label: 'Today',
      render: (r) => editable
        ? <Segmented value={r.status} onChange={(v) => setStatus(r.id, v as AttStatus)} options={STATUS_OPTS} />
        : <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>,
    },
  ]

  const loading = group === 'teachers'
    ? teachersQ.isLoading || principalQ.isLoading
    : staffQ.isLoading

  return (
    <Card pad={false}>
      <CardHead
        title={`${GROUP_NAME[group]} roster`}
        sub={group === 'teachers'
          ? `${date} · teacher app check-ins show automatically · ${presentTotal}/${all.length} present`
          : `${date} · ${presentTotal} of ${all.length} present`}
        icon={GROUP_ICON[group]}
        action={
          <div className="row ai-center gap8 wrap">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} />
            <Search value={q} onChange={setQ} placeholder={`Find ${group}…`} style={{ width: 180 }} />
            <Select options={filterOpts} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | AttStatus)} />
          </div>
        }
      />
      {loading ? (
        <div style={{ padding: 24 }}><span className="t-sm muted">Loading…</span></div>
      ) : (
        <>
          <div className="sm-att-hero">
            <div className="sm-att-hero-kpis">
              <div>
                <div className="sm-att-hero-val">{attendancePct}%</div>
                <div className="t-sm muted">{GROUP_NAME[group]} · today</div>
              </div>
              <div className="sm-att-hero-stat">
                <div className="t-lg fw7">{presentTotal}</div>
                <div className="t-xs muted3">Present</div>
              </div>
              <div className="sm-att-hero-stat">
                <div className="t-lg fw7">{absentOrUnmarked}</div>
                <div className="t-xs muted3">Absent / unmarked</div>
              </div>
              <div className="sm-att-hero-stat">
                <div className="t-lg fw7">{onRoll}</div>
                <div className="t-xs muted3">On roll</div>
              </div>
            </div>
            <div className="row ai-center gap8 wrap">
              {group === 'teachers'
                ? <Badge tone="info" icon="phone">Teacher app check-ins</Badge>
                : <Badge tone="neutral">Staff roll-call</Badge>}
              <span className="t-xs muted3">{date}</span>
            </div>
            <div className="sm-meter" style={{ width: '100%', height: 8, marginTop: 4 }}>
              <span style={{ width: `${attendancePct}%`, background: 'var(--success)' }} />
            </div>
          </div>
          <DataTable
            columns={cols}
            rows={rows}
            pageSize={8}
            rowKey={(r) => r.id}
            initialSort={{ key: 'name', dir: 'asc' }}
            empty={<Empty icon="users" title="No one yet" body={`No ${group} found for this school.`} />}
          />
        </>
      )}
      <div className="row ai-center jc-between" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <span className="t-sm muted">
          {group === 'teachers'
            ? 'Teacher app check-ins appear here. Owner / Admin / Principal can override present / absent for anyone.'
            : editable
              ? 'Owner / Admin / Principal can mark any staff present or absent.'
              : 'View only.'}
        </span>
        <div className="row ai-center gap8 wrap">
          {editable && (
            <>
              <Btn size="sm" variant="secondary" icon="check" disabled={!all.length} onClick={() => markAll('present')}>All present</Btn>
              <Btn size="sm" variant="ghost" disabled={!all.length} onClick={() => markAll('absent')}>All absent</Btn>
            </>
          )}
          <Btn
            variant="primary"
            icon="check"
            disabled={!editable || !all.length}
            onClick={submit}
          >
            Submit attendance
          </Btn>
        </div>
      </div>
    </Card>
  )
}

/* ============================================================
   Geo-fence (Platinum) — preview UI
   ============================================================ */
const GEO_CHECKINS = [
  { name: 'Main Gate', within: 0, status: 'inside' as const },
  { name: 'Staff Parking', within: 0, status: 'inside' as const },
  { name: 'Sports Ground', within: 0, status: 'edge' as const },
  { name: 'Off-campus', within: 0, status: 'outside' as const },
]

function GeoFence() {
  return (
    <TierGate feature="attendance.geofence" title="Geo-fenced check-in">
      <Card pad={false}>
        <CardHead
          title={<span className="row ai-center gap8">Geo-fenced check-in<DemoBadge /></span>}
          sub="Auto check-in for teachers & staff entering campus (Platinum)"
          icon="pin"
          action={<Badge tone="info" icon="globe">Preview</Badge>}
        />
        <div className="row ai-center gap10 wrap" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span className="t-xs muted3">Live fence counts need the staff check-in API — this is a layout preview.</span>
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
                    <div className="t-xs muted3">Awaiting live detections</div>
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
  const toast = useToast()
  const studentsQ = useStudents()
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  const allPeople = seesAllPeople(app.role)
  const canView = allPeople || can(app.role, 'attendance', 'V') || can(app.role, 'attendance', 'E')
  const editable = canMarkAttendance(app.role)
  const groupOpts = allPeople ? GROUP_OPTS_ALL : GROUP_OPTS_TEACHER
  const [group, setGroup] = useState<Group>('students')

  useEffect(() => {
    if (!groupOpts.some((o) => o.value === group)) setGroup('students')
  }, [groupOpts, group])

  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const exportRegister = () => {
    let rows: RegisterRow[] = []
    if (group === 'teachers' || group === 'staff') {
      const roster = (group === 'teachers' ? teachersQ.data : staffQ.data) ?? []
      const byId = new Map(roster.map((p) => [p.id, p.name]))
      rows = listAllLocalPeopleAttendance(group)
        .map((r) => ({ name: byId.get(r.studentId) ?? r.studentId, adm: r.studentId, cls: group, date: r.date, status: r.status }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
    } else {
      rows = buildStudentRegisterRows(listAllLocalAttendance(), studentsQ.data ?? [])
    }
    if (!rows.length) {
      toast.danger('Nothing to export', 'No attendance has been marked yet for this group.')
      return
    }
    downloadTextFile(`attendance-${group}-${todayIso()}.csv`, registerToCsv(rows))
    toast.success('Register exported', `${rows.length} mark${rows.length === 1 ? '' : 's'} · ${group}`)
  }

  if (!canView) {
    return <RestrictedScreen title="Attendance" note="Your role does not include attendance access." />
  }

  return (
    <div>
      <PageHead
        title="Attendance"
        sub={allPeople
          ? `${dateStr} · Owner / Admin / Principal can mark present / absent for any student, teacher or staff`
          : dateStr}
        actions={<Btn variant="secondary" icon="download" disabled={group === 'geo'} onClick={exportRegister}>Export register</Btn>}
      />

      {allPeople && (
        <div className="sm-grid-3" style={{ marginBottom: 16 }}>
          <SummaryCard group="students" tone="var(--brand-600)" active={group === 'students'} onClick={() => setGroup('students')} />
          <SummaryCard group="teachers" tone="#7c3aed" active={group === 'teachers'} onClick={() => setGroup('teachers')} />
          <SummaryCard group="staff" tone="#0d9488" active={group === 'staff'} onClick={() => setGroup('staff')} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <Segmented value={group} onChange={(v) => setGroup(v as Group)} options={groupOpts} />
      </div>

      {group === 'students' && <ClassWiseStudents editable={editable} leadership={allPeople} />}
      {allPeople && (group === 'teachers' || group === 'staff') && <StaffRoster group={group} editable={editable} />}
      {allPeople && group === 'geo' && <GeoFence />}
    </div>
  )
}

export const attendanceScreens: Record<string, ComponentType> = {
  'school.attendance': AttendanceScreen,
}
