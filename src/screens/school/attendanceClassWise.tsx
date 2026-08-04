/* Class-wise student attendance — day/month filters, loads marks from API
   (same table the teacher app writes to). */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import {
  Card, CardHead, Btn, Modal, Badge, Avatar, Search, Segmented, Select, Input,
  Icon, Empty, type BadgeTone,
} from '@/components/ui'
import { Donut, Bars, LineChart } from '@/components/charts/Charts'
import { useClasses } from '@/api/hooks/useClasses'
import type { SchoolClass } from '@/api/classes'
import { useStudents } from '@/api/hooks/useStudents'
import { useTeachers } from '@/api/hooks/useTeachers'
import { useStaff } from '@/api/hooks/useStaff'
import { useClassAttendance, useSaveAttendance } from '@/api/hooks/useAttendance'
import { usePrincipalAttendance } from '@/api/hooks/usePrincipalAttendance'
import { studentPhotoUrl } from '@/api/studentExtras'
import { compareClassesAscending, gradeRank } from '@/lib/defaultClasses'
import { listAllLocalAttendance, toAttendanceDate, type AttendanceStatus, type AttendanceRecord } from '@/api/attendance'
import { listAllLocalPeopleAttendance } from '@/api/peopleAttendance'
import {
  flagAbsenceStreaks, loadAlertConfig, saveAlertConfig,
  dueForAutoSend, getLastAutoSent, markAutoSent,
} from '@/lib/attendanceAlerts'
import { notifyAbsence, pickGuardianContacts, pickPeopleContacts, type AbsenceAudience } from '@/lib/attendanceNotify'
import { fetchAlertConfig, putAlertConfig } from '@/api/attendanceAlertConfig'
import {
  dailyTrend, weeklyTrend, monthlyTrend, quarterlyTrend, trendComposition,
  type TrendMode, type TrendPoint, type Composition,
} from '@/lib/attendanceTrend'
import type { Student } from '@/types'

type AttStatus = AttendanceStatus

/** Present/absent tallied from locally-saved marks for one class on a given day. */
export interface LocalCount { present: number; absent: number; total: number }

/** Fired after a class's attendance is saved so overview counts refresh at once. */
const ATTENDANCE_SAVED_EVENT = 'sms-attendance-saved'

const STATUS_TONE: Record<AttStatus, BadgeTone> = { present: 'success', late: 'warning', absent: 'danger' }
const STATUS_LABEL: Record<AttStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent' }
const STATUS_OPTS = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
]

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function classLabel(c: SchoolClass): string {
  return (c.name || `${c.grade}-${c.section}`).trim() || '—'
}

/** Short class code e.g. 10-A / N-A for colour chip on attendance. */
function classCode(c: SchoolClass): string {
  const grade = (c.grade || '').trim()
  const section = (c.section || '').trim()
  if (grade && section) {
    const g = grade.length > 4 ? grade.slice(0, 3) : grade
    return `${g}-${section}`.toUpperCase()
  }
  const name = classLabel(c)
  return name.length > 8 ? name.slice(0, 8).toUpperCase() : name.toUpperCase()
}

/** Stable hue from class id/name so each class keeps its colour code. */
function classHue(c: SchoolClass): number {
  return hashHue(c.id || classLabel(c))
}

/** Stable hue from an arbitrary key (0–359). */
function hashHue(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 360
}

/** Short grade badge, e.g. Nursery → NUR, IV → IV. */
function gradeCode(grade: string): string {
  const g = grade.trim()
  if (!g) return '—'
  return (g.length > 4 ? g.slice(0, 3) : g).toUpperCase()
}

function studentMatchesClass(s: Student, c: SchoolClass): boolean {
  const label = classLabel(c)
  const code = classCode(c)
  const cls = (s.cls || '').trim()
  if (cls && label && cls.toLowerCase() === label.toLowerCase()) return true
  if (cls && code && cls.toLowerCase() === code.toLowerCase()) return true
  if (s.grade && c.grade && s.section && c.section) {
    const sameGrade = gradeRank(s.grade) === gradeRank(c.grade)
    const sameSec = s.section.trim().toLowerCase() === c.section.trim().toLowerCase()
    if (sameGrade && sameSec) return true
  }
  return false
}

function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return []
  const count = new Date(y, m, 0).getDate()
  return Array.from({ length: count }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return `${month}-${day}`
  })
}

function ClassPanel({
  cls,
  date,
  students,
  editable,
  open,
  onToggle,
  summaryPresent,
  summaryTotal,
  summaryPct,
  summaryMarked,
  localCount,
}: {
  cls: SchoolClass
  date: string
  students: Student[]
  editable: boolean
  open: boolean
  onToggle: () => void
  summaryPresent?: number
  summaryTotal?: number
  summaryPct?: number
  summaryMarked?: number
  localCount?: LocalCount
}) {
  const toast = useToast()
  const classId = cls.id!
  const attendanceQ = useClassAttendance(open ? classId : null, date)
  const saveAttendance = useSaveAttendance()
  const [draft, setDraft] = useState<Record<string, AttStatus>>({})

  const savedMap = useMemo(() => {
    const m: Record<string, AttStatus> = {}
    for (const r of attendanceQ.data ?? []) {
      if (r.studentId && r.status) m[r.studentId] = r.status
    }
    return m
  }, [attendanceQ.data])

  useEffect(() => { setDraft({}) }, [classId, date, attendanceQ.dataUpdatedAt])

  const roster = useMemo(
    () => students
      .filter((s) => studentMatchesClass(s, cls))
      .slice()
      .sort((a, b) => (a.roll ?? 0) - (b.roll ?? 0) || a.name.localeCompare(b.name)),
    [students, cls],
  )
  /** `null` means nobody — CRM, teacher app, or geo-fence — has marked this student yet. */
  const statusOf = (id: string): AttStatus | null => draft[id] ?? savedMap[id] ?? null
  const fromServer = (attendanceQ.data?.length ?? 0) > 0
  const rosterPresent = roster.filter((s) => statusOf(s.id) === 'present' || statusOf(s.id) === 'late').length
  const hasDraft = Object.keys(draft).length > 0

  /* Resolve present/total + whether this class is actually marked for the day.
     Priority: live edits while open → local saved marks → principal summary.
     When nothing is recorded we show a neutral "Not marked" state instead of a
     misleading 100%-present or all-absent number. */
  let present: number
  let total: number
  let marked: boolean
  if (open) {
    total = Math.max(roster.length, summaryTotal && summaryTotal > 0 ? summaryTotal : 0)
    present = rosterPresent
    marked = fromServer || (summaryMarked ?? 0) > 0 || hasDraft
  } else if ((summaryMarked ?? 0) > 0 || (summaryPresent != null && summaryPresent > 0) || (summaryTotal != null && summaryTotal > 0)) {
    total = Math.max(roster.length, summaryTotal ?? 0)
    present = summaryPresent ?? 0
    marked = true
  } else if (localCount != null && localCount.total > 0) {
    total = Math.max(roster.length, localCount.total)
    present = localCount.present
    marked = true
  } else {
    total = roster.length
    present = 0
    marked = false
  }
  const absent = marked ? Math.max(0, total - present) : 0
  const pct = marked && total ? Math.round((present / total) * 100) : (marked ? (summaryPct ?? 0) : 0)

  const setStatus = (id: string, st: AttStatus) => setDraft((d) => ({ ...d, [id]: st }))
  const markAllPresent = () =>
    setDraft((d) => ({ ...d, ...Object.fromEntries(roster.map((s) => [s.id, 'present' as AttStatus])) }))
  const markAllAbsent = () =>
    setDraft((d) => ({ ...d, ...Object.fromEntries(roster.map((s) => [s.id, 'absent' as AttStatus])) }))

  const submit = async () => {
    if (!roster.length) {
      toast.danger('No students', 'No students matched this class. Check grade/section on the student.')
      return
    }
    const records = roster
      .filter((s) => draft[s.id] !== undefined || savedMap[s.id] !== undefined)
      .map((s) => ({ studentId: s.id, status: statusOf(s.id) as AttStatus }))
    if (!records.length) {
      toast.danger('Nothing to save', 'Mark at least one student before submitting.')
      return
    }
    try {
      await saveAttendance.mutateAsync({ classId, date, records })
      toast.success('Attendance saved', `${classLabel(cls)} · ${rosterPresent}/${roster.length} present`)
      setDraft({})
      window.dispatchEvent(new Event(ATTENDANCE_SAVED_EVENT))
    } catch (err) {
      toast.danger('Could not save', err instanceof Error ? err.message : 'Try again')
    }
  }

  const code = classCode(cls)
  const hue = classHue(cls)
  const accent = `hsl(${hue} 58% 42%)`
  const pctColor = pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div className="sm-att-class" style={{ borderLeftColor: accent }}>
      <button type="button" className="sm-att-class-head" onClick={onToggle}>
        <div className="row ai-center gap12" style={{ minWidth: 0 }}>
          <span
            className="sm-att-class-code"
            style={{ background: accent, color: '#fff', borderColor: 'transparent', boxShadow: `0 2px 8px -2px ${accent}` }}
            title={classLabel(cls)}
          >
            {code}
          </span>
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div className="row ai-center gap8 wrap">
              <span className="t-md fw7">{classLabel(cls)}</span>
              {cls.room && cls.room !== '—' ? <span className="t-xs muted3">Room {cls.room}</span> : null}
              {marked
                ? <Badge tone="success" dot>Marked</Badge>
                : <Badge tone="neutral" dot>Not marked</Badge>}
            </div>
            <div className="row ai-center gap6 wrap" style={{ marginTop: 5 }}>
              {marked ? (
                <>
                  <span className="sm-att-chip" style={{ color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 35%, transparent)', background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
                    <Icon name="check" size={12} /> {present} present
                  </span>
                  <span
                    className="sm-att-chip"
                    style={absent > 0
                      ? { color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }
                      : { color: 'var(--text-3)' }}
                  >
                    <Icon name="x" size={12} /> {absent} absent
                  </span>
                </>
              ) : (
                <span className="sm-att-chip" style={{ color: 'var(--text-3)' }}>Attendance not taken</span>
              )}
              <span className="sm-att-chip" style={{ color: 'var(--text-2)' }}>
                <Icon name="users" size={12} /> {total} roll
              </span>
            </div>
          </div>
        </div>
        <div className="row ai-center gap12">
          {marked ? (
            <Donut
              size={48}
              thickness={7}
              segments={[
                { value: present, color: pctColor },
                { value: absent, color: 'color-mix(in srgb, var(--danger) 22%, var(--surface-2))' },
              ]}
              center={<span className="t-xs fw7" style={{ color: pctColor }}>{pct}%</span>}
            />
          ) : (
            <Donut
              size={48}
              thickness={7}
              segments={[{ value: 1, color: 'var(--surface-3)' }]}
              center={<span className="t-sm fw7" style={{ color: 'var(--text-3)' }}>—</span>}
            />
          )}
          <Icon name="chevDown" size={16} style={{ color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
        </div>
      </button>

      {open && (
        <div className="sm-att-class-body">
          {attendanceQ.isLoading ? (
            <div className="t-sm muted" style={{ padding: '12px 16px' }}>Loading marks…</div>
          ) : roster.length === 0 ? (
            <div style={{ padding: 8 }}><Empty icon="users" title="No students" body="No students enrolled in this class." /></div>
          ) : (
            <>
              <div className="row ai-center jc-between gap12 wrap" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <div className="row ai-center gap8 wrap">
                  {fromServer
                    ? <Badge tone="success" icon="check">Saved on server</Badge>
                    : <Badge tone="neutral">Not saved yet</Badge>}
                  <span className="t-xs muted3">{date}</span>
                </div>
                {editable && (
                  <div className="row ai-center gap8">
                    <Btn size="sm" variant="secondary" icon="check" onClick={markAllPresent}>All present</Btn>
                    <Btn size="sm" variant="ghost" onClick={markAllAbsent}>All absent</Btn>
                  </div>
                )}
              </div>
              <div className="col">
                {roster.map((s) => {
                  const st = statusOf(s.id)
                  const photo = studentPhotoUrl(s.id)
                  return (
                    <div key={s.id} className="sm-att-row">
                      <div className="row ai-center gap12" style={{ minWidth: 0 }}>
                        <Avatar name={s.name} hue={s.avatarHue} size={48} src={photo} />
                        <div style={{ minWidth: 0 }}>
                          <div className="t-md fw6">{s.name}</div>
                          <div className="t-xs muted3">Roll {s.roll} · {s.cls || classLabel(cls)}</div>
                        </div>
                      </div>
                      {editable
                        ? <Segmented value={st ?? ''} onChange={(v) => setStatus(s.id, v as AttStatus)} options={STATUS_OPTS} />
                        : st
                          ? <Badge tone={STATUS_TONE[st]} dot>{STATUS_LABEL[st]}</Badge>
                          : <Badge tone="neutral">Not marked</Badge>}
                    </div>
                  )
                })}
              </div>
              {editable && (
                <div className="row ai-center jc-end" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                  <Btn variant="primary" icon="check" disabled={saveAttendance.isPending || !roster.length} onClick={() => { void submit() }}>
                    {saveAttendance.isPending ? 'Saving…' : 'Submit class'}
                  </Btn>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

type ClassSummary = { present: number; total: number; pct: number; marked?: number }

/** Present/total + whether the section is actually marked for the day.
    Priority: principal summary (server / teacher app) → local saved marks → unmarked. */
function sectionCounts(
  cls: SchoolClass,
  summaryById: Map<string, ClassSummary>,
  students: Student[],
  localByClass: Map<string, LocalCount>,
): { present: number; total: number; marked: boolean } {
  const rosterSize = students.filter((s) => studentMatchesClass(s, cls)).length
  const classKey = cls.id?.toLowerCase() ?? ''
  const sum = summaryById.get(classKey)
  if (sum && (sum.marked ?? 0) > 0) {
    return { present: sum.present, total: Math.max(rosterSize, sum.total), marked: true }
  }
  const local = localByClass.get(cls.id!)
  if (local && local.total > 0) {
    return { present: local.present, total: Math.max(rosterSize, local.total), marked: true }
  }
  return { present: 0, total: rosterSize, marked: false }
}

/* ============================================================
   Grade group — shows a grade first; expands to its sections (A/B/C).
   ============================================================ */
function GradeGroup({
  grade, sections, date, students, editable, summaryById, localByClass, open, onToggle, openClassId, onToggleClass,
}: {
  grade: string
  sections: SchoolClass[]
  date: string
  students: Student[]
  editable: boolean
  summaryById: Map<string, ClassSummary>
  localByClass: Map<string, LocalCount>
  open: boolean
  onToggle: () => void
  openClassId: string | null
  onToggleClass: (id: string) => void
}) {
  const agg = useMemo(() => {
    let present = 0
    let roll = 0
    let markedRoll = 0
    let markedSections = 0
    for (const c of sections) {
      const { present: p, total, marked } = sectionCounts(c, summaryById, students, localByClass)
      roll += total
      if (marked) {
        present += p
        markedRoll += total
        markedSections += 1
      }
    }
    return { present, roll, markedRoll, markedSections }
  }, [sections, summaryById, students, localByClass])

  const anyMarked = agg.markedSections > 0
  const absent = Math.max(0, agg.markedRoll - agg.present)
  const pct = agg.markedRoll ? Math.round((agg.present / agg.markedRoll) * 100) : 0
  const pctColor = pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--danger)'
  const hue = hashHue(grade)
  const accent = `hsl(${hue} 58% 42%)`
  const code = gradeCode(grade)

  return (
    <div className="sm-att-class" style={{ borderLeftColor: accent }}>
      <button type="button" className="sm-att-class-head" onClick={onToggle}>
        <div className="row ai-center gap12" style={{ minWidth: 0 }}>
          <span
            className="sm-att-class-code"
            style={{ background: accent, color: '#fff', borderColor: 'transparent', boxShadow: `0 2px 8px -2px ${accent}` }}
            title={grade}
          >
            {code}
          </span>
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div className="row ai-center gap8 wrap">
              <span className="t-md fw7">{grade}</span>
              <span className="t-xs muted3">{sections.length} section{sections.length === 1 ? '' : 's'}</span>
              {agg.markedSections === 0
                ? <Badge tone="neutral" dot>Not marked</Badge>
                : agg.markedSections < sections.length
                  ? <Badge tone="warning" dot>{agg.markedSections}/{sections.length} marked</Badge>
                  : <Badge tone="success" dot>Marked</Badge>}
            </div>
            <div className="row ai-center gap6 wrap" style={{ marginTop: 5 }}>
              {anyMarked ? (
                <>
                  <span className="sm-att-chip" style={{ color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 35%, transparent)', background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
                    <Icon name="check" size={12} /> {agg.present} present
                  </span>
                  <span
                    className="sm-att-chip"
                    style={absent > 0
                      ? { color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }
                      : { color: 'var(--text-3)' }}
                  >
                    <Icon name="x" size={12} /> {absent} absent
                  </span>
                </>
              ) : (
                <span className="sm-att-chip" style={{ color: 'var(--text-3)' }}>Attendance not taken</span>
              )}
              <span className="sm-att-chip" style={{ color: 'var(--text-2)' }}>
                <Icon name="users" size={12} /> {agg.roll} roll
              </span>
            </div>
          </div>
        </div>
        <div className="row ai-center gap12">
          {anyMarked ? (
            <Donut
              size={48}
              thickness={7}
              segments={[
                { value: agg.present, color: pctColor },
                { value: absent, color: 'color-mix(in srgb, var(--danger) 22%, var(--surface-2))' },
              ]}
              center={<span className="t-xs fw7" style={{ color: pctColor }}>{pct}%</span>}
            />
          ) : (
            <Donut
              size={48}
              thickness={7}
              segments={[{ value: 1, color: 'var(--surface-3)' }]}
              center={<span className="t-sm fw7" style={{ color: 'var(--text-3)' }}>—</span>}
            />
          )}
          <Icon name="chevDown" size={16} style={{ color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
        </div>
      </button>

      {open && (
        <div className="sm-att-class-body">
          <div className="sm-att-class-list" style={{ padding: 12, gap: 8 }}>
            {sections.map((c) => {
              const sum = summaryById.get(c.id!.toLowerCase())
              return (
                <ClassPanel
                  key={c.id}
                  cls={c}
                  date={date}
                  students={students}
                  editable={editable}
                  open={openClassId === c.id}
                  onToggle={() => onToggleClass(c.id!)}
                  summaryPresent={sum?.present}
                  summaryTotal={sum?.total}
                  summaryPct={sum?.pct}
                  summaryMarked={sum?.marked}
                  localCount={localByClass.get(c.id!)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   Attendance trend — day / week / month / quarter % from real marks.
   Scope: all classes, a grade, or a section · audience: students, teachers,
   staff, everyone · bars or line · optional A/B compare. Composition pie.
   ============================================================ */
const TREND_COUNT: Record<TrendMode, number> = { day: 14, week: 8, month: 6, quarter: 4 }
const TREND_SUB: Record<TrendMode, string> = {
  day: 'Last 14 days',
  week: 'Last 8 weeks',
  month: 'Last 6 months',
  quarter: 'Last 4 quarters',
}
type Audience = 'students' | 'teachers' | 'staff' | 'everyone'
const AUDIENCE_OPTS = [
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'staff', label: 'Staff' },
  { value: 'everyone', label: 'Everyone' },
]
const COMPARE_COLORS = ['var(--brand-600)', '#7c3aed']

function trendFor(records: AttendanceRecord[], mode: TrendMode, count: number): TrendPoint[] {
  if (mode === 'day') return dailyTrend(records, count)
  if (mode === 'week') return weeklyTrend(records, count)
  if (mode === 'month') return monthlyTrend(records, count)
  return quarterlyTrend(records, count)
}

function loadAudienceRecords(audience: Audience): AttendanceRecord[] {
  const parts: AttendanceRecord[] = []
  if (audience === 'students' || audience === 'everyone') parts.push(...listAllLocalAttendance())
  if (audience === 'teachers' || audience === 'everyone') parts.push(...listAllLocalPeopleAttendance('teachers'))
  if (audience === 'staff' || audience === 'everyone') parts.push(...listAllLocalPeopleAttendance('staff'))
  return parts
}

function allowedClassIds(classes: SchoolClass[], grade: string, section: string): Set<string> | null {
  if (grade === 'all') return null
  const secs = classes.filter((c) => (c.grade || classLabel(c)).trim() === grade)
  if (section === 'all') return new Set(secs.map((c) => c.id!))
  return new Set([section])
}

/** One scope's composition pie + legend. */
function TrendPie({ comp, title }: { comp: Composition; title?: string }) {
  const pctColor = comp.pct >= 90 ? 'var(--success)' : comp.pct >= 75 ? 'var(--warning)' : 'var(--danger)'
  const legend = [
    { label: 'Present', value: comp.present, color: 'var(--success)' },
    { label: 'Late', value: comp.late, color: 'var(--warning)' },
    { label: 'Absent', value: comp.absent, color: 'var(--danger)' },
  ]
  return (
    <div className="sm-att-trend-pie">
      <Donut
        size={132}
        thickness={20}
        gap={3}
        segments={[
          { value: comp.present, color: 'var(--success)' },
          { value: comp.late, color: 'var(--warning)' },
          { value: comp.absent, color: 'var(--danger)' },
        ]}
        center={
          <div style={{ textAlign: 'center', lineHeight: 1.05 }}>
            <div className="fw7" style={{ fontSize: 24, color: pctColor }}>{comp.pct}%</div>
            <div className="t-xs muted3">present</div>
          </div>
        }
      />
      <div className="col gap6" style={{ minWidth: 128 }}>
        {title && <div className="t-sm fw7" style={{ marginBottom: 2 }}>{title}</div>}
        {legend.map((l) => (
          <div key={l.label} className="row ai-center jc-between gap10">
            <span className="row ai-center gap6 t-sm">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: 'inline-block' }} />
              {l.label}
            </span>
            <span className="t-sm fw7">{l.value}</span>
          </div>
        ))}
        <div className="row ai-center jc-between gap10" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>
          <span className="t-sm muted">Total marks</span>
          <span className="t-sm fw7">{comp.total}</span>
        </div>
      </div>
    </div>
  )
}

/** Scope selector row (audience + grade + section). */
function ScopeControls({
  classes, audience, grade, section, onAudience, onGrade, onSection,
}: {
  classes: SchoolClass[]
  audience: Audience
  grade: string
  section: string
  onAudience: (v: Audience) => void
  onGrade: (v: string) => void
  onSection: (v: string) => void
}) {
  const gradeOptions = useMemo(() => {
    const seen = new Map<string, number>()
    for (const c of classes) {
      const g = (c.grade || classLabel(c)).trim()
      if (g) seen.set(g, gradeRank(g))
    }
    const grades = [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => g)
    return [{ value: 'all', label: 'All classes' }, ...grades.map((g) => ({ value: g, label: g }))]
  }, [classes])
  const sectionOptions = useMemo(() => {
    if (grade === 'all') return [{ value: 'all', label: 'All sections' }]
    const secs = classes.filter((c) => (c.grade || classLabel(c)).trim() === grade).slice().sort(compareClassesAscending)
    return [{ value: 'all', label: 'All sections' }, ...secs.map((c) => ({ value: c.id!, label: classLabel(c) }))]
  }, [classes, grade])
  const classScope = audience === 'students'
  return (
    <div className="row ai-center gap8 wrap">
      <Segmented value={audience} onChange={(v) => onAudience(v as Audience)} options={AUDIENCE_OPTS} />
      <Select options={gradeOptions} value={grade} onChange={(e) => onGrade(e.target.value)} disabled={!classScope} />
      <Select options={sectionOptions} value={section} onChange={(e) => onSection(e.target.value)} disabled={!classScope || grade === 'all'} />
    </div>
  )
}

function scopeText(audience: Audience, classes: SchoolClass[], grade: string, section: string): string {
  if (audience !== 'students') return audience.charAt(0).toUpperCase() + audience.slice(1)
  if (grade === 'all') return 'All classes'
  if (section === 'all') return `${grade} · all sections`
  const c = classes.find((x) => x.id === section)
  return c ? classLabel(c) : grade
}

function AttendanceTrendCard({ classes }: { classes: SchoolClass[] }) {
  const [mode, setMode] = useState<TrendMode>('week')
  const [chartType, setChartType] = useState<'bars' | 'line'>('bars')
  const [compare, setCompare] = useState(false)
  const [tick, setTick] = useState(0)
  // Scope A
  const [audA, setAudA] = useState<Audience>('students')
  const [gradeA, setGradeA] = useState('all')
  const [sectionA, setSectionA] = useState('all')
  // Scope B (compare)
  const [audB, setAudB] = useState<Audience>('students')
  const [gradeB, setGradeB] = useState('all')
  const [sectionB, setSectionB] = useState('all')

  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    window.addEventListener(ATTENDANCE_SAVED_EVENT, bump)
    window.addEventListener('focus', bump)
    return () => {
      window.removeEventListener(ATTENDANCE_SAVED_EVENT, bump)
      window.removeEventListener('focus', bump)
    }
  }, [])

  // Class scope only applies to students.
  useEffect(() => { if (audA !== 'students') { setGradeA('all'); setSectionA('all') } }, [audA])
  useEffect(() => { if (audB !== 'students') { setGradeB('all'); setSectionB('all') } }, [audB])

  const count = TREND_COUNT[mode]

  const recordsA = useMemo(() => {
    const base = loadAudienceRecords(audA)
    if (audA === 'students' && gradeA !== 'all') {
      const allowed = allowedClassIds(classes, gradeA, sectionA)
      if (allowed) return base.filter((r) => allowed.has(r.classId))
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audA, gradeA, sectionA, classes, tick])
  const recordsB = useMemo(() => {
    if (!compare) return []
    const base = loadAudienceRecords(audB)
    if (audB === 'students' && gradeB !== 'all') {
      const allowed = allowedClassIds(classes, gradeB, sectionB)
      if (allowed) return base.filter((r) => allowed.has(r.classId))
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, audB, gradeB, sectionB, classes, tick])

  const seriesA = useMemo(() => trendFor(recordsA, mode, count), [recordsA, mode, count])
  const seriesB = useMemo(() => trendFor(recordsB, mode, count), [recordsB, mode, count])
  const compA = useMemo(() => trendComposition(recordsA, mode, count), [recordsA, mode, count])
  const compB = useMemo(() => trendComposition(recordsB, mode, count), [recordsB, mode, count])

  const markedA = seriesA.filter((p) => !p.empty)
  const avgA = markedA.length ? Math.round(markedA.reduce((a, p) => a + p.value, 0) / markedA.length) : 0
  const hasData = markedA.length > 0 || (compare && seriesB.some((p) => !p.empty))

  const barData = seriesA.map((p) => ({
    value: p.value,
    label: p.label,
    empty: p.empty,
    color: p.value >= 90 ? 'var(--success)' : p.value >= 75 ? 'var(--warning)' : 'var(--danger)',
    valueLabel: p.empty ? '—' : `${p.value}%`,
  }))
  const chartLabels = seriesA.map((p) => p.label)
  const labelA = scopeText(audA, classes, gradeA, sectionA)
  const labelB = scopeText(audB, classes, gradeB, sectionB)
  const lineSeries = compare
    ? [
        { data: seriesA.map((p) => p.value), color: COMPARE_COLORS[0], label: labelA },
        { data: seriesB.map((p) => p.value), color: COMPARE_COLORS[1], label: labelB },
      ]
    : [{ data: seriesA.map((p) => p.value), color: COMPARE_COLORS[0], label: labelA }]

  return (
    <Card pad={false} style={{ marginBottom: 16 }}>
      <CardHead
        title="Attendance trend"
        sub={compare ? `${TREND_SUB[mode]} · ${labelA} vs ${labelB}` : `${TREND_SUB[mode]} · ${labelA}`}
        icon="trend"
        action={
          <div className="row ai-center gap8 wrap">
            {hasData && !compare && <Badge tone={avgA >= 90 ? 'success' : avgA >= 75 ? 'warning' : 'danger'} dot>Avg {avgA}%</Badge>}
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as TrendMode)}
              options={[
                { value: 'day', label: 'Daily' },
                { value: 'week', label: 'Weekly' },
                { value: 'month', label: 'Monthly' },
                { value: 'quarter', label: 'Quarterly' },
              ]}
            />
            <Segmented
              value={chartType}
              onChange={(v) => setChartType(v as 'bars' | 'line')}
              options={[{ value: 'bars', label: 'Bars' }, { value: 'line', label: 'Line' }]}
            />
            <Btn size="sm" variant={compare ? 'primary' : 'secondary'} icon="trend" onClick={() => setCompare((c) => !c)}>
              {compare ? 'Comparing' : 'Compare'}
            </Btn>
          </div>
        }
      />

      <div className="row ai-center gap12 wrap" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        {compare && <span className="t-xs fw7" style={{ color: COMPARE_COLORS[0] }}>A</span>}
        <ScopeControls
          classes={classes} audience={audA} grade={gradeA} section={sectionA}
          onAudience={setAudA} onGrade={setGradeA} onSection={setSectionA}
        />
        {compare && (
          <>
            <span className="t-xs fw7" style={{ color: COMPARE_COLORS[1] }}>B</span>
            <ScopeControls
              classes={classes} audience={audB} grade={gradeB} section={sectionB}
              onAudience={setAudB} onGrade={setGradeB} onSection={setSectionB}
            />
          </>
        )}
      </div>

      {hasData ? (
        compare ? (
          <div style={{ padding: 16 }}>
            <div className="row gap16 wrap" style={{ marginBottom: 12 }}>
              <TrendPie comp={compA} title={`A · ${labelA}`} />
              <TrendPie comp={compB} title={`B · ${labelB}`} />
            </div>
            <LineChart series={lineSeries} labels={chartLabels} yMax={100} yFmt={(v) => `${Math.round(v)}%`} h={200} />
            <div className="row ai-center gap16 wrap" style={{ marginTop: 8 }}>
              {lineSeries.map((s) => (
                <span key={s.label} className="row ai-center gap6 t-sm">
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="sm-att-trend-body">
            <TrendPie comp={compA} />
            <div className="sm-att-trend-bars">
              {chartType === 'bars'
                ? <Bars data={barData} h={170} />
                : <LineChart series={lineSeries} labels={chartLabels} yMax={100} yFmt={(v) => `${Math.round(v)}%`} h={190} />}
            </div>
          </div>
        )
      ) : (
        <div style={{ padding: 16 }}>
          <Empty icon="trend" title="No attendance yet" body="Mark attendance for a few days to see the trend and breakdown here." />
        </div>
      )}
    </Card>
  )
}

/* ============================================================
   Absence alerts — consecutive-absence streak warnings + parent notify.
   Threshold is configurable; escalates from in-app notice to email.
   ============================================================ */
interface FlaggedPerson {
  kind: AbsenceAudience
  id: string
  name: string
  subtitle: string
  avatarHue?: number
  photo?: string
  streak: number
  lastDate: string
}

const KIND_CHIP: Record<AbsenceAudience, { label: string; color: string }> = {
  students: { label: 'Student', color: 'var(--brand-600)' },
  teachers: { label: 'Teacher', color: '#7c3aed' },
  staff: { label: 'Staff', color: '#0d9488' },
}

function AbsenceAlertsPanel({
  students, editable, schoolName,
}: { students: Student[]; editable: boolean; schoolName: string }) {
  const toast = useToast()
  const teachers = useTeachers().data ?? []
  const staff = useStaff().data ?? []
  const [cfg, setCfg] = useState(loadAlertConfig)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState<null | 'app' | 'email'>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => ({
    noticeDays: cfg.noticeDays, emailDays: cfg.emailDays,
    autoSend: cfg.autoSend, autoTime: cfg.autoTime, autoChannel: cfg.autoChannel,
  }))
  const warnedRef = useRef(false)

  // Load the server-persisted config once (shared across devices/users); the
  // browser-local config stays as a cache/fallback when the endpoint is absent.
  useEffect(() => {
    let cancelled = false
    void fetchAlertConfig()
      .then((server) => {
        if (cancelled || !server) return
        const saved = saveAlertConfig(server)
        setCfg(saved)
        setDraft({
          noticeDays: saved.noticeDays, emailDays: saved.emailDays,
          autoSend: saved.autoSend, autoTime: saved.autoTime, autoChannel: saved.autoChannel,
        })
      })
      .catch(() => { /* offline / not shipped — keep local */ })
    return () => { cancelled = true }
  }, [])

  // Re-read local marks after a class is saved or the window refocuses.
  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    window.addEventListener(ATTENDANCE_SAVED_EVENT, bump)
    window.addEventListener('focus', bump)
    return () => {
      window.removeEventListener(ATTENDANCE_SAVED_EVENT, bump)
      window.removeEventListener('focus', bump)
    }
  }, [])

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers])
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])

  const dayNum = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }

  // Flagged people across all three groups, from real local marks.
  const alerts = useMemo<FlaggedPerson[]>(() => {
    const out: FlaggedPerson[] = []
    for (const a of flagAbsenceStreaks(listAllLocalAttendance(), cfg.noticeDays)) {
      const s = studentById.get(a.id)
      if (!s) continue
      out.push({
        kind: 'students', id: a.id, name: s.name, avatarHue: s.avatarHue, photo: studentPhotoUrl(s.id),
        subtitle: `${s.cls || '—'} · last absent ${dayNum(a.lastDate)}`, streak: a.streak, lastDate: a.lastDate,
      })
    }
    for (const a of flagAbsenceStreaks(listAllLocalPeopleAttendance('teachers'), cfg.noticeDays)) {
      const t = teacherById.get(a.id)
      if (!t) continue
      out.push({
        kind: 'teachers', id: a.id, name: t.name, avatarHue: t.avatarHue,
        subtitle: `${t.dept || t.desig || 'Teacher'} · last absent ${dayNum(a.lastDate)}`, streak: a.streak, lastDate: a.lastDate,
      })
    }
    for (const a of flagAbsenceStreaks(listAllLocalPeopleAttendance('staff'), cfg.noticeDays)) {
      const st = staffById.get(a.id)
      if (!st) continue
      out.push({
        kind: 'staff', id: a.id, name: st.name, avatarHue: st.avatarHue,
        subtitle: `${st.role || st.dept || 'Staff'} · last absent ${dayNum(a.lastDate)}`, streak: a.streak, lastDate: a.lastDate,
      })
    }
    return out.sort((x, y) => y.streak - x.streak || x.name.localeCompare(y.name))
    // tick forces a recompute after saves/focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.noticeDays, tick, studentById, teacherById, staffById])

  const emailable = useMemo(() => alerts.filter((a) => a.streak >= cfg.emailDays), [alerts, cfg.emailDays])

  // Warning "popup" — surface once when alerts first appear this session.
  useEffect(() => {
    if (alerts.length && !warnedRef.current) {
      warnedRef.current = true
      toast.danger(
        `${alerts.length} attendance alert${alerts.length === 1 ? '' : 's'}`,
        `${alerts.length} ${alerts.length === 1 ? 'person has' : 'people have'} been absent ${cfg.noticeDays}+ days in a row. Review and notify.`,
      )
    }
    if (!alerts.length) warnedRef.current = false
  }, [alerts.length, cfg.noticeDays, toast])

  const setDays = (which: 'noticeDays' | 'emailDays', raw: string) => {
    const v = Number(raw)
    if (!Number.isFinite(v)) return
    setDraft((d) => ({ ...d, [which]: v }))
  }

  const dirty = draft.noticeDays !== cfg.noticeDays
    || draft.emailDays !== cfg.emailDays
    || draft.autoSend !== cfg.autoSend
    || draft.autoTime !== cfg.autoTime
    || draft.autoChannel !== cfg.autoChannel

  const saveThresholds = () => {
    const saved = saveAlertConfig({ ...cfg, ...draft })
    setCfg(saved)
    setDraft({
      noticeDays: saved.noticeDays, emailDays: saved.emailDays,
      autoSend: saved.autoSend, autoTime: saved.autoTime, autoChannel: saved.autoChannel,
    })
    toast.success(
      'Alert settings saved',
      saved.autoSend
        ? `Auto-${saved.autoChannel === 'email' ? 'email' : 'notify'} daily at ${saved.autoTime}.`
        : `Warn after ${saved.noticeDays} · email after ${saved.emailDays} days.`,
    )
    // Persist to the server too (best-effort); stays local if the endpoint is absent.
    void putAlertConfig(saved)
      .then((server) => { if (server) setCfg(saveAlertConfig(server)) })
      .catch(() => { /* keep local copy */ })
  }

  const contactsFor = (kind: AbsenceAudience, ids: string[]) => {
    if (kind === 'students') return pickGuardianContacts(students, ids)
    if (kind === 'teachers') return pickPeopleContacts(teachers, ids)
    return pickPeopleContacts(staff, ids)
  }

  const send = async (mode: 'app' | 'email') => {
    const list = mode === 'email' ? emailable : alerts
    if (!list.length) {
      toast.danger('Nothing to send', mode === 'email'
        ? `No one has reached the ${cfg.emailDays}-day email threshold yet.`
        : 'No one is currently flagged.')
      return
    }
    setBusy(mode)
    try {
      const groups = new Map<AbsenceAudience, string[]>()
      for (const a of list) groups.set(a.kind, [...(groups.get(a.kind) ?? []), a.id])
      let people = 0, emails = 0
      const channels = mode === 'email' ? { app: true, email: true, sms: false } : { app: true, email: false, sms: false }
      for (const [kind, ids] of groups) {
        const res = await notifyAbsence(kind, ids, contactsFor(kind, ids), schoolName, channels, {
          days: mode === 'email' ? cfg.emailDays : cfg.noticeDays,
        })
        people += res.students
        emails += res.emails
      }
      toast.success(
        mode === 'email' ? 'Notifications emailed' : 'App notice sent',
        `${people} flagged · ${emails} email${emails === 1 ? '' : 's'} · students → parents, teachers/staff → self`,
      )
    } catch (err) {
      toast.danger('Could not send alert', err instanceof Error ? err.message : 'Try again')
    } finally {
      setBusy(null)
    }
  }

  // Human-readable schedule status (reflects the saved config, not the draft).
  const scheduleStatus = (() => {
    if (dirty) return 'Unsaved changes — click Save to apply.'
    if (!cfg.autoSend) return 'Off — send manually from the buttons below.'
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const lastAuto = getLastAutoSent()
    const [h, m] = cfg.autoTime.split(':').map(Number)
    const sched = new Date(now); sched.setHours(h, m, 0, 0)
    const when = lastAuto === today
      ? `tomorrow at ${cfg.autoTime}`
      : now < sched ? `today at ${cfg.autoTime}` : 'now (sends while the CRM is open)'
    return `Auto-${cfg.autoChannel === 'email' ? 'email' : 'notify'} · next ${when}${lastAuto ? ` · last sent ${lastAuto}` : ''}`
  })()

  // Scheduled auto-send: fire once per day at the configured time while a
  // leadership session is open. Refs avoid resubscribing the interval.
  const sendRef = useRef(send)
  sendRef.current = send
  const listRef = useRef({ alerts, emailable })
  listRef.current = { alerts, emailable }
  useEffect(() => {
    if (!editable) return
    const check = () => {
      const c = loadAlertConfig()
      if (!dueForAutoSend(c, new Date(), getLastAutoSent())) return
      markAutoSent() // dedupe today even if the list is empty
      const list = c.autoChannel === 'email' ? listRef.current.emailable : listRef.current.alerts
      if (list.length) void sendRef.current(c.autoChannel)
    }
    check()
    const id = window.setInterval(check, 60_000)
    return () => window.clearInterval(id)
  }, [editable])

  return (
    <>
      {/* Compact bell trigger — the full panel lives in a modal to keep the page clean. */}
      <button
        type="button"
        className="sm-att-alert-bell"
        onClick={() => setOpen(true)}
        aria-label="Open absence alerts"
        title="Absence alerts"
      >
        <span className="sm-att-alert-bell-ic">
          <Icon name="bell" size={16} />
          {alerts.length > 0 && <span className="sm-att-alert-bell-dot">{alerts.length}</span>}
        </span>
        <span className="t-sm fw6">Absence alerts</span>
        {alerts.length > 0
          ? <span className="t-xs" style={{ color: 'var(--danger)' }}>{alerts.length} flagged</span>
          : <span className="t-xs muted3">All clear</span>}
        {cfg.autoSend && (
          <span className="t-xs fw6 row ai-center gap4" style={{
            color: 'var(--brand-600)', background: 'color-mix(in srgb, var(--brand-600) 12%, transparent)',
            padding: '1px 8px', borderRadius: 999,
          }}>
            <Icon name="clock" size={11} /> {cfg.autoTime}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        icon="bell"
        title={<span className="row ai-center gap8">Absence alerts{alerts.length > 0 && <Badge tone="danger" dot>{alerts.length}</Badge>}</span>}
        sub={`Students, teachers & staff absent ${cfg.noticeDays}+ days in a row · email escalates at ${cfg.emailDays}+ days`}
        footer={editable && alerts.length > 0 ? (
          <div className="row ai-center jc-between gap12 wrap" style={{ width: '100%' }}>
            <span className="t-xs muted3">
              {emailable.length
                ? `${emailable.length} past the ${cfg.emailDays}-day email threshold.`
                : `No one past the ${cfg.emailDays}-day email threshold yet.`}
            </span>
            <div className="row ai-center gap8">
              <Btn size="sm" variant="secondary" icon="bell" disabled={busy != null} onClick={() => { void send('app') }}>
                {busy === 'app' ? 'Sending…' : 'Send app notice'}
              </Btn>
              <Btn size="sm" variant="primary" icon="inbox" disabled={busy != null || !emailable.length} onClick={() => { void send('email') }}>
                {busy === 'email' ? 'Emailing…' : 'Email / notify'}
              </Btn>
            </div>
          </div>
        ) : undefined}
      >
        <div className="row ai-center gap8 wrap" style={{ marginBottom: 12 }}>
          <label className="t-xs muted3 row ai-center gap6">
            Warn after
            <Input
              type="number" min={1} max={60} value={draft.noticeDays}
              onChange={(e) => setDays('noticeDays', e.target.value)}
              style={{ width: 64 }}
            />
            days
          </label>
          <label className="t-xs muted3 row ai-center gap6">
            Email after
            <Input
              type="number" min={1} max={60} value={draft.emailDays}
              onChange={(e) => setDays('emailDays', e.target.value)}
              style={{ width: 64 }}
            />
            days
          </label>
          <Btn size="sm" variant={dirty ? 'primary' : 'secondary'} icon="check" disabled={!dirty} onClick={saveThresholds}>
            Save
          </Btn>
        </div>

        <div
          className="row ai-center gap10 wrap"
          style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}
        >
          <label className="t-sm fw6 row ai-center gap8" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draft.autoSend}
              onChange={(e) => setDraft((d) => ({ ...d, autoSend: e.target.checked }))}
            />
            <Icon name="bell" size={14} /> Auto-send daily
          </label>
          <label className="t-xs muted3 row ai-center gap6">
            at
            <Input
              type="time"
              value={draft.autoTime}
              disabled={!draft.autoSend}
              onChange={(e) => setDraft((d) => ({ ...d, autoTime: e.target.value }))}
              style={{ width: 120 }}
            />
          </label>
          <Segmented
            value={draft.autoChannel}
            onChange={(v) => setDraft((d) => ({ ...d, autoChannel: v as 'app' | 'email' }))}
            options={[{ value: 'app', label: 'App notice' }, { value: 'email', label: 'Email' }]}
          />
          <span
            className="t-xs"
            style={{ flex: 1, minWidth: 160, color: dirty ? 'var(--warning)' : cfg.autoSend ? 'var(--brand-600)' : 'var(--text-3)' }}
          >
            {scheduleStatus}
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="row ai-center gap8" style={{ padding: '8px 0' }}>
            <Badge tone="success" icon="check">All clear</Badge>
            <span className="t-sm muted">No student, teacher or staff has {cfg.noticeDays}+ consecutive absences right now.</span>
          </div>
        ) : (
          <div className="col" style={{ margin: '0 -20px' }}>
            {alerts.map((a) => {
              const critical = a.streak >= cfg.emailDays
              const chip = KIND_CHIP[a.kind]
              return (
                <div
                  key={`${a.kind}-${a.id}`}
                  className="sm-att-row"
                  style={critical ? {
                    background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                    boxShadow: 'inset 3px 0 0 var(--danger)',
                  } : undefined}
                >
                  <div className="row ai-center gap12" style={{ minWidth: 0 }}>
                    <Avatar name={a.name} hue={a.avatarHue} size={44} src={a.photo} />
                    <div style={{ minWidth: 0 }}>
                      <div className="row ai-center gap6">
                        <span className="t-md fw6">{a.name}</span>
                        <span className="t-xs fw6" style={{
                          color: chip.color, background: `color-mix(in srgb, ${chip.color} 14%, transparent)`,
                          padding: '1px 7px', borderRadius: 999,
                        }}>{chip.label}</span>
                      </div>
                      <div className="t-xs muted3">{a.subtitle}</div>
                    </div>
                  </div>
                  <Badge tone={critical ? 'danger' : 'warning'} dot>
                    {a.streak} day{a.streak === 1 ? '' : 's'} absent
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </>
  )
}

export function ClassWiseStudents({ editable, leadership }: { editable: boolean; leadership: boolean }) {
  const app = useApp()
  const { data: classes = [], isLoading: classesLoading } = useClasses()
  const { data: students = [], isLoading: studentsLoading } = useStudents()
  const [mode, setMode] = useState<'day' | 'month'>('day')
  const [date, setDate] = useState(todayIso)
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))
  const [q, setQ] = useState('')
  const [openGradeId, setOpenGradeId] = useState<string | null>(null)
  const [openClassId, setOpenClassId] = useState<string | null>(null)
  const [localTick, setLocalTick] = useState(0)

  useEffect(() => {
    if (mode === 'month' && !date.startsWith(month)) {
      const days = daysInMonth(month)
      setDate(days.includes(todayIso()) && todayIso().startsWith(month) ? todayIso() : (days[0] ?? `${month}-01`))
    }
  }, [mode, month, date])

  const principalQ = usePrincipalAttendance(date, leadership)
  const liveClasses = useMemo(
    () => classes.filter((c) => c.id).slice().sort(compareClassesAscending),
    [classes],
  )

  const summaryById = useMemo(() => {
    const m = new Map<string, { present: number; total: number; pct: number; marked: number }>()
    for (const row of principalQ.data?.classes ?? []) {
      m.set(String(row.classId).toLowerCase(), {
        present: row.present,
        total: row.total,
        pct: Number(row.pct) || 0,
        marked: row.marked ?? 0,
      })
    }
    return m
  }, [principalQ.data])

  // Refresh locally-derived counts after a save or window refocus.
  useEffect(() => {
    const bump = () => setLocalTick((n) => n + 1)
    window.addEventListener(ATTENDANCE_SAVED_EVENT, bump)
    window.addEventListener('focus', bump)
    return () => {
      window.removeEventListener(ATTENDANCE_SAVED_EVENT, bump)
      window.removeEventListener('focus', bump)
    }
  }, [])

  /* Present/absent tallied from locally-saved marks for the selected day, keyed by
     class id — so the overview reflects real marks even when the summary API is 404. */
  const localByClass = useMemo(() => {
    const m = new Map<string, LocalCount>()
    for (const r of listAllLocalAttendance()) {
      if (toAttendanceDate(r.date) !== date) continue
      const cur = m.get(r.classId) ?? { present: 0, absent: 0, total: 0 }
      cur.total += 1
      if (r.status === 'absent') cur.absent += 1
      else cur.present += 1
      m.set(r.classId, cur)
    }
    return m
    // localTick forces recompute after a save/focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, localTick])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = !term
      ? liveClasses
      : liveClasses.filter((c) =>
        classLabel(c).toLowerCase().includes(term)
        || classCode(c).toLowerCase().includes(term)
        || (c.grade || '').toLowerCase().includes(term))
    return list
  }, [liveClasses, q])

  /* Group sections under their grade so we show grades first, then sections on click. */
  const gradeGroups = useMemo(() => {
    const map = new Map<string, SchoolClass[]>()
    for (const c of filtered) {
      const g = (c.grade || classLabel(c)).trim() || '—'
      const arr = map.get(g)
      if (arr) arr.push(c)
      else map.set(g, [c])
    }
    return [...map.entries()]
      .map(([grade, secs]) => ({ grade, sections: secs.slice().sort(compareClassesAscending) }))
      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.grade.localeCompare(b.grade))
  }, [filtered])

  /* While searching, auto-expand matching grades so results are visible. */
  const searching = q.trim().length > 0

  const overallPct = principalQ.data?.overallPct ?? 0
  const presentTotal = principalQ.data?.presentTotal ?? 0
  /* API StudentCount is often 0 — prefer live SIS roster for on-roll. */
  const apiRoll = principalQ.data?.studentTotal ?? 0
  const studentTotal = Math.max(apiRoll, students.length)
  const attendancePct = studentTotal > 0
    ? Math.round((presentTotal / studentTotal) * 100)
    : Math.round(Number(overallPct) || 0)
  const absentOrUnmarked = Math.max(0, studentTotal - presentTotal)
  const monthDays = mode === 'month' ? daysInMonth(month) : []

  return (
    <>
    {leadership && (
      <AbsenceAlertsPanel students={students} editable={editable} schoolName={app.school?.name || 'School'} />
    )}
    {leadership && <AttendanceTrendCard classes={liveClasses} />}
    <Card pad={false}>
      <CardHead
        title="Students · class-wise"
        sub={leadership
          ? 'Owner / Admin / Principal can mark present / absent for any class. Teacher app marks also show here.'
          : 'Open a class to mark or review attendance.'}
        icon="users"
        action={
          <div className="row ai-center gap8 wrap">
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as 'day' | 'month')}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'month', label: 'Month' },
              ]}
            />
            {mode === 'day' ? (
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} />
            ) : (
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{ width: 150 }}
              />
            )}
            <Search value={q} onChange={setQ} placeholder="Find class…" style={{ width: 160 }} />
          </div>
        }
      />

      {leadership && (
        <div className="sm-att-hero">
          <div className="row ai-center gap16 wrap">
            <Donut
              size={96}
              thickness={13}
              segments={[
                { value: presentTotal, color: 'var(--success)' },
                { value: absentOrUnmarked, color: 'var(--danger)' },
              ]}
              center={
                <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
                  <div className="fw7" style={{ fontSize: 18 }}>{attendancePct}%</div>
                  <div className="t-xs muted3">present</div>
                </div>
              }
            />
            <div className="sm-att-hero-kpis" style={{ flex: 1 }}>
              <div>
                <div className="sm-att-hero-val">{attendancePct}%</div>
                <div className="t-sm muted">Today’s attendance</div>
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
                <div className="t-lg fw7">{studentTotal}</div>
                <div className="t-xs muted3">On roll</div>
              </div>
            </div>
          </div>
          <div className="row ai-center gap8 wrap">
            <Badge tone="info" icon="phone">Teacher app synced</Badge>
            <span className="t-xs muted3">{date}</span>
          </div>
          <div className="sm-meter" style={{ width: '100%', height: 8, marginTop: 4 }}>
            <span style={{
              width: `${attendancePct}%`,
              background: 'var(--success)',
            }} />
          </div>
        </div>
      )}

      {mode === 'month' && (
        <div className="sm-att-days">
          {monthDays.map((d) => {
            const dayNum = Number(d.slice(-2))
            const on = d === date
            return (
              <button
                key={d}
                type="button"
                className={['sm-att-day', on && 'on'].filter(Boolean).join(' ')}
                onClick={() => setDate(d)}
              >
                {dayNum}
              </button>
            )
          })}
        </div>
      )}

      {classesLoading || studentsLoading ? (
        <div style={{ padding: 24 }}><span className="t-sm muted">Loading classes…</span></div>
      ) : gradeGroups.length === 0 ? (
        <div style={{ padding: 8 }}><Empty icon="grid" title="No classes" body="Add classes in Academics first." /></div>
      ) : (
        <div className="sm-att-class-list">
          {gradeGroups.map(({ grade, sections }) => (
            <GradeGroup
              key={grade}
              grade={grade}
              sections={sections}
              date={date}
              students={students}
              editable={editable}
              summaryById={summaryById}
              localByClass={localByClass}
              open={searching || openGradeId === grade}
              onToggle={() => setOpenGradeId((g) => (g === grade ? null : grade))}
              openClassId={openClassId}
              onToggleClass={(id) => setOpenClassId((cur) => (cur === id ? null : id))}
            />
          ))}
        </div>
      )}
    </Card>
    </>
  )
}
