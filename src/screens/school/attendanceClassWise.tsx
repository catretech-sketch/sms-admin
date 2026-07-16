/* Class-wise student attendance — day/month filters, loads marks from API
   (same table the teacher app writes to). */
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/lib/hooks'
import {
  Card, CardHead, Btn, Badge, Avatar, Search, Segmented, Input,
  Icon, Empty, type BadgeTone,
} from '@/components/ui'
import { useClasses } from '@/api/hooks/useClasses'
import type { SchoolClass } from '@/api/classes'
import { useStudents } from '@/api/hooks/useStudents'
import { useClassAttendance, useSaveAttendance } from '@/api/hooks/useAttendance'
import { usePrincipalAttendance } from '@/api/hooks/usePrincipalAttendance'
import { studentPhotoUrl } from '@/api/studentExtras'
import { compareClassesAscending, gradeRank } from '@/lib/defaultClasses'
import type { AttendanceStatus } from '@/api/attendance'
import type { Student } from '@/types'

type AttStatus = AttendanceStatus

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
  const key = c.id || classLabel(c)
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 360
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
  const statusOf = (id: string): AttStatus => draft[id] ?? savedMap[id] ?? 'present'
  const fromServer = (attendanceQ.data?.length ?? 0) > 0
  const rosterPresent = roster.filter((s) => statusOf(s.id) !== 'absent').length
  /* Prefer live roster counts when the class is open so a just-saved mark is visible
     even if principal summary / StudentCount is stale or zero. */
  const useSummary = !open && summaryTotal != null && summaryTotal > 0
  const present = useSummary ? (summaryPresent ?? 0) : rosterPresent
  const total = useSummary
    ? summaryTotal!
    : Math.max(roster.length, summaryTotal && summaryTotal > 0 ? summaryTotal : 0)
  const pct = total ? Math.round((present / total) * 100) : (summaryPct ?? 0)

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
    const records = roster.map((s) => ({ studentId: s.id, status: statusOf(s.id) }))
    try {
      await saveAttendance.mutateAsync({ classId, date, records })
      toast.success('Attendance saved', `${classLabel(cls)} · ${rosterPresent}/${roster.length} present`)
      setDraft({})
    } catch (err) {
      toast.danger('Could not save', err instanceof Error ? err.message : 'Try again')
    }
  }

  const code = classCode(cls)
  const hue = classHue(cls)
  const accent = `hsl(${hue} 58% 42%)`
  const accentSoft = `hsl(${hue} 55% 94%)`

  return (
    <div className="sm-att-class" style={{ borderLeftColor: accent }}>
      <button type="button" className="sm-att-class-head" onClick={onToggle}>
        <div className="row ai-center gap12" style={{ minWidth: 0 }}>
          <span className="sm-att-class-code" style={{ background: accentSoft, color: accent, borderColor: accent }} title={classLabel(cls)}>
            {code}
          </span>
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div className="t-md fw6">{classLabel(cls)}</div>
            <div className="t-xs muted3">
              {present} of {total} present
              {cls.room && cls.room !== '—' ? ` · Room ${cls.room}` : ''}
              {fromServer && open ? ' · saved marks loaded' : ''}
            </div>
          </div>
        </div>
        <div className="row ai-center gap10">
          <div className="sm-meter" style={{ width: 72 }}>
            <span style={{ width: `${pct}%`, background: pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--danger)' }} />
          </div>
          <span className="t-sm fw6" style={{ minWidth: 40, textAlign: 'right' }}>{pct}%</span>
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
                        ? <Segmented value={st} onChange={(v) => setStatus(s.id, v as AttStatus)} options={STATUS_OPTS} />
                        : <Badge tone={STATUS_TONE[st]} dot>{STATUS_LABEL[st]}</Badge>}
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

export function ClassWiseStudents({ editable, leadership }: { editable: boolean; leadership: boolean }) {
  const { data: classes = [], isLoading: classesLoading } = useClasses()
  const { data: students = [], isLoading: studentsLoading } = useStudents()
  const [mode, setMode] = useState<'day' | 'month'>('day')
  const [date, setDate] = useState(todayIso)
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))
  const [q, setQ] = useState('')
  const [openClassId, setOpenClassId] = useState<string | null>(null)

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
    const m = new Map<string, { present: number; total: number; pct: number }>()
    for (const row of principalQ.data?.classes ?? []) {
      m.set(row.classId, { present: row.present, total: row.total, pct: Number(row.pct) || 0 })
    }
    return m
  }, [principalQ.data])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = !term
      ? liveClasses
      : liveClasses.filter((c) => classLabel(c).toLowerCase().includes(term) || classCode(c).toLowerCase().includes(term))
    return list
  }, [liveClasses, q])

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
          <div className="sm-att-hero-kpis">
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
      ) : filtered.length === 0 ? (
        <div style={{ padding: 8 }}><Empty icon="grid" title="No classes" body="Add classes in Academics first." /></div>
      ) : (
        <div className="sm-att-class-list">
          {filtered.map((c) => {
            const sum = summaryById.get(c.id!)
            return (
              <ClassPanel
                key={c.id}
                cls={c}
                date={date}
                students={students}
                editable={editable}
                open={openClassId === c.id}
                onToggle={() => setOpenClassId((id) => (id === c.id ? null : c.id!))}
                summaryPresent={sum?.present}
                summaryTotal={sum?.total}
                summaryPct={sum?.pct}
              />
            )
          })}
        </div>
      )}
    </Card>
  )
}
