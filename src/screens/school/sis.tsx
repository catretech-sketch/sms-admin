/* ============================================================
   SchoolMate — Students (SIS) list + Student 360 profile.
   Phase 1 flagship screen. Live /students list + create.
   ============================================================ */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import {
  PageHead, Card, CardHead, Btn, Badge, Avatar, Search, Select,
  Drawer, Tabs, Icon, Empty, Progress, Spark, Bars, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui'
import { gateRole } from '@/lib/gating'
import { useStudents, useStudentsPage, useStudent } from '@/api/hooks/useStudents'
import { useExams } from '@/api/hooks/useExams'
import { useExamPapers } from '@/api/hooks/useExamPapers'
import { useExamMarksMap, useStudentGrades } from '@/api/hooks/useGrades'
import { useClasses } from '@/api/hooks/useClasses'
import { studentGuardianName } from '@/api/students'
import { formatStudentRoll } from '@/lib/studentRoll'
import { listStoredDocs, downloadStoredDoc, openStoredDoc, isStoredImage, studentPhotoUrl, fetchStudentExtras } from '@/api/studentExtras'
import { openMailCompose, guardianEmailsFromStudent } from '@/lib/composeMail'
import { markKey } from '@/lib/examData'
import { properName, properPlace } from '@/lib/properCase'
import { printReportCard } from '@/lib/reportCardPrint'
import {
  reportFor, classRank, fmtMoney,
  overallToppers, classToppers,
  type TopperMetric, type ScoredStudent, type ClassTopperGroup, type TopperScoreOpts,
} from '@/lib/format'
import { useStudentMonthlyAttendance } from '@/api/hooks/useStudentMonthlyAttendance'
import { useFeeInvoices } from '@/api/hooks/useFeeInvoices'
import { useFeePayments } from '@/api/hooks/useFeePayments'
import { buildStudentTimeline } from '@/lib/studentTimeline'
import { monthlyBreakdown, monthlySeriesForKeys, academicYearMonthKeys, academicYearStart, monthDailyGrid } from '@/api/studentAttendance'
import { type AttendanceStatus } from '@/api/attendance'
import type { Student, FeeStatus, Role, Exam } from '@/types'
import type { SchoolClass } from '@/api/classes'
import { DEFAULT_GRADES } from '@/lib/defaultClasses'

/* ---------- shared helpers ---------- */
const feeTone: Record<FeeStatus, BadgeTone> = { paid: 'success', partial: 'warning', due: 'danger' }
const feeLabel: Record<FeeStatus, string> = { paid: 'Paid', partial: 'Partial', due: 'Due' }
const dayStatusTone: Record<AttendanceStatus, BadgeTone> = { present: 'success', late: 'warning', absent: 'danger', half_day: 'warning' }
const dayStatusLabel: Record<AttendanceStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent', half_day: 'Half day' }
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function fmtDayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${WEEKDAY[d.getDay()]} ${d.getDate()}`
}
const attColor = (v: number): string => (v >= 90 ? 'var(--success)' : v >= 80 ? 'var(--brand-600)' : v >= 75 ? 'var(--warning)' : 'var(--danger)')

function classLabelOf(c: SchoolClass): string {
  return (c.name || `${c.grade}-${c.section}`).trim()
}

/** Prefer marks_entry / completed exams, then latest end date. */
function pickLatestExam(exams: Exam[] | undefined): Exam | null {
  if (!exams?.length) return null
  const rank = (e: Exam) => (e.status === 'completed' ? 3 : e.status === 'marks_entry' ? 2 : e.published ? 1 : 0)
  return [...exams].sort((a, b) => {
    const rd = rank(b) - rank(a)
    if (rd) return rd
    return String(b.to || '').localeCompare(String(a.to || ''))
  })[0] ?? null
}

export function canEdit(role: Role): boolean {
  return gateRole(role) === 'admin' || role === 'principal' || role === 'vice_principal'
}

/* ============================================================
   Bulk-import wizard (upload → map → done)
   ============================================================ */
function ImportDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const steps = ['Upload', 'Map columns', 'Done']

  const reset = () => { setStep(0); onClose() }
  const finish = () => { toast.success('Import complete', '36 students imported, 0 errors.'); reset() }

  return (
    <Drawer
      open={open} onClose={reset} icon="upload"
      title="Bulk import students" sub={`Step ${step + 1} of ${steps.length} · ${steps[step]}`}
      footer={
        <div className="row gap8 jc-between">
          <Btn variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Btn>
          {step < steps.length - 1
            ? <Btn variant="primary" iconRight="arrowRight" onClick={() => setStep((s) => s + 1)}>Continue</Btn>
            : <Btn variant="primary" icon="check" onClick={finish}>Finish import</Btn>}
        </div>
      }
    >
      <div className="row gap8" style={{ marginBottom: 20 }}>
        {steps.map((s, i) => (
          <div key={s} className="row ai-center gap8 flex1">
            <Badge tone={i <= step ? 'brand' : 'neutral'} solid={i === step}>{i + 1}</Badge>
            <span className={i === step ? 'fw6 t-sm' : 'muted t-sm'}>{s}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="col gap12">
          <div className="sm-empty" style={{ border: '1px dashed var(--border)', borderRadius: 12 }}>
            <div className="sm-empty-ic"><Icon name="upload" size={26} /></div>
            <div className="sm-empty-title">Drop your CSV / XLSX here</div>
            <div className="sm-empty-body">Or use our template (Name, Class, Guardian, Phone…). Max 5,000 rows.</div>
            <div style={{ marginTop: 16 }}><Btn variant="secondary" icon="download">Download template</Btn></div>
          </div>
          <div className="row ai-center gap8 t-sm muted"><Icon name="doc" size={14} />students_2026.csv · 36 rows detected</div>
        </div>
      )}

      {step === 1 && (
        <div className="col gap10">
          <div className="muted t-sm">Match spreadsheet columns to SchoolMate fields.</div>
          {[['Column A', 'Name'], ['Column B', 'Class'], ['Column C', 'Guardian'], ['Column D', 'Phone']].map(([col, field]) => (
            <div key={col} className="row ai-center gap12">
              <Badge tone="neutral">{col}</Badge>
              <Icon name="arrowRight" size={14} />
              <Select style={{ flex: 1 }} options={['Name', 'Class', 'Guardian', 'Phone', 'Admission no', 'Ignore']} defaultValue={field} />
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <Empty
          icon="checkCircle"
          title="Ready to import"
          body="36 valid rows · 0 errors · 0 duplicates. Click Finish to enrol all students."
        />
      )}
    </Drawer>
  )
}

/* ============================================================
   Toppers — overall leaderboard + class-wise cards
   ============================================================ */
const metricLabel: Record<TopperMetric, string> = { exam: 'Exam %', attendance: 'Attendance %' }
const secondaryHdr: Record<TopperMetric, string> = { exam: 'Attendance', attendance: 'Exam %' }

function RankMedal({ rank }: { rank: number }) {
  const tone = rank === 1 ? '#d4af37' : rank === 2 ? '#9ca3af' : rank === 3 ? '#cd7f32' : null
  if (!tone) return <span className="muted fw6" style={{ width: 26, display: 'inline-block', textAlign: 'center' }}>{rank}</span>
  return (
    <span className="row ai-center jc-center fw7 t-sm" style={{ width: 26, height: 26, borderRadius: 99, flex: '0 0 auto', background: tone, color: '#fff' }}>{rank}</span>
  )
}

function Leaderboard({ rows, metric, onPick, examLabel }: {
  rows: ScoredStudent[]; metric: TopperMetric; onPick: (id: string) => void; examLabel?: string
}) {
  return (
    <Card pad={false}>
      <div style={{ padding: 16 }}>
        <CardHead
          title="Overall toppers"
          sub={examLabel
            ? `Top ${rows.length} · ${examLabel} · live marks`
            : `Top ${rows.length} · school-wide`}
          icon="cap"
        />
      </div>
      <table className="sm-table">
        <thead>
          <tr>
            <th style={{ width: 60 }}>Rank</th>
            <th>Student</th>
            <th>Class</th>
            <th className="ta-right">{metricLabel[metric]}</th>
            <th className="ta-right">{secondaryHdr[metric]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.student.id} style={{ cursor: 'pointer' }} onClick={() => onPick(r.student.id)}>
              <td><RankMedal rank={i + 1} /></td>
              <td>
                <div className="row ai-center gap10">
                  <Avatar name={properName(r.student.name)} hue={r.student.avatarHue} size={30} src={studentPhotoUrl(r.student.id)} />
                  <div>
                    <div className="fw6">{properName(r.student.name)}</div>
                    <div className="t-xs muted">{r.student.adm}</div>
                  </div>
                </div>
              </td>
              <td className="fw6">{r.student.cls}</td>
              <td className="ta-right fw7">{r.score}%</td>
              <td className="ta-right muted">{metric === 'exam' ? `${r.secondary}%` : (r.secondary > 0 ? `${r.secondary}%` : '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function ClassToppersGrid({ groups, onPick }: { groups: ClassTopperGroup[]; onPick: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {groups.map((g) => (
        <Card key={g.cls}>
          <CardHead title={`Class ${g.cls}`} sub={`Top ${g.toppers.length}`} icon="users" />
          <div className="col gap10" style={{ marginTop: 8 }}>
            {g.toppers.map((r, i) => (
              <div key={r.student.id} className="row ai-center gap10" style={{ cursor: 'pointer' }} onClick={() => onPick(r.student.id)}>
                <RankMedal rank={i + 1} />
                <Avatar name={properName(r.student.name)} hue={r.student.avatarHue} size={28} src={studentPhotoUrl(r.student.id)} />
                <div style={{ flex: 1 }}>
                  <div className="fw6">{properName(r.student.name)}</div>
                  <div className="t-xs muted">{r.student.adm}</div>
                </div>
                <span className="fw7 t-sm">{r.score}%</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

function ToppersView({ students, onPick }: { students: Student[]; onPick: (id: string) => void }) {
  const [cat, setCat] = useState<TopperMetric>('exam')
  const examsQ = useExams()
  const latestExam = useMemo(() => pickLatestExam(examsQ.data), [examsQ.data])

  const marksQ = useExamMarksMap(latestExam?.id ?? null)
  const papersQ = useExamPapers(latestExam?.id ?? null)
  const examSubjects = useMemo(
    () => [...new Set((papersQ.data ?? []).map((p) => p.subject).filter(Boolean))],
    [papersQ.data],
  )
  const liveMarks = marksQ.data ?? {}
  const subjectMax = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of papersQ.data ?? []) {
      if (p.subject) m[p.subject] = p.maxMarks || 100
    }
    return m
  }, [papersQ.data])
  const getMax = useMemo(() => (subject: string) => subjectMax[subject] ?? 100, [subjectMax])
  /* Official period attendance % from student API (PeriodAttendanceRecords aggregate). */
  const getAttendance = useMemo(
    () => (sid: string): number | null => {
      const s = students.find((x) => x.id === sid)
      return s?.attendance == null ? null : Number(s.attendance)
    },
    [students],
  )
  const scoreOpts = useMemo<TopperScoreOpts>(() => {
    /* Always resolve exam % from live marks (never the seeded/dummy report),
       so it is correct whether it's the primary column (Exam toppers) or the
       secondary column (Attendance toppers). No live marks → null → shown as "—". */
    const opts: TopperScoreOpts = { getAttendance, liveOnly: true, getMax }
    if (latestExam?.id) {
      opts.examId = latestExam.id
      opts.subjects = examSubjects.length ? examSubjects : undefined
      opts.getMark = (sid, subject) => liveMarks[markKey(latestExam.id, sid, subject)]
    }
    return opts
  }, [latestExam, examSubjects, liveMarks, getAttendance, getMax])

  const overall = useMemo(
    () => overallToppers(students, cat, 10, scoreOpts),
    [students, cat, scoreOpts],
  )
  const byClass = useMemo(
    () => classToppers(students, cat, 3, scoreOpts),
    [students, cat, scoreOpts],
  )
  const catTabs = [
    { value: 'exam', label: 'Exam toppers', icon: 'cap' },
    { value: 'attendance', label: 'Attendance toppers', icon: 'calendar' },
  ]
  const examLoading = cat === 'exam' && (examsQ.isLoading || marksQ.isLoading || papersQ.isLoading)
  const noLiveExam = cat === 'exam' && !examLoading && overall.length === 0
  const noLiveAttendance = cat === 'attendance' && overall.length === 0

  return (
    <div className="col gap16">
      <Tabs value={cat} onChange={(v) => setCat(v as TopperMetric)} tabs={catTabs} />
      {students.length === 0
        ? <Empty icon="users" title="No students" body="Add students to see toppers." />
        : examLoading
          ? <div className="t-sm muted" style={{ padding: 24 }}>Loading live exam marks…</div>
          : noLiveExam
            ? (
              <Empty
                icon="cap"
                title="No live exam marks yet"
                body="Enter marks under Exams → Marks entry. Sample / dummy exam % is not shown on toppers."
              />
            )
            : noLiveAttendance
            ? (
              <Empty
                icon="calendar"
                title="No live attendance yet"
                body="Mark students under Attendance. Toppers rank on real day marks — the dummy SIS % is not used."
              />
            )
            : (
              <>
                <Leaderboard
                  rows={overall}
                  metric={cat}
                  onPick={onPick}
                  examLabel={cat === 'exam' && latestExam ? latestExam.name : undefined}
                />
                {byClass.length === 0
                  ? null
                  : <ClassToppersGrid groups={byClass} onPick={onPick} />}
              </>
            )}
    </div>
  )
}

/* ============================================================
   StudentsScreen — SIS list
   ============================================================ */
function StudentsScreen() {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [grade, setGrade] = useState('all')
  const [status, setStatus] = useState('all')
  const [fee, setFee] = useState('all')
  const [importOpen, setImportOpen] = useState(false)
  const [view, setView] = useState<'list' | 'toppers'>('list')
  const [cursor, setCursor] = useState<string | undefined>()
  const [prevCursors, setPrevCursors] = useState<string[]>([])

  const editable = canEdit(app.role)
  const classesQ = useClasses()

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 300)
    return () => window.clearTimeout(t)
  }, [q])

  useEffect(() => {
    setCursor(undefined)
    setPrevCursors([])
  }, [qDebounced, grade, status, fee])

  const listOpts = {
    q: qDebounced.trim() || undefined,
    grade,
    status,
    fee,
    limit: 25 as const,
    cursor,
  }
  const pageQ = useStudentsPage({ ...listOpts, enabled: view === 'list' })
  const toppersQ = useStudents({ enabled: view === 'toppers' })

  const students = view === 'toppers' ? (toppersQ.data ?? []) : (pageQ.data?.rows ?? [])
  const nextCursor = pageQ.data?.nextCursor ?? null

  /* Official period attendance % from student API; null when unmarked. */
  const attendancePctOf = (s: Student): number | null =>
    s.attendance == null ? null : Number(s.attendance)

  const gradeOptions = useMemo(() => {
    const unique = new Set<string>([...DEFAULT_GRADES])
    for (const c of classesQ.data ?? []) {
      if (c.grade) unique.add(c.grade)
    }
    return [...unique]
  }, [classesQ.data])

  const rows = students

  const columns: Column<Student>[] = [
    {
      key: 'name', label: 'Student', sortValue: (s) => s.name,
      render: (s) => (
        <div className="row ai-center gap10">
          <Avatar name={s.name} hue={s.avatarHue} size={34} src={studentPhotoUrl(s.id)} />
          <div>
            <div className="fw6">{s.name}</div>
            <div className="t-xs muted">{s.adm} · {s.gender === 'M' ? 'Male' : 'Female'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'cls', label: 'Class', sortValue: (s) => s.cls,
      render: (s) => (
        <div>
          <div className="fw6">{s.cls}</div>
          <div className="t-xs muted">Roll {formatStudentRoll(s.roll)}</div>
        </div>
      ),
    },
    {
      key: 'guardian', label: 'Guardian', sortValue: (s) => studentGuardianName(s) || s.guardian,
      render: (s) => (
        <div>
          <div>{studentGuardianName(s) || '—'}</div>
          <div className="t-xs muted">{s.phone || '—'}</div>
        </div>
      ),
    },
    {
      key: 'attendance', label: 'Attendance', align: 'left', sortValue: (s) => attendancePctOf(s) ?? -1,
      render: (s) => {
        const pct = attendancePctOf(s)
        return pct == null
          ? <span className="t-sm muted3">Not marked</span>
          : (
            <div className="row ai-center gap8" style={{ minWidth: 120 }}>
              <div style={{ flex: 1 }}><Progress value={pct} color={attColor(pct)} /></div>
              <span className="t-sm fw6" style={{ width: 34 }}>{pct}%</span>
            </div>
          )
      },
    },
    {
      key: 'fee', label: 'Fees', sortValue: (s) => s.feeDue,
      render: (s) => (
        <div className="row ai-center gap8">
          <Badge tone={feeTone[s.feeStatus]} dot>{feeLabel[s.feeStatus]}</Badge>
          {s.feeDue > 0 && <span className="t-xs muted">{fmtMoney(s.feeDue)}</span>}
        </div>
      ),
    },
    {
      key: 'status', label: 'Status', align: 'center', sortValue: (s) => s.status,
      render: (s) => <Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  const sub = view === 'toppers'
    ? `${students.length} students · ${app.school.name}`
    : `${rows.length} on this page${nextCursor ? ' · more available' : ''} · ${app.school.name}`

  return (
    <div>
      <PageHead
        title="Students (SIS)"
        sub={sub}
        actions={editable ? (
          <>
            <Btn variant="primary" icon="plus" onClick={() => app.go('school.sis.add')}>Add student</Btn>
            <Btn variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>Import</Btn>
            <Btn variant="secondary" icon="arrowRight" onClick={() => toast.info('Promote class', 'Open the year-end promotion wizard to advance students.')}>Promote class</Btn>
          </>
        ) : <Badge tone="neutral" icon="eye">View only</Badge>}
      />

      <div style={{ margin: '0 0 16px' }}>
        <Tabs
          value={view}
          onChange={(v) => setView(v as 'list' | 'toppers')}
          tabs={[
            { value: 'list', label: 'All students', icon: 'users' },
            { value: 'toppers', label: 'Toppers', icon: 'cap' },
          ]}
        />
      </div>

      {view === 'toppers' ? (
        <ToppersView students={students} onPick={(id) => app.go('school.student', { focus: id })} />
      ) : (
      <>
      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search name, admission no, class…" style={{ flex: 1, minWidth: 220 }} />
          <Select options={['all', ...gradeOptions]} value={grade} onChange={(e) => setGrade(e.target.value)} />
          <Select options={[{ value: 'all', label: 'All status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} value={status} onChange={(e) => setStatus(e.target.value)} />
          <Select options={[{ value: 'all', label: 'All fees' }, { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'due', label: 'Due' }]} value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>

        <DataTable<Student>
          columns={columns}
          rows={rows}
          pageSize={25}
          rowKey={(s) => s.id}
          initialSort={{ key: 'name', dir: 'asc' }}
          bulk
          onRowClick={(s) => app.go('school.student', { focus: s.id })}
          bulkActions={(selected, clear) => (
            <>
              <Btn
                variant="secondary"
                size="sm"
                icon="message"
                onClick={() => {
                  const emails = [...new Set(selected.flatMap((s) => guardianEmailsFromStudent(s)))]
                  if (!emails.length) {
                    toast.danger('No guardian emails', 'Selected students have no guardian email on file.')
                    return
                  }
                  try {
                    openMailCompose({
                      to: emails,
                      subject: `Message from ${app.school.name}`,
                      body: 'Dear Parent / Guardian,\n\n',
                    })
                    toast.success('Opening mail', `Compose to ${emails.length} guardian email(s).`)
                    clear()
                  } catch (err) {
                    toast.danger('Could not open mail', err instanceof Error ? err.message : 'Invalid email.')
                  }
                }}
              >
                Message
              </Btn>
              <Btn variant="secondary" size="sm" icon="arrowRight" onClick={() => { toast.success('Promoted', `${selected.length} student(s) advanced.`); clear() }}>Promote</Btn>
              <Btn variant="ghost" size="sm" onClick={clear}>Clear</Btn>
            </>
          )}
          empty={<Empty icon="users" title="No students match" body="Try adjusting the search or filters." />}
        />
        <div className="row ai-center jc-between gap12" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <Btn
            variant="secondary"
            size="sm"
            disabled={!prevCursors.length || pageQ.isFetching}
            onClick={() => {
              const prev = prevCursors[prevCursors.length - 1]
              setPrevCursors((s) => s.slice(0, -1))
              setCursor(prev)
            }}
          >
            Previous
          </Btn>
          <span className="t-xs muted">{pageQ.isFetching ? 'Loading…' : `${rows.length} students`}</span>
          <Btn
            variant="secondary"
            size="sm"
            disabled={!nextCursor || pageQ.isFetching}
            onClick={() => {
              setPrevCursors((s) => [...s, cursor ?? ''])
              setCursor(nextCursor ?? undefined)
            }}
          >
            Next
          </Btn>
        </div>
      </Card>

      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
      </>
      )}
    </div>
  )
}

/* ============================================================
   Student 360 — full profile
   ============================================================ */
function StatTile({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div className="row ai-center gap10">
      <span className="sm-kpi-ic" style={{ color: color, background: 'var(--surface-2)' }}><Icon name={icon} size={18} /></span>
      <div>
        <div className="fw7 t-lg">{value}</div>
        <div className="t-xs muted">{label}</div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  const v = value === undefined || value === null || String(value).trim() === '' ? '—' : String(value)
  return (
    <div className="row ai-center jc-between gap12" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted t-sm">{label}</span>
      <span className="fw6 t-sm" style={{ textAlign: 'right' }}>{v}</span>
    </div>
  )
}

function Student360() {
  const app = useApp()
  const toast = useToast()
  const [tab, setTab] = useState('details')
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const editable = canEdit(app.role)

  const { data: fetched, isLoading, isError } = useStudent(app.focus)
  const examsQ = useExams()
  const classesQ = useClasses()
  const studentsQ = useStudents({
    grade: fetched?.grade,
    enabled: Boolean(fetched?.grade),
  })
  const latestExam = useMemo(() => pickLatestExam(examsQ.data), [examsQ.data])
  // NOTE: keep every hook above the loading/error guards below so the hook
  // order stays stable across renders (React crashes otherwise).
  const classId = (classesQ.data ?? []).find((c) => classLabelOf(c) === fetched?.cls)?.id
  const papersQ = useExamPapers(latestExam?.id ?? null)
  /* One request for this student's marks — not N× /exam-papers/{id}/grades. */
  const studentGradesQ = useStudentGrades(fetched?.id ?? null)
  /* Peer marks for class rank: only this class's papers, and only when rank UI needs them. */
  const needPeerMarks = tab === 'overview' || tab === 'academics'
  const marksQ = useExamMarksMap(latestExam?.id ?? null, {
    classId: classId ?? null,
    enabled: needPeerMarks && !!classId,
  })
  const monthsQ = useStudentMonthlyAttendance(
    fetched?.id,
    classId,
    Boolean(fetched) && (tab === 'attendance' || tab === 'overview' || tab === 'timeline'),
  )
  const invoicesQ = useFeeInvoices()
  const paymentsQ = useFeePayments()
  const [extrasTick, setExtrasTick] = useState(0)

  useEffect(() => {
    if (!fetched?.id) return
    let cancelled = false
    void fetchStudentExtras(fetched.id)
      .then(() => { if (!cancelled) setExtrasTick((n) => n + 1) })
      .catch(() => { /* keep cache/legacy */ })
    return () => { cancelled = true }
  }, [fetched?.id])

  if (isLoading) {
    return <div className="col ai-center jc-center gap12" style={{ minHeight: 240 }}><div className="t-sm muted">Loading student…</div></div>
  }
  if (isError || !fetched) {
    return (
      <div>
        <Btn variant="ghost" icon="arrowLeft" onClick={() => app.go('school.sis')}>Back to students</Btn>
        <Empty icon="user" title="Student not found" body="This student is not in the live SIS for this school." />
      </div>
    )
  }
  const stu = fetched
  const classPapers = (papersQ.data ?? []).filter((p) => !classId || !p.classId || p.classId === classId)
  const examSubjects = [...new Set(classPapers.map((p) => p.subject).filter(Boolean))]
  const examId = latestExam?.id
  const liveMarks = marksQ.data ?? {}
  const subjectMax: Record<string, number> = {}
  for (const p of classPapers) {
    if (p.subject) subjectMax[p.subject] = p.maxMarks || 100
  }
  const getMax = (subject: string) => subjectMax[subject] ?? 100
  const paperIds = new Set(classPapers.map((p) => p.id))
  const studentMarkBySubject = new Map<string, number>()
  for (const g of studentGradesQ.data ?? []) {
    if (!paperIds.has(g.examPaperId)) continue
    const subject = g.subject || classPapers.find((p) => p.id === g.examPaperId)?.subject
    if (subject) studentMarkBySubject.set(subject, g.marks)
  }
  const getMark = (sid: string, subject: string) => {
    if (sid === stu.id) {
      const own = studentMarkBySubject.get(subject)
      if (own != null) return own
    }
    return examId ? liveMarks[markKey(examId, sid, subject)] : undefined
  }
  const peers = (studentsQ.data ?? []).filter((s) => s.cls === stu.cls)
  const live = { liveOnly: true as const, getMax }
  const report = examId && examSubjects.length
    ? reportFor(stu, examId, getMark, examSubjects, live)
    : { rows: [], total: 0, maxTotal: 0, pct: 0, grade: '—', gpa: 0, result: 'PASS' as const }
  const hasLiveMarks = report.rows.length > 0
  const rank = hasLiveMarks && examId && needPeerMarks && marksQ.data
    ? classRank(stu, examId, getMark, peers, examSubjects, live)
    : { rank: 0, classSize: peers.length }
  const academicsSub = hasLiveMarks && latestExam
    ? `${latestExam.name} · live marks · Overall ${report.pct}% · Grade ${report.grade} · Rank ${rank.rank}/${rank.classSize}`
    : 'No live exam marks yet — enter under Exams → Marks entry'
  const guardian = studentGuardianName(stu) || stu.guardian
  const attRecords = monthsQ.data ?? []
  const months = monthlyBreakdown(attRecords, stu.id)
  /* Official period % from API (PeriodAttendanceRecords); null when unmarked. */
  const attPct = stu.attendance == null ? null : Number(stu.attendance)
  const attPctLabel = attPct == null ? 'Not marked' : `${attPct}%`
  const academicStartYear = (() => {
    const m = String(stu.academicYear || '').match(/\d{4}/)
    return m ? Number(m[0]) : academicYearStart()
  })()
  const monthAxis = monthlySeriesForKeys(attRecords, stu.id, academicYearMonthKeys(academicStartYear))
  const markedMonths = months // months that actually have marks (for stats)
  const openMonthDays = openMonth ? monthDailyGrid(attRecords, stu.id, openMonth) : []
  const docs = listStoredDocs(stu.id, stu)
  void extrasTick
  const photoUrl = studentPhotoUrl(stu.id) ?? docs.find((d) => d.key === 'photo' && d.dataUrl)?.dataUrl
  const fatherPhotoUrl = docs.find((d) => d.key === 'fatherPhoto' && d.dataUrl)?.dataUrl
  const motherPhotoUrl = docs.find((d) => d.key === 'motherPhoto' && d.dataUrl)?.dataUrl

  const tabs = [
    { value: 'details', label: 'Details', icon: 'user' },
    { value: 'overview', label: 'Overview', icon: 'grid' },
    { value: 'academics', label: 'Academics', icon: 'cap' },
    { value: 'attendance', label: 'Attendance', icon: 'calendar' },
    { value: 'fees', label: 'Fees', icon: 'rupee' },
    { value: 'documents', label: 'Documents', icon: 'doc' },
    { value: 'timeline', label: 'Timeline', icon: 'clock' },
  ]

  // Live fee ledger — invoices for this student (API or local fallback).
  const studentInvoices = (invoicesQ.data ?? []).filter(
    (inv) => inv.studentId === stu.id || (stu.adm && inv.studentAdm === stu.adm),
  )
  const ledger = studentInvoices.map((inv) => ({
    id: inv.id,
    label: inv.lines?.map((l) => l.headName).filter(Boolean).join(', ')
      || [inv.term, inv.academicYear].filter(Boolean).join(' · ')
      || 'Fee invoice',
    amount: inv.total,
    paid: inv.paid,
    date: inv.dueDate || '—',
  }))
  const ledgerOutstanding = studentInvoices.length
    ? studentInvoices.reduce((s, inv) => s + (inv.due || 0), 0)
    : stu.feeDue

  const timeline = buildStudentTimeline({
    student: stu,
    payments: paymentsQ.data ?? [],
    invoices: studentInvoices,
    attendance: attRecords,
  })
  const feeTimeline = buildStudentTimeline({
    student: stu,
    payments: paymentsQ.data ?? [],
    invoices: studentInvoices,
    feeOnly: true,
  })
  const timelineLoading = paymentsQ.isLoading || invoicesQ.isLoading || monthsQ.isLoading
  const feeTimelineLoading = paymentsQ.isLoading || invoicesQ.isLoading

  const fmtSize = (n: number) => (n > 0 ? `${Math.max(1, Math.round(n / 1024))} KB` : '—')

  return (
    <div>
      <div className="row ai-center gap12" style={{ marginBottom: 16 }}>
        <Btn variant="ghost" icon="arrowLeft" onClick={() => app.go('school.sis')}>Back to students</Btn>
        <Btn variant="ghost" icon="users" onClick={() => app.go('school.parents')}>Parents</Btn>
      </div>

      <Card>
        <div className="row ai-center gap16 wrap jc-between">
          <div className="row ai-center gap16">
            <Avatar name={stu.name} hue={stu.avatarHue} size={68} src={photoUrl} />
            <div>
              <div className="row ai-center gap8 wrap">
                <h2 className="sm-pagehead-title" style={{ margin: 0 }}>{stu.name}</h2>
                <Badge tone={stu.status === 'active' ? 'success' : 'neutral'}>{stu.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                {hasLiveMarks && latestExam && <Badge tone="brand">{latestExam.name}</Badge>}
              </div>
              <div className="row ai-center gap12 wrap muted t-sm" style={{ marginTop: 4 }}>
                <span>{stu.adm}</span><span>·</span>
                <span>Class {stu.cls} · Roll {formatStudentRoll(stu.roll)}</span><span>·</span>
                <span>{stu.house || '—'} House</span><span>·</span>
                <span>{guardian || '—'} · {stu.phone || '—'}</span>
              </div>
            </div>
          </div>
          <div className="row ai-center gap12 wrap">
            <StatTile icon="calendar" label="Attendance" value={attPctLabel} color={attPct == null ? 'var(--text-3)' : attColor(attPct)} />
            <StatTile
              icon="cap"
              label={hasLiveMarks && rank.rank > 0 ? `Rank · ${rank.rank}/${rank.classSize}` : 'Exam %'}
              value={hasLiveMarks ? `${report.pct}%` : '—'}
              color="var(--brand-600)"
            />
            <StatTile icon="rupee" label="Fee status" value={feeLabel[stu.feeStatus]} color={`var(--${feeTone[stu.feeStatus] === 'success' ? 'success' : feeTone[stu.feeStatus] === 'warning' ? 'warning' : 'danger'})`} />
            {editable && (
              <Btn variant="primary" icon="edit" onClick={() => app.go('school.sis.edit', { focus: stu.id })}>Edit</Btn>
            )}
            <Btn
              variant="secondary"
              icon="message"
              onClick={() => {
                const emails = guardianEmailsFromStudent(stu)
                if (!emails.length) {
                  toast.danger('No email on file', `Add a guardian email for ${guardian || stu.name} before messaging.`)
                  return
                }
                try {
                  openMailCompose({
                    to: emails,
                    subject: `Regarding ${stu.name} · ${app.school.name}`,
                    body: `Dear ${guardian || 'Parent / Guardian'},\n\n`,
                  })
                  toast.success('Opening mail', `Compose email to ${guardian || 'guardian'}.`)
                } catch (err) {
                  toast.danger('Could not open mail', err instanceof Error ? err.message : 'Invalid email.')
                }
              }}
            >
              Message
            </Btn>
          </div>
        </div>
      </Card>

      <div style={{ margin: '16px 0' }}>
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
      </div>

      {tab === 'details' && (
        <div className="sm-grid-2 gap16">
          <Card>
            <CardHead title="Student" icon="user" />
            <div style={{ marginTop: 4 }}>
              <DetailRow label="Admission no." value={stu.adm} />
              <DetailRow label="Name" value={stu.name} />
              <DetailRow label="Gender" value={stu.gender === 'F' ? 'Female' : 'Male'} />
              <DetailRow label="Date of birth" value={stu.dob} />
              <DetailRow label="Class / section" value={stu.cls} />
              <DetailRow label="Roll" value={formatStudentRoll(stu.roll)} />
              <DetailRow label="House" value={stu.house} />
              <DetailRow label="Email" value={stu.email} />
              <DetailRow label="Address" value={stu.address} />
              <DetailRow label="Blood group" value={stu.bloodGroup} />
              <DetailRow label="Religion" value={stu.religion} />
              <DetailRow label="Category" value={stu.category} />
              <DetailRow label="Caste" value={stu.caste} />
              <DetailRow label="Mother tongue" value={stu.motherTongue} />
              <DetailRow label="Languages" value={stu.languages} />
              <DetailRow label="Last school" value={stu.lastSchool} />
              <DetailRow label="Aadhaar" value={stu.aadhaar} />
              <DetailRow label="Academic year" value={stu.academicYear} />
              <DetailRow label="Admission date" value={stu.admissionDate} />
            </div>
          </Card>
          <div className="col gap16">
            <Card>
              <CardHead title="Guardian / parents" icon="users" />
              <div style={{ marginTop: 4 }}>
                {(fatherPhotoUrl || motherPhotoUrl) && (
                  <div className="row ai-center gap16" style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                    {fatherPhotoUrl && (
                      <div className="col ai-center gap6">
                        <img src={fatherPhotoUrl} alt="Father" className="sm-upload-thumb is-photo" style={{ width: 64, height: 64 }} />
                        <span className="t-xs muted">Father</span>
                      </div>
                    )}
                    {motherPhotoUrl && (
                      <div className="col ai-center gap6">
                        <img src={motherPhotoUrl} alt="Mother" className="sm-upload-thumb is-photo" style={{ width: 64, height: 64 }} />
                        <span className="t-xs muted">Mother</span>
                      </div>
                    )}
                  </div>
                )}
                <DetailRow label="Guardian" value={guardian} />
                <DetailRow label="Phone" value={stu.phone} />
                <DetailRow label="Guardian email" value={stu.guardianEmail} />
                <DetailRow label="Father" value={stu.father?.name} />
                <DetailRow label="Father phone" value={stu.father?.phone} />
                <DetailRow label="Father email" value={stu.father?.email} />
                <DetailRow label="Father occupation" value={stu.father?.occupation} />
                <DetailRow label="Mother" value={stu.mother?.name} />
                <DetailRow label="Mother phone" value={stu.mother?.phone} />
                <DetailRow label="Mother email" value={stu.mother?.email} />
                <DetailRow label="Mother occupation" value={stu.mother?.occupation} />
              </div>
            </Card>
            <Card>
              <CardHead title="Fees & status" icon="rupee" />
              <div style={{ marginTop: 4 }}>
                <DetailRow label="Fee status" value={feeLabel[stu.feeStatus]} />
                <DetailRow label="Outstanding" value={fmtMoney(ledgerOutstanding)} />
                <DetailRow label="Attendance" value={attPctLabel} />
                <DetailRow label="Status" value={stu.status} />
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div className="sm-grid-2 gap16">
          <Card>
            <CardHead
              title="Performance by subject"
              sub={hasLiveMarks && latestExam ? `${latestExam.name} · marks out of 100` : 'Live exam marks only'}
              icon="cap"
            />
            {hasLiveMarks ? (
              <Bars data={report.rows.map((r) => ({ label: r.subject.slice(0, 4), value: r.marks, color: attColor(r.marks) }))} h={150} valueFmt={(v) => v} />
            ) : (
              <Empty icon="cap" title="No live marks" body="Enter marks under Exams → Marks entry. Sample scores are not shown." />
            )}
          </Card>
          <Card>
            <CardHead title="Snapshot" icon="user" />
            <div className="col gap14" style={{ marginTop: 8 }}>
              <div className="row ai-center jc-between"><span className="muted t-sm">Overall</span><span className="fw7">{hasLiveMarks ? `${report.pct}% · ${report.grade}` : '—'}</span></div>
              <div className="row ai-center jc-between"><span className="muted t-sm">Class rank</span><span className="fw7">{hasLiveMarks && rank.rank > 0 ? `${rank.rank} / ${rank.classSize}` : '—'}</span></div>
              <div className="row ai-center jc-between"><span className="muted t-sm">GPA</span><span className="fw7">{hasLiveMarks ? report.gpa : '—'}</span></div>
              <div className="row ai-center jc-between"><span className="muted t-sm">Result</span>{hasLiveMarks ? <Badge tone={report.result === 'PASS' ? 'success' : 'danger'}>{report.result}</Badge> : <span className="fw7">—</span>}</div>
              <div className="row ai-center jc-between">
                <span className="muted t-sm">Attendance trend</span>
                {months.length
                  ? <Spark data={months.map((m) => m.value)} w={120} color={attColor(attPct ?? 0)} />
                  : <span className="fw7 t-sm muted">{attPctLabel}</span>}
              </div>
              <div className="row ai-center jc-between"><span className="muted t-sm">Outstanding fees</span><span className="fw7">{fmtMoney(ledgerOutstanding)}</span></div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'academics' && (
        <Card pad={false}>
          <div style={{ padding: 16 }}>
            <CardHead
              title="Subject-wise marks"
              sub={academicsSub}
              icon="cap"
              action={hasLiveMarks ? (
                <div className="row ai-center gap8">
                  <Badge tone={report.result === 'PASS' ? 'success' : 'danger'}>{report.result}</Badge>
                  <Btn
                    variant="secondary"
                    size="sm"
                    icon="download"
                    onClick={() => {
                      const school = app.school
                      const ok = printReportCard({
                        schoolName: properName(school.name),
                        schoolCity: properPlace(school.city),
                        schoolSlug: school.slug,
                        schoolLogoInitials: (school.logo || school.name.slice(0, 2)).toUpperCase(),
                        schoolLogoUrl: school.logoUrl,
                        schoolImageUrl: school.imageUrl,
                        schoolBrandColor: school.color,
                        examName: properName(latestExam?.name) || latestExam?.name,
                        student: {
                          ...stu,
                          name: properName(stu.name),
                          guardian: properName(guardian) || guardian,
                          attendance: attPct ?? stu.attendance,
                        },
                        report,
                        rank: rank.rank,
                        classSize: rank.classSize || peers.length,
                      })
                      if (!ok) toast.danger('Could not open print', 'Allow pop-ups, then try Print again.')
                      else toast.success('Print / PDF', 'In the print dialog choose Save as PDF if you want a file.')
                    }}
                  >
                    Print
                  </Btn>
                </div>
              ) : undefined}
            />
          </div>
          {!hasLiveMarks ? (
            <div style={{ padding: '0 16px 16px' }}>
              <Empty
                icon="cap"
                title="No live exam marks yet"
                body="Enter marks under Exams → Marks entry (class-wise). Dummy sample scores are not shown."
              />
            </div>
          ) : (
          <table className="sm-table">
            <thead>
              <tr><th>Subject</th><th className="ta-right">Marks</th><th className="ta-right">Max</th><th className="ta-center">Grade</th><th className="ta-center">Result</th></tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.subject}>
                  <td className="fw6">{r.subject}</td>
                  <td className="ta-right">{r.marks}</td>
                  <td className="ta-right muted">{r.max}</td>
                  <td className="ta-center"><Badge tone="brand">{r.grade}</Badge></td>
                  <td className="ta-center"><Badge tone={r.pass ? 'success' : 'danger'}>{r.pass ? 'Pass' : 'Fail'}</Badge></td>
                </tr>
              ))}
              <tr>
                <td className="fw7">Total</td>
                <td className="ta-right fw7">{report.total}</td>
                <td className="ta-right muted">{report.maxTotal}</td>
                <td className="ta-center fw7">{report.grade}</td>
                <td className="ta-center fw7">{report.pct}%</td>
              </tr>
            </tbody>
          </table>
          )}
        </Card>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHead
            title="Monthly attendance"
            sub={monthsQ.isLoading
              ? 'Loading live marks…'
              : months.length
                ? `From class attendance marks · year average ${attPctLabel}`
                : `Year average ${attPctLabel} · no monthly marks yet`}
            icon="calendar"
          />
          {monthsQ.isLoading ? (
            <div className="t-sm muted" style={{ padding: '24px 0' }}>Loading attendance…</div>
          ) : months.length === 0 ? (
            <Empty
              icon="calendar"
              title="No monthly attendance yet"
              body="Mark students under Attendance. This chart uses real day marks only — sample months are not shown."
            />
          ) : (
            <>
              <Bars
                data={monthAxis.map((m) => ({
                  label: m.label,
                  value: m.value,
                  color: attColor(m.value),
                  valueLabel: m.total ? `${m.value}%` : '—',
                  empty: m.total === 0,
                }))}
                h={160}
                activeIndex={openMonth ? monthAxis.findIndex((m) => m.key === openMonth) : undefined}
                onBarClick={(i) => {
                  const key = monthAxis[i]?.key
                  if (key) setOpenMonth((cur) => (cur === key ? null : key))
                }}
              />
              <div className="t-xs muted3" style={{ marginTop: 6 }}>Blank months have no marks yet. Click a month to see its daily marks.</div>
              {markedMonths.length > 0 && (
                <div className="row ai-center gap20 wrap" style={{ marginTop: 16 }}>
                  <StatTile icon="check" label="Best month" value={Math.max(...markedMonths.map((m) => m.value)) + '%'} color="var(--success)" />
                  <StatTile icon="alert" label="Lowest month" value={Math.min(...markedMonths.map((m) => m.value)) + '%'} color="var(--warning)" />
                  <StatTile
                    icon="trend"
                    label="Trend"
                    value={markedMonths[markedMonths.length - 1].value >= markedMonths[0].value ? 'Improving' : 'Declining'}
                    color="var(--brand-600)"
                  />
                </div>
              )}
              {openMonth && (() => {
                const m = months.find((x) => x.key === openMonth)
                return (
                  <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <div className="row ai-center jc-between gap12 wrap" style={{ marginBottom: 12 }}>
                      <div className="row ai-center gap8">
                        <span className="fw7">{m?.label} daily marks</span>
                        {m && <Badge tone={attColor(m.value) === 'var(--success)' ? 'success' : m.value >= 75 ? 'warning' : 'danger'}>{m.present}/{m.total} present · {m.value}%</Badge>}
                      </div>
                      <Btn variant="ghost" size="sm" icon="x" onClick={() => setOpenMonth(null)}>Close</Btn>
                    </div>
                    {openMonthDays.length === 0 ? (
                      <div className="t-sm muted">No day marks recorded for this month.</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                        {openMonthDays.map((d) => (
                          <div
                            key={d.date}
                            className="row ai-center jc-between gap8"
                            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10, opacity: d.status ? 1 : (d.weekend ? 0.5 : 0.7) }}
                          >
                            <span className="t-sm fw6">{fmtDayLabel(d.date)}</span>
                            {d.status
                              ? <Badge tone={dayStatusTone[d.status]} dot>{dayStatusLabel[d.status]}</Badge>
                              : <span className="t-xs muted3">{d.weekend ? 'Weekend' : 'Blank'}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </Card>
      )}

      {tab === 'fees' && (
        <div className="col gap16">
          <Card pad={false}>
            <div style={{ padding: 16 }}>
              <CardHead
                title="Fee ledger"
                sub={invoicesQ.isLoading
                  ? 'Loading invoices…'
                  : `Outstanding ${fmtMoney(ledgerOutstanding)} · ${ledger.length} invoice${ledger.length === 1 ? '' : 's'}`}
                icon="rupee"
                action={<Badge tone={feeTone[stu.feeStatus]} dot>{feeLabel[stu.feeStatus]}</Badge>}
              />
            </div>
            {invoicesQ.isLoading ? (
              <div className="t-sm muted" style={{ padding: '0 16px 20px' }}>Loading fee invoices…</div>
            ) : ledger.length === 0 ? (
              <div style={{ padding: '0 16px 16px' }}>
                <Empty
                  icon="rupee"
                  title="No invoices yet"
                  body="No fee invoices for this student. Generate invoices under Fees to see the live ledger here."
                />
              </div>
            ) : (
            <table className="sm-table">
              <thead>
                <tr><th>Invoice</th><th>Description</th><th className="ta-right">Amount</th><th className="ta-right">Paid</th><th className="ta-right">Balance</th><th>Due date</th></tr>
              </thead>
              <tbody>
                {ledger.map((l) => {
                  const bal = l.amount - l.paid
                  return (
                    <tr key={l.id}>
                      <td className="fw6">{l.id}</td>
                      <td>{l.label}</td>
                      <td className="ta-right">{fmtMoney(l.amount)}</td>
                      <td className="ta-right">{fmtMoney(l.paid)}</td>
                      <td className="ta-right"><Badge tone={bal > 0 ? 'danger' : 'success'}>{fmtMoney(bal)}</Badge></td>
                      <td className="muted">{l.date}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            )}
          </Card>

          <Card>
            <CardHead
              title="Fee timeline"
              sub={feeTimelineLoading
                ? 'Loading…'
                : `${feeTimeline.length} event${feeTimeline.length === 1 ? '' : 's'} · invoices & payments`}
              icon="clock"
            />
            {feeTimelineLoading ? (
              <div className="t-sm muted" style={{ padding: '16px 0' }}>Loading fee activity…</div>
            ) : feeTimeline.length === 0 ? (
              <Empty
                icon="clock"
                title="No fee activity yet"
                body="Invoices and payments for this student will appear here in date order."
              />
            ) : (
              <div className="col" style={{ marginTop: 8 }}>
                {feeTimeline.map((t, i) => (
                  <div key={t.id} className="row gap12" style={{ paddingBottom: 16 }}>
                    <div className="col ai-center" style={{ width: 12 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 99, background: t.tone, marginTop: 4, flex: '0 0 auto' }} />
                      {i < feeTimeline.length - 1 && <span style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                    </div>
                    <div className="col" style={{ flex: 1, minWidth: 0 }}>
                      <div className="row ai-center jc-between gap8 wrap">
                        <div className="fw6">{t.title}</div>
                        <div className="t-xs muted">{t.date}</div>
                      </div>
                      <div className="t-sm muted">{t.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHead
            title="Documents"
            sub={docs.length ? `${docs.length} file${docs.length === 1 ? '' : 's'} on this device` : 'No enrolment files yet'}
            icon="doc"
            action={editable ? (
              <Btn variant="secondary" size="sm" icon="upload" onClick={() => app.go('school.sis.edit', { focus: stu.id })}>Add / replace</Btn>
            ) : undefined}
          />
          {docs.length === 0 ? (
            <Empty
              icon="doc"
              title="No documents"
              body={editable ? 'Edit this student and upload birth certificate, Aadhaar, or photo to see them here.' : 'No documents were uploaded for this student.'}
            />
          ) : (
            <div className="col gap8" style={{ marginTop: 8 }}>
              {docs.map((d) => (
                <div key={d.key + d.fileName} className="row ai-center jc-between" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div className="row ai-center gap12">
                    {d.dataUrl && isStoredImage(d) ? (
                      <img
                        src={d.dataUrl}
                        alt={d.label}
                        className="sm-upload-thumb is-photo"
                        style={{ width: 52, height: 52, borderRadius: 10 }}
                      />
                    ) : (
                      <span className="sm-card-ic"><Icon name="doc" size={16} /></span>
                    )}
                    <div>
                      <div className="fw6">{d.label}</div>
                      <div className="t-xs muted">{d.fileName}{d.size ? ` · ${fmtSize(d.size)}` : ''}</div>
                    </div>
                  </div>
                  <div className="row ai-center gap8">
                    <Badge tone={d.dataUrl ? 'success' : 'neutral'}>{d.dataUrl ? 'Ready' : 'Name only'}</Badge>
                    <Btn
                      variant="ghost"
                      size="sm"
                      icon="eye"
                      onClick={() => {
                        if (!openStoredDoc(d)) {
                          toast.info(
                            'Preview unavailable',
                            d.dataUrl
                              ? 'Popup blocked — try Download, or allow popups for this site.'
                              : 'Re-upload this PDF (max ~2.5 MB) from Edit student, then View again.',
                          )
                        }
                      }}
                    >
                      View
                    </Btn>
                    <Btn
                      variant="secondary"
                      size="sm"
                      icon="download"
                      onClick={() => {
                        if (!downloadStoredDoc(d)) {
                          toast.info('Download unavailable', 'Re-upload this file from Edit student (PDF under ~2.5 MB).')
                        }
                      }}
                    >
                      Download
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'timeline' && (
        <Card>
          <CardHead
            title="Activity timeline"
            sub={timelineLoading ? 'Loading activity…' : `${timeline.length} event${timeline.length === 1 ? '' : 's'} · payments, invoices & attendance`}
            icon="clock"
          />
          {timelineLoading ? (
            <div className="t-sm muted" style={{ padding: '16px 0' }}>Loading activity…</div>
          ) : timeline.length === 0 ? (
            <Empty
              icon="clock"
              title="No activity yet"
              body="Fee payments, invoices, and attendance marks for this student will appear here as they happen."
            />
          ) : (
            <div className="col" style={{ marginTop: 8 }}>
              {timeline.map((t, i) => (
                <div key={t.id} className="row gap12" style={{ paddingBottom: 16 }}>
                  <div className="col ai-center" style={{ width: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 99, background: t.tone, marginTop: 4, flex: '0 0 auto' }} />
                    {i < timeline.length - 1 && <span style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="row ai-center jc-between">
                      <span className="fw6">{t.title}</span>
                      <span className="t-xs muted">{t.date}</span>
                    </div>
                    <div className="t-sm muted">{t.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

/* ---------- export contract ---------- */
export const sisScreens: Record<string, ComponentType> = {
  'school.sis': StudentsScreen,
  'school.student': Student360,
}
