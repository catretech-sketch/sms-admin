/* ============================================================
   SchoolMate — School console: live Dashboard + Approvals inbox
   ============================================================ */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import {
  Card, CardHead, Kpi, PageHead, Badge, Btn, Icon, Avatar,
  Donut, Bars, LineChart, Legend, Empty,
} from '@/components/ui'
import type { BadgeTone } from '@/components/ui'
import { SchoolPhoto } from '@/components/SchoolMark'
import { grades } from '@/data/mockDb'
import { useApprovals } from '@/api/hooks/useApprovals'
import { useActOnApproval } from '@/api/hooks/useApprovalMutations'
import { useStudents } from '@/api/hooks/useStudents'
import { useTeachers } from '@/api/hooks/useTeachers'
import { useStaff } from '@/api/hooks/useStaff'
import { usePrincipalAttendance } from '@/api/hooks/usePrincipalAttendance'
import { useFeeReportSummary } from '@/api/hooks/useFeeReports'
import {
  loadPeopleAttendance, countPeoplePresent, PEOPLE_ATTENDANCE_CHANGED,
  type CheckInInfo,
} from '@/api/peopleAttendance'
import { fmtMoney, fmtNum } from '@/lib/format'
import type { Approval, Role } from '@/types'

/* ---------- small helpers ---------- */
const STAGES = [
  { label: 'Pre-primary', share: 0.14, color: '#a855f7' },
  { label: 'Primary', share: 0.34, color: '#16a34a' },
  { label: 'Middle', share: 0.30, color: '#0ea5e9' },
  { label: 'Secondary', share: 0.22, color: '#f59e0b' },
]
const RESULT_BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D', 'E']

const ACTIVITY: { time: string; text: string }[] = [
  { time: 'just now', text: 'Payment received — ₹48,000 from Aarav Sharma (X-A)' },
  { time: '11m', text: 'Report cards published — Grade V (Periodic Test 1)' },
  { time: '24m', text: 'New admission enquiry — Nursery 2026 batch' },
  { time: '38m', text: 'Bus 12 departed route R-04 · ETA first stop 7:42 AM' },
]

const ANNOUNCEMENTS: { tag: string; tone: BadgeTone; title: string; when: string }[] = [
  { tag: 'Exam', tone: 'brand', title: 'Term-1 datesheet released for Grades VI–XII', when: 'Today' },
  { tag: 'Event', tone: 'info', title: 'Annual Sports Day — track trials begin Monday', when: 'Yesterday' },
  { tag: 'Fees', tone: 'warning', title: 'Term-2 fee window opens 15 Jun · early-bird waiver', when: '2 days ago' },
  { tag: 'Notice', tone: 'neutral', title: 'PTM scheduled this Saturday, 10 AM – 1 PM', when: '3 days ago' },
]

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function canSeeLiveAttendance(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'principal' || role === 'vice_principal'
}

/* ============================================================
   School Dashboard
   ============================================================ */
function SchoolDashboard() {
  const app = useApp()
  const s = app.school
  const cur = s.currency
  const liveAtt = canSeeLiveAttendance(app.role)
  const today = todayIso()

  const studentsQ = useStudents()
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  const attQ = usePrincipalAttendance(today, liveAtt)
  const feeQ = useFeeReportSummary()

  /* Re-read local teacher/staff marks after Attendance save (or window focus). */
  const [peopleAttTick, setPeopleAttTick] = useState(0)
  useEffect(() => {
    const bump = () => setPeopleAttTick((n) => n + 1)
    window.addEventListener(PEOPLE_ATTENDANCE_CHANGED, bump)
    window.addEventListener('focus', bump)
    return () => {
      window.removeEventListener(PEOPLE_ATTENDANCE_CHANGED, bump)
      window.removeEventListener('focus', bump)
    }
  }, [])

  const liveStudents = studentsQ.data?.length ?? s.students
  const liveTeachers = teachersQ.data?.length ?? Math.round(s.staff * 0.62)
  const liveSupport = staffQ.data?.length ?? Math.max(0, s.staff - liveTeachers)

  const apiRoll = attQ.data?.studentTotal ?? 0
  const studentTotal = Math.max(apiRoll, liveStudents)
  const studentsPresent = attQ.data?.presentTotal
    ?? Math.round((liveStudents * (s.attendance || 0)) / 100)
  const attendancePct = studentTotal > 0
    ? Math.round((studentsPresent / studentTotal) * 100)
    : (attQ.data ? Math.round(Number(attQ.data.overallPct) || 0) : Math.round(s.attendance || 0))

  /* Teachers: teacher-app check-in OR CRM Attendance mark — same rule as the Attendance roster. */
  const teachersPresent = useMemo(() => {
    const teachers = teachersQ.data ?? []
    if (!teachers.length) return 0
    const marks = loadPeopleAttendance('teachers', today)
    const checkIn = new Map<string, CheckInInfo>()
    for (const row of attQ.data?.staff ?? []) {
      checkIn.set(row.teacherId, { checkedIn: row.checkedIn, at: row.checkInAt })
      checkIn.set(row.name.toLowerCase(), { checkedIn: row.checkedIn, at: row.checkInAt })
    }
    return countPeoplePresent(
      'teachers',
      teachers.map((t) => ({ id: t.id, name: t.name })),
      marks,
      { checkIn, principalKnown: attQ.isSuccess },
    )
  }, [teachersQ.data, attQ.data, attQ.isSuccess, today, peopleAttTick])

  const teacherRate = liveTeachers ? Math.round((teachersPresent / liveTeachers) * 100) : 0

  /* Support staff: CRM Attendance · Staff tab marks for today */
  const supportPresent = useMemo(() => {
    const staff = staffQ.data ?? []
    if (!staff.length) return 0
    const marks = loadPeopleAttendance('staff', today)
    return countPeoplePresent('staff', staff.map((p) => ({ id: p.id, name: p.name })), marks)
  }, [staffQ.data, today, peopleAttTick])

  const supportRate = liveSupport ? Math.round((supportPresent / liveSupport) * 100) : 0

  const peoplePresent = teachersPresent + supportPresent
  const peopleTotal = liveTeachers + liveSupport
  const peopleRate = peopleTotal ? Math.round((peoplePresent / peopleTotal) * 100) : 0
  const staffAway = Math.max(0, peopleTotal - peoplePresent)

  const feesToday = feeQ.data?.collectedToday ?? 0
  const outstanding = feeQ.data?.outstanding ?? 0
  const collectedPct = feeQ.data?.pct ?? 0
  const collectedTerm = feeQ.data?.collectedTerm ?? 0
  const latestPayment = feeQ.data?.latestPayment
  const feeLoading = feeQ.isLoading
  const ratio = Math.round(liveStudents / Math.max(1, liveTeachers))

  const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const attTrend = useMemo(
    () => [90.4, 91.2, 89.8, 92.1, 93.0, 92.4, 93.6, attendancePct],
    [attendancePct],
  )

  const activity = useMemo(() => {
    const rows = [...ACTIVITY]
    if (latestPayment) {
      rows.unshift({
        time: 'just now',
        text: `Payment received — ${fmtMoney(latestPayment.amount, cur)} from ${latestPayment.studentName} (${latestPayment.cls})`,
      })
    }
    if (attQ.isSuccess || studentsPresent > 0) {
      rows.unshift({
        time: 'today',
        text: `Students · ${fmtNum(studentsPresent)} of ${fmtNum(studentTotal)} present (${attendancePct}%)`,
      })
    }
    rows.unshift({
      time: 'today',
      text: `Teachers · ${fmtNum(teachersPresent)} of ${fmtNum(liveTeachers)} present (${teacherRate}%)`,
    })
    rows.unshift({
      time: 'today',
      text: `Staff · ${fmtNum(supportPresent)} of ${fmtNum(liveSupport)} present (${supportRate}%)`,
    })
    return rows
  }, [
    latestPayment, cur,
    attQ.isSuccess, studentsPresent, studentTotal, attendancePct,
    teachersPresent, liveTeachers, teacherRate,
    supportPresent, liveSupport, supportRate,
  ])

  const genderBoys = Math.round(liveStudents * 0.53)
  const genderGirls = liveStudents - genderBoys
  const attLiveLabel = attQ.isFetching ? 'Refreshing…' : (attQ.isSuccess ? 'Live today' : 'Live roster')

  return (
    <div className="col gap20">
      <div className="row ai-center gap16 wrap" style={{ marginBottom: 4 }}>
        <SchoolPhoto school={s} size={88} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="t-xs muted3" style={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
            Dashboard
          </div>
          <h1 className="sm-pagehead-title" style={{ margin: '2px 0 4px' }}>{s.name}</h1>
          <div className="t-sm muted">{s.city}{s.tz ? ` · ${s.tz}` : ''}</div>
        </div>
      </div>

      {/* ---- KPI row ---- */}
      <div className="sm-kpi-grid">
        <Kpi
          icon="users" iconBg="var(--brand-50)" iconColor="var(--brand-600)"
          label="Total enrollment" value={fmtNum(liveStudents)}
          delta="3.8%" deltaDir="up"
          foot={`${grades.length} grades · ${fmtNum(peopleTotal)} staff`}
          spark={[1980, 2012, 2040, 2065, 2090, 2110, 2130, liveStudents]} sparkColor="var(--brand-600)"
        />
        <Kpi
          icon="check" iconBg="var(--success-bg)" iconColor="var(--success)"
          label="Today's attendance" value={`${attendancePct}%`}
          delta={attLiveLabel} deltaDir="up"
          foot={`${fmtNum(studentsPresent)} of ${fmtNum(studentTotal)} students present`}
          spark={[91, 92, 90, 93, 92, 94, 93, attendancePct]} sparkColor="var(--success)"
        />
        <Kpi
          icon="rupee" iconBg="var(--info-bg)" iconColor="var(--info)"
          label="Fees collected today" value={feeLoading ? '—' : fmtMoney(feesToday, cur)}
          delta="12.4%" deltaDir="up"
          foot={`${collectedPct}% of term billed collected`}
          spark={[12, 18, 9, 22, 16, 24, 19, 27]} sparkColor="var(--info)"
        />
        <Kpi
          icon="wallet" iconBg="var(--warning-bg)" iconColor="var(--warning)"
          label="Outstanding dues" value={feeLoading ? '—' : fmtMoney(outstanding, cur)}
          delta="4.1%" deltaDir="down"
          foot={`${100 - collectedPct}% of term billed pending`}
          spark={[42, 40, 41, 38, 37, 35, 34, 32]} sparkColor="var(--warning)"
        />
        <Kpi
          icon="briefcase" iconBg="var(--brand-50)" iconColor="var(--brand-600)"
          label="Teachers & staff" value={`${fmtNum(peoplePresent)}/${fmtNum(peopleTotal)}`}
          delta={`${peopleRate}%`} deltaDir="up"
          foot={`Teachers ${fmtNum(teachersPresent)}/${fmtNum(liveTeachers)} · Staff ${fmtNum(supportPresent)}/${fmtNum(liveSupport)} · ${fmtNum(staffAway)} away`}
          spark={[176, 178, 175, 180, 179, 181, 180, peoplePresent]} sparkColor="var(--brand-600)"
        />
      </div>

      {/* ---- People at a glance ---- */}
      <div className="sm-grid-3">
        <PeopleCard
          icon="users" tone="var(--brand-600)" label="Students"
          count={liveStudents} sub={`Student–teacher ratio ${ratio}:1 · ${attLiveLabel}`}
          rate={attendancePct} present={studentsPresent} total={studentTotal}
          onClick={() => app.go('school.attendance')}
        />
        <PeopleCard
          icon="cap" tone="var(--success)" label="Teachers"
          count={liveTeachers} sub="Teacher app check-in + Attendance marks"
          rate={teacherRate} present={teachersPresent} total={liveTeachers}
          onClick={() => app.go('school.attendance')}
        />
        <PeopleCard
          icon="briefcase" tone="var(--info)" label="Support staff"
          count={liveSupport} sub="From Attendance · Staff tab"
          rate={supportRate} present={supportPresent} total={liveSupport}
          onClick={() => app.go('school.attendance')}
        />
      </div>

      {/* ---- Trends: attendance line + fee donut ---- */}
      <div className="sm-grid-2">
        <Card>
          <CardHead
            title="Attendance trend"
            sub={attQ.isSuccess ? `Daily average · today ${attendancePct}% (live)` : 'Daily average · last 8 months'}
            icon="trend"
            action={<Btn size="sm" variant="ghost" icon="check" onClick={() => app.go('school.attendance')}>Open attendance</Btn>}
          />
          <div style={{ marginTop: 12 }}>
            <LineChart
              series={[{ data: attTrend, color: 'var(--brand-600)', label: 'Attendance %' }]}
              labels={months} yMax={100} yFmt={(v) => `${Math.round(v)}%`}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Fee collection" sub="Term billed progress" icon="rupee" />
          <div className="row ai-center jc-between gap16 wrap" style={{ marginTop: 12 }}>
            <Donut
              segments={[
                { value: collectedPct, color: 'var(--success)', label: 'Collected' },
                { value: 100 - collectedPct, color: 'var(--surface-3)', label: 'Pending' },
              ]}
              size={148} thickness={18}
              center={
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                    {feeLoading ? '—' : `${collectedPct}%`}
                  </div>
                  <div className="t-xs muted3" style={{ marginTop: 2 }}>collected</div>
                </div>
              }
            />
            <div className="col gap12" style={{ flex: 1, minWidth: 160 }}>
              <Legend items={[
                { color: 'var(--success)', label: `Collected — ${feeLoading ? '—' : fmtMoney(collectedTerm, cur)}` },
                { color: 'var(--surface-3)', label: `Outstanding — ${feeLoading ? '—' : fmtMoney(outstanding, cur)}` },
              ]} />
              <div className="t-sm muted">On-time collection is up <strong style={{ color: 'var(--success)' }}>12.4%</strong> vs last month.</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ---- Composition: stages · gender · results ---- */}
      <div className="sm-grid-3">
        <Card>
          <CardHead title="Enrolment by stage" icon="layers" />
          <div className="row ai-center jc-center" style={{ margin: '8px 0 14px' }}>
            <Donut
              segments={STAGES.map((st) => ({ value: Math.round(liveStudents * st.share), color: st.color, label: st.label }))}
              size={138} thickness={16}
              center={<div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{fmtNum(liveStudents)}</div>
                <div className="t-xs muted3">students</div>
              </div>}
            />
          </div>
          <Legend items={STAGES.map((st) => ({ color: st.color, label: st.label }))} />
        </Card>

        <Card>
          <CardHead title="Gender ratio" icon="users" />
          <div className="row ai-center jc-center" style={{ margin: '8px 0 14px' }}>
            <Donut
              segments={[
                { value: genderBoys, color: '#0ea5e9', label: 'Boys' },
                { value: genderGirls, color: '#ec4899', label: 'Girls' },
              ]}
              size={138} thickness={16}
              center={<div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                  {liveStudents ? Math.round((genderBoys / liveStudents) * 100) : 0}:{liveStudents ? Math.round((genderGirls / liveStudents) * 100) : 0}
                </div>
                <div className="t-xs muted3">boys : girls</div>
              </div>}
            />
          </div>
          <Legend items={[
            { color: '#0ea5e9', label: `Boys — ${fmtNum(genderBoys)}` },
            { color: '#ec4899', label: `Girls — ${fmtNum(genderGirls)}` },
          ]} />
        </Card>

        <Card>
          <CardHead title="Result distribution" sub="Last term · grade bands" icon="cap" />
          <div style={{ marginTop: 12 }}>
            <Bars
              data={[
                { value: 14, label: 'A1', color: '#16a34a' },
                { value: 22, label: 'A2', color: '#16a34a' },
                { value: 26, label: 'B1', color: '#0ea5e9' },
                { value: 18, label: 'B2', color: '#0ea5e9' },
                { value: 11, label: 'C1', color: '#f59e0b' },
                { value: 6, label: 'C2', color: '#f59e0b' },
                { value: 2, label: 'D', color: '#dc2626' },
                { value: 1, label: 'E', color: '#dc2626' },
              ]}
              h={150} valueFmt={(v) => `${v}%`}
            />
          </div>
          <div className="t-xs muted3" style={{ marginTop: 8 }}>Share of students per band across {RESULT_BANDS.length} grades.</div>
        </Card>
      </div>

      {/* ---- Live activity + announcements ---- */}
      <div className="sm-grid-2">
        <Card>
          <CardHead
            title="Live activity"
            sub="Real-time across modules"
            icon="zap"
            action={<Badge tone="success" dot>Live</Badge>}
          />
          <div className="col gap12" style={{ marginTop: 12 }}>
            {activity.map((a, i) => (
              <div key={i} className="row ai-center gap12">
                <span className="sm-dot-live" />
                <div className="t-md" style={{ flex: 1 }}>{a.text}</div>
                <div className="t-xs muted3" style={{ whiteSpace: 'nowrap' }}>{a.time}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Announcements" sub="School-wide notices" icon="bell" />
          <div className="col gap12" style={{ marginTop: 12 }}>
            {ANNOUNCEMENTS.map((a, i) => (
              <div key={i} className="row ai-center gap12">
                <Badge tone={a.tone}>{a.tag}</Badge>
                <div className="t-md" style={{ flex: 1 }}>{a.title}</div>
                <div className="t-xs muted3" style={{ whiteSpace: 'nowrap' }}>{a.when}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ---------- People-at-a-glance card ---------- */
function PeopleCard({ icon, tone, label, count, sub, rate, present, total, onClick }: {
  icon: string; tone: string; label: string; count: number; sub: string
  rate: number; present: number; total: number; onClick: () => void
}) {
  return (
    <Card hover onClick={onClick}>
      <div className="row ai-center jc-between">
        <div className="row ai-center gap12">
          <span className="sm-kpi-ic" style={{ background: 'color-mix(in srgb, ' + tone + ' 14%, transparent)', color: tone, marginBottom: 0 }}>
            <Icon name={icon} size={18} />
          </span>
          <div>
            <div className="sm-kpi-val" style={{ fontSize: 24 }}>{fmtNum(count)}</div>
            <div className="sm-kpi-label">{label}</div>
          </div>
        </div>
        <Icon name="chevRight" size={18} style={{ color: 'var(--text-3)' }} />
      </div>
      <div className="t-sm muted" style={{ marginTop: 10 }}>{sub}</div>
      <div className="row ai-center gap8" style={{ marginTop: 10 }}>
        <div className="sm-meter" style={{ flex: 1, width: 'auto' }}>
          <span style={{ width: `${rate}%`, background: tone }} />
        </div>
        <span className="t-xs muted3" style={{ whiteSpace: 'nowrap' }}>{fmtNum(present)} of {fmtNum(total)} present</span>
      </div>
    </Card>
  )
}

/* ============================================================
   Approvals Inbox
   ============================================================ */
const PRIORITY_TONE: Record<Approval['priority'], BadgeTone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

function ApprovalsInbox() {
  const app = useApp()
  const toast = useToast()
  const [acted, setActed] = useState<Set<string>>(new Set())
  const actOn = useActOnApproval()

  const { data: approvalsData } = useApprovals()
  const approvals = approvalsData ?? []
  const list = approvals.filter((a) => a.forRoles.includes(app.role) && !acted.has(a.id))

  const act = (a: Approval, kind: 'approve' | 'reject') => {
    setActed((prev) => new Set(prev).add(a.id))
    actOn.mutate({ id: a.id, status: kind === 'approve' ? 'approved' : 'rejected' })
    if (kind === 'approve') toast.success('Approved', `${a.title} — ${a.id}`)
    else toast.danger('Rejected', `${a.title} — ${a.id}`)
  }

  return (
    <div className="col gap20">
      <PageHead title="Approvals" sub="Pending your action" />

      {list.length === 0 ? (
        <Empty icon="checkCircle" title="All caught up" body="No approvals pending your action." />
      ) : (
        <div className="col gap16">
          {list.map((a) => (
            <Card key={a.id}>
              <div className="row ai-center jc-between gap12 wrap">
                <div className="row ai-center gap8 wrap">
                  <Badge tone={PRIORITY_TONE[a.priority]} solid={a.priority === 'high'}>
                    {a.priority} priority
                  </Badge>
                  <Badge tone="neutral" icon="layers">{a.type}</Badge>
                  <span className="t-xs muted3">{a.id}</span>
                </div>
                <span className="t-xs muted3 row ai-center gap6">
                  <Icon name="clock" size={13} />{a.age} ago
                </span>
              </div>

              <div className="sm-card-title" style={{ marginTop: 12 }}>{a.title}</div>
              <div className="t-sm muted" style={{ marginTop: 4 }}>{a.detail}</div>

              <div className="row ai-center jc-between gap12 wrap" style={{ marginTop: 14 }}>
                <div className="row ai-center gap10">
                  <Avatar name={a.requester} size={32} />
                  <div>
                    <div className="t-md" style={{ fontWeight: 600 }}>{a.requester}</div>
                    <div className="t-xs muted3">{a.role}</div>
                  </div>
                  {a.amount != null && (
                    <Badge tone="info" icon="rupee" style={{ marginLeft: 6 }}>
                      {fmtMoney(a.amount, app.school.currency)}
                    </Badge>
                  )}
                </div>
                <div className="row ai-center gap8">
                  <Btn variant="secondary" icon="x" onClick={() => act(a, 'reject')}>Reject</Btn>
                  <Btn variant="primary" icon="check" onClick={() => act(a, 'approve')}>Approve</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- export contract ---------- */
export const dashboardScreens: Record<string, ComponentType> = {
  'school.dashboard': SchoolDashboard,
  'school.approvals': ApprovalsInbox,
}
