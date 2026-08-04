/* ============================================================
   SchoolMate — Attendance
   Students: class-wise (day/month) — marks from CRM + teacher app.
   Teachers: check-ins from teacher app + present/absent edit.
   Staff: photos + present/absent. Geo-fence: Platinum campus setup + live punches.
   ============================================================ */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can, tierIncludes } from '@/lib/gating'
import {
  PageHead, Card, CardHead, Btn, Badge, Avatar, Search, Select, Segmented, Input,
  Icon, Empty, DataTable, type Column, type BadgeTone,
} from '@/components/ui'
import { RestrictedScreen } from '@/components/shell/gates'
import { useStudents } from '@/api/hooks/useStudents'
import { useTeachers } from '@/api/hooks/useTeachers'
import { useStaff } from '@/api/hooks/useStaff'
import { usePrincipalAttendance } from '@/api/hooks/usePrincipalAttendance'
import { resolvePeoplePhoto } from '@/api/peopleExtras'
import {
  loadPeopleAttendance, savePeopleAttendance, explicitPeopleStatus,
  countPeoplePresent, PEOPLE_ATTENDANCE_CHANGED,
  fetchRemotePeopleAttendance, pushPeopleAttendance,
} from '@/api/peopleAttendance'
import { ClassWiseStudents } from './attendanceClassWise'
import { listAllLocalAttendance, type AttendanceStatus } from '@/api/attendance'
import { listAllLocalPeopleAttendance } from '@/api/peopleAttendance'
import { buildStudentRegisterRows, registerToCsv, type RegisterRow } from '@/lib/attendanceExport'
import { downloadTextFile } from '@/lib/feeExport'
import {
  resolveGeoAttendancePeople, geoPeopleToCheckInMap, principalStaffToCheckInMap,
} from '@/lib/geoAttendanceDemo'
import type { Teacher, Staff, Role } from '@/types'
import { GeoFencePanel } from './geoFencePanel'

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

const GROUP_OPTS_ALL_BASE = [
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'staff', label: 'Staff' },
  { value: 'geo', label: 'Geo-fence' },
] as const

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

/** Wall-clock punch time from the teacher app (e.g. "10:16 AM"). */
function formatCheckInTime(at: string | null | undefined): string {
  if (!at) return '—'
  const s = at.trim()
  const d = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)
    ? new Date(`${s}Z`)
    : new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function PunchTimeCell({ at }: { at?: string | null }) {
  if (!at) return <span className="t-sm muted3">—</span>
  return (
    <span className="t-sm fw6" style={{ color: 'var(--brand-600)' }}>
      <Icon name="clock" size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
      {formatCheckInTime(at)}
    </span>
  )
}

function useGeoAttendance(date: string) {
  const app = useApp()
  const geoFence = tierIncludes(app.plan, 'attendance.geofence')
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  const principalQ = usePrincipalAttendance(date, geoFence)

  return useMemo(() => {
    const people = resolveGeoAttendancePeople(
      teachersQ.data ?? [],
      staffQ.data ?? [],
      principalQ.data?.staff ?? [],
      principalQ.isSuccess,
      geoFence,
    )
    const staffRows = principalQ.data?.staff ?? []
    return {
      geoFence,
      people,
      checkIn: geoFence && principalQ.isSuccess
        ? principalStaffToCheckInMap(staffRows)
        : geoPeopleToCheckInMap(people),
      principalKnown: geoFence && principalQ.isSuccess,
      loading: geoFence && (teachersQ.isLoading || staffQ.isLoading || principalQ.isLoading),
    }
  }, [
    geoFence, teachersQ.data, staffQ.data, staffQ.isLoading, teachersQ.isLoading,
    principalQ.data, principalQ.isSuccess, principalQ.isLoading, date,
  ])
}

/* ============================================================
   Summary cards — live headcount + today's present count
   ============================================================ */
function SummaryCard({ group, tone, active, onClick }: {
  group: 'students' | 'teachers' | 'staff'; tone: string; active: boolean; onClick: () => void
}) {
  const today = todayIso()
  const geo = useGeoAttendance(today)
  const studentsQ = useStudents()
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  const principalQ = usePrincipalAttendance(today, group === 'students' || geo.geoFence)

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
    return countPeoplePresent(
      roster.map((p) => ({ id: p.id, name: p.name })),
      marks,
      geo.geoFence ? { checkIn: geo.checkIn, principalKnown: geo.principalKnown } : {},
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, today, teachersQ.data, staffQ.data, principalQ.data, principalQ.isSuccess, tick, geo.checkIn, geo.geoFence, geo.principalKnown])

  const studentMarked = useMemo(() => {
    if (group !== 'students') return 0
    return (principalQ.data?.classes ?? []).reduce((n, c) => n + (c.marked ?? 0), 0)
  }, [group, principalQ.data])

  const rate = group === 'students'
    ? (total > 0 ? Math.round((present / total) * 100) : Math.round(Number(principalQ.data?.overallPct) || 0))
    : (total ? Math.round((present / total) * 100) : 0)

  const footnote = group === 'students' && studentMarked > 0
    ? `${present} present · ${Math.max(0, studentMarked - present)} absent · ${Math.max(0, total - studentMarked)} unmarked`
    : `${present} of ${total} present`

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
      <div className="t-sm muted" style={{ marginTop: 10 }}>Today · live</div>
      <div className="row ai-center gap8" style={{ marginTop: 10 }}>
        <div className="sm-meter" style={{ flex: 1, width: 'auto' }}>
          <span style={{ width: `${rate}%`, background: tone }} />
        </div>
        <span className="t-xs muted3" style={{ whiteSpace: 'nowrap' }}>{footnote}</span>
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
  status: AttStatus | null
  appCheckIn?: boolean
  checkInAt?: string | null
  checkOutAt?: string | null
}

function StaffRoster({ group, editable }: { group: 'teachers' | 'staff'; editable: boolean }) {
  const geoFence = tierIncludes(useApp().plan, 'attendance.geofence')
  const toast = useToast()
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  const [date, setDate] = useState(todayIso)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | AttStatus>('all')
  const [draft, setDraft] = useState<Record<string, AttStatus>>({})
  const [saved, setSaved] = useState<Record<string, AttStatus>>({})
  const geo = useGeoAttendance(date)

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

  const appCheckIn = geo.checkIn

  /** `null` means nobody — CRM, teacher app, or geo-fence — has marked this person yet. */
  const statusOf = (id: string, name: string): AttStatus | null => {
    if (draft[id]) return draft[id]
    return explicitPeopleStatus(
      { id, name },
      saved,
      geo.geoFence ? { checkIn: appCheckIn, principalKnown: geo.principalKnown } : {},
    )
  }

  const all = useMemo((): PersonRow[] => {
    if (group === 'teachers') {
      return (teachersQ.data ?? []).map((t: Teacher) => {
        const hit = appCheckIn.get(t.id.toLowerCase()) ?? appCheckIn.get(t.id) ?? appCheckIn.get(t.name.trim().toLowerCase())
        return {
          id: t.id,
          name: t.name,
          hue: t.avatarHue,
          sub: `${t.dept} · ${t.desig}`,
          ytd: Number(t.attendance) || 0,
          photo: resolvePeoplePhoto('teacher', t.id, t.photoUrl),
          status: statusOf(t.id, t.name),
          appCheckIn: Boolean(hit?.checkedIn || hit?.at || hit?.checkOutAt),
          checkInAt: hit?.at,
          checkOutAt: hit?.checkOutAt,
        }
      })
    }
    return (staffQ.data ?? []).map((s: Staff) => {
      const hit = appCheckIn.get(s.id.toLowerCase()) ?? appCheckIn.get(s.id) ?? appCheckIn.get(s.name.trim().toLowerCase())
      return {
        id: s.id,
        name: s.name,
        hue: s.avatarHue,
        sub: `${s.role} · ${s.dept}`,
        ytd: Number(s.attendance) || 0,
        photo: resolvePeoplePhoto('staff', s.id, s.photoUrl),
        status: statusOf(s.id, s.name),
        appCheckIn: Boolean(hit?.checkedIn || hit?.at || hit?.checkOutAt),
        checkInAt: hit?.at,
        checkOutAt: hit?.checkOutAt,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, teachersQ.data, staffQ.data, draft, saved, appCheckIn, geo.principalKnown])

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
    const c = { present: 0, late: 0, absent: 0, unmarked: 0 }
    searched.forEach((p) => { c[p.status ?? 'unmarked']++ })
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
    for (const p of all) {
      const explicit = draft[p.id] ?? explicitPeopleStatus(
        { id: p.id, name: p.name },
        saved,
        geo.geoFence ? { checkIn: appCheckIn, principalKnown: geo.principalKnown } : {},
      )
      if (explicit) marks[p.id] = explicit
    }
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
            <div className="t-xs muted3">{r.sub}</div>
          </div>
        </div>
      ),
    },
    { key: 'sub', label: SUB_LABEL[group], sortValue: (r) => r.sub, render: (r) => <span className="t-sm muted">{r.sub}</span> },
    ...(geoFence ? [
      {
        key: 'source', label: 'Source',
        render: (r: PersonRow) => r.appCheckIn
          ? <Badge tone="info" icon="phone">Teacher app</Badge>
          : <Badge tone="neutral">Manual</Badge>,
      } satisfies Column<PersonRow>,
      {
        key: 'checkInAt',
        label: 'Check in',
        sortValue: (r: PersonRow) => (r.checkInAt ? new Date(r.checkInAt).getTime() : 0),
        render: (r: PersonRow) => <PunchTimeCell at={r.checkInAt} />,
      } satisfies Column<PersonRow>,
      {
        key: 'checkOutAt',
        label: 'Check out',
        sortValue: (r: PersonRow) => (r.checkOutAt ? new Date(r.checkOutAt).getTime() : 0),
        render: (r: PersonRow) => <PunchTimeCell at={r.checkOutAt} />,
      } satisfies Column<PersonRow>,
    ] : []),
    {
      key: 'ytd', label: 'YTD %', sortValue: (r) => r.ytd,
      render: (r) => <Badge tone={r.ytd >= 90 ? 'success' : r.ytd >= 75 ? 'warning' : 'danger'} dot>{r.ytd}%</Badge>,
    },
    {
      key: 'status', label: 'Today',
      render: (r) => editable
        ? <Segmented value={r.status ?? ''} onChange={(v) => setStatus(r.id, v as AttStatus)} options={STATUS_OPTS} />
        : r.status
          ? <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
          : <Badge tone="neutral">Not marked</Badge>,
    },
  ]

  const loading = group === 'teachers'
    ? teachersQ.isLoading || (geoFence && geo.loading)
    : group === 'staff'
      ? staffQ.isLoading || (geoFence && geo.loading)
      : staffQ.isLoading

  return (
    <Card pad={false}>
      <CardHead
        title={`${GROUP_NAME[group]} roster`}
        sub={geoFence && (group === 'teachers' || group === 'staff')
          ? `${date} · teacher app check-in / check-out show automatically · ${presentTotal}/${all.length} present`
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
              {group === 'teachers' || group === 'staff'
                ? <Badge tone="info" icon="phone">Teacher app punches</Badge>
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
          {group === 'teachers' || group === 'staff'
            ? 'Teacher app check-in and check-out appear here. Owner / Admin / Principal can override present / absent for anyone.'
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
  const geoFence = tierIncludes(app.plan, 'attendance.geofence')
  const groupOpts = useMemo(() => {
    const base = allPeople ? GROUP_OPTS_ALL_BASE : GROUP_OPTS_TEACHER
    return geoFence ? [...base] : base.filter((o) => o.value !== 'geo')
  }, [allPeople, geoFence])
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
      {allPeople && group === 'geo' && <GeoFencePanel />}
    </div>
  )
}

export const attendanceScreens: Record<string, ComponentType> = {
  'school.attendance': AttendanceScreen,
}
