/* ============================================================
   SchoolMate — Exams & grading
   Live exams · datesheet (API) · marks (API grades) · report cards
   Notify parents via Email · SMS · App (same path as announcements).
   ============================================================ */
import { useEffect, useMemo, useState, Fragment, type ComponentType } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp, useToast } from '@/lib/hooks'
import { useExams, useCreateExam, useUpdateExam } from '@/api/hooks/useExams'
import { useExamPapers } from '@/api/hooks/useExamPapers'
import { useGrades, useUpsertGrade, useExamMarksMap } from '@/api/hooks/useGrades'
import { useStudents } from '@/api/hooks/useStudents'
import { useTeachers } from '@/api/hooks/useTeachers'
import { useSubjectNames } from '@/api/hooks/useSubjects'
import { useClasses, useClassNames } from '@/api/hooks/useClasses'
import { loadExamAttendance, saveExamAttendance } from '@/api/examAttendance'
import { paperToSlot, slotToCreateInput, slotToUpdateInput, createExamPaper, updateExamPaper, deleteExamPaper } from '@/api/examPapers'
import { queryKeys } from '@/api/queryKeys'
import { subjectsForClass } from '@/api/classSubjects'
import { notifyExamAudience } from '@/lib/examNotify'
import { groupExamTimetable, printExamTimetable, autoBuildExamSlots, buildExamPeriodGrid, examSubjectStyle } from '@/lib/examTimetable'
import { can } from '@/lib/gating'
import { endTime, findClashes, markKey } from '@/lib/examData'
import { reportFor, classRank, gradeFor } from '@/lib/format'
import {
  compareClassesAscending,
  gradeRank,
  DEFAULT_GRADES,
  EXAM_CURRICULUM_TYPES,
  formatExamGradesLabel,
} from '@/lib/defaultClasses'
import type { ExamPaper } from '@/api/examPapers'
import {
  PageHead, Tabs, Card, CardHead, Btn, Badge, Select, Field, Input, Segmented,
  Modal, Drawer, Icon, Empty, Progress, Spinner, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui'
import type { Exam, Student, PaperSlot } from '@/types'
import type { SchoolClass } from '@/api/classes'

const statusTone: Record<Exam['status'], BadgeTone> = {
  scheduled: 'info', completed: 'success', marks_entry: 'warning', draft: 'neutral',
}
const statusLabel: Record<Exam['status'], string> = {
  scheduled: 'Scheduled', completed: 'Completed', marks_entry: 'Marks entry', draft: 'Draft',
}
const fmtDate = (iso: string): string =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'
const gradeTone = (g: string): BadgeTone =>
  g === 'A1' || g === 'A2' ? 'success' : g === 'B1' || g === 'B2' ? 'brand'
    : g === 'C1' || g === 'C2' ? 'info' : g === 'D' ? 'warning' : 'danger'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isTempId(id: string): boolean {
  return id.startsWith('new-')
}

function classLabel(c: SchoolClass): string {
  return (c.name || `${c.grade}-${c.section}`).trim()
}

/* ============================================================
   Channel toggles — Email · SMS · App
   ============================================================ */
function ChannelToggles({
  email, sms, app, onEmail, onSms, onApp,
}: {
  email: boolean; sms: boolean; app: boolean
  onEmail: (v: boolean) => void; onSms: (v: boolean) => void; onApp: (v: boolean) => void
}) {
  return (
    <div className="row gap8 wrap">
      <Btn size="sm" variant={email ? 'primary' : 'secondary'} icon="message" onClick={() => onEmail(!email)}>Email</Btn>
      <Btn size="sm" variant={sms ? 'primary' : 'secondary'} icon="phone" onClick={() => onSms(!sms)}>SMS</Btn>
      <Btn size="sm" variant={app ? 'primary' : 'secondary'} icon="bell" onClick={() => onApp(!app)}>App</Btn>
    </div>
  )
}

/* ============================================================
   Auto-generate exam timetable — time-period sessions
   ============================================================ */
interface ExamClassOpt {
  value: string
  label: string
  grade: string
}

interface ExamAutoModalProps {
  open: boolean
  onClose: () => void
  subjects: string[]
  /** Real classes only, Nursery→XII order. */
  classes: ExamClassOpt[]
  defaultStart: string
  /** When true (default), open with every class ticked. */
  selectAllOnOpen?: boolean
  onApply: (slots: PaperSlot[], replace: boolean) => void
}

function ExamAutoModal({
  open, onClose, subjects, classes, defaultStart, selectAllOnOpen = true, onApply,
}: ExamAutoModalProps) {
  const toast = useToast()
  const [startDate, setStartDate] = useState(defaultStart)
  const [sessionMode, setSessionMode] = useState<'one' | 'two'>('two')
  const [morning, setMorning] = useState('09:30')
  const [afternoon, setAfternoon] = useState('13:30')
  const [duration, setDuration] = useState(180)
  const [gapDays, setGapDays] = useState(0)
  const [skipSunday, setSkipSunday] = useState(true)
  const [skipSaturday, setSkipSaturday] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [room, setRoom] = useState('')
  const [replace, setReplace] = useState(true)

  /* Reset only when the modal opens (not on every classes refetch). */
  useEffect(() => {
    if (!open) return
    setStartDate(defaultStart)
    setSessionMode('two')
    setMorning('09:30'); setAfternoon('13:30')
    setDuration(180); setGapDays(0)
    setSkipSunday(true); setSkipSaturday(false)
    setSelected(selectAllOnOpen ? new Set(classes.map((c) => c.value)) : new Set())
    setRoom(''); setReplace(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* If classes load after open and nothing is selected yet, apply Select-all default. */
  useEffect(() => {
    if (!open || !selectAllOnOpen || !classes.length) return
    setSelected((prev) => (prev.size ? prev : new Set(classes.map((c) => c.value))))
  }, [open, selectAllOnOpen, classes])

  const sessions = sessionMode === 'two'
    ? [{ start: morning, label: 'Morning' }, { start: afternoon, label: 'Afternoon' }]
    : [{ start: morning, label: 'Session' }]

  const gradeGroups = useMemo(() => {
    const map = new Map<string, ExamClassOpt[]>()
    for (const c of classes) {
      const g = c.grade || c.label.split('-')[0] || 'Other'
      const list = map.get(g) ?? []
      list.push(c)
      map.set(g, list)
    }
    return [...map.entries()].sort((a, b) => gradeRank(a[0]) - gradeRank(b[0]))
  }, [classes])

  const allSelected = classes.length > 0 && selected.size === classes.length
  const toggleClass = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(classes.map((c) => c.value)))
  const toggleGrade = (grade: string) => {
    const ids = (gradeGroups.find(([g]) => g === grade)?.[1] ?? []).map((c) => c.value)
    setSelected((prev) => {
      const next = new Set(prev)
      const allOn = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  /* One timetable per selected class — never invent papers without a class. */
  const targets = useMemo(
    () => classes.filter((c) => selected.has(c.value)),
    [classes, selected],
  )

  /* Each class maps to its own subjects (Academics class→subject); fall back to the catalog. */
  const classSubjectsByValue = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of classes) m.set(c.value, subjectsForClass(c.value, c.label, subjects))
    return m
  }, [classes, subjects])

  const targetSubjects = useMemo(
    () => targets.map((c) => ({
      cls: c,
      subjects: classSubjectsByValue.get(c.value) ?? [],
    })),
    [targets, classSubjectsByValue],
  )

  const preview = useMemo(() => {
    if (!targetSubjects.length || !startDate) return []
    const common = { startDate, sessions, duration, gapDays, skipSunday, skipSaturday, room }
    return targetSubjects.flatMap(({ cls, subjects: classSubjects }) =>
      classSubjects.length
        ? autoBuildExamSlots({ ...common, subjects: classSubjects, classId: cls.value, className: cls.label })
        : [],
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSubjects, startDate, sessionMode, morning, afternoon, duration, gapDays, skipSunday, skipSaturday, room])

  const classCount = targets.length
  const subjectCounts = targetSubjects.map((t) => t.subjects.length)
  const minSubjects = subjectCounts.length ? Math.min(...subjectCounts) : 0
  const maxSubjects = subjectCounts.length ? Math.max(...subjectCounts) : 0
  const sameSubjectCount = minSubjects === maxSubjects
  const papersPerClassLabel = sameSubjectCount ? `${maxSubjects}` : `${minSubjects}–${maxSubjects}`
  const lastDate = preview.length ? preview.reduce((mx, s) => (s.date > mx ? s.date : mx), preview[0].date) : ''

  const apply = () => {
    if (!subjects.length) { toast.danger('No subjects', 'Add subjects in Academics first.'); return }
    if (!startDate) { toast.danger('Pick a start date', 'Choose when the exam begins.'); return }
    if (!classCount) { toast.danger('Pick classes', 'Select Nursery–XII classes for this exam.'); return }
    if (!morning.trim()) { toast.danger('Morning time', 'Set the morning exam start time.'); return }
    if (sessionMode === 'two') {
      if (!afternoon.trim()) { toast.danger('Afternoon time', 'Set the afternoon exam start time.'); return }
      const toMin = (t: string) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
        return m ? Number(m[1]) * 60 + Number(m[2]) : 0
      }
      if (toMin(afternoon) <= toMin(morning)) {
        toast.danger('Invalid times', 'Afternoon must start after the morning exam.'); return
      }
    }
    if (!preview.length) { toast.danger('Nothing generated', 'Check the start date and sessions.'); return }
    const now = Date.now()
    const slots: PaperSlot[] = preview.map((s, i) => ({
      id: `new-${now}-${i}`,
      classId: s.classId ?? null,
      className: s.className,
      subject: s.subject,
      date: s.date,
      start: s.start,
      duration: s.duration,
      room: s.room,
      inv1: '',
      inv2: '',
    }))
    onApply(slots, replace)
    toast.success(
      'Timetable generated',
      `${classCount} class${classCount > 1 ? 'es' : ''} · ${papersPerClassLabel} subject${maxSubjects > 1 ? 's' : ''} each · ${slots.length} papers — review, then Save.`,
    )
    onClose()
  }

  return (
    <Modal
      open={open} onClose={onClose} icon="sparkle" size="lg"
      title="Auto-generate exam timetable"
      sub="Pick 1 or 2 exams per day · no day gap by default (back-to-back exam days)"
      footer={
        <div className="row gap8 ai-center jc-between" style={{ width: '100%' }}>
          <span className="t-xs muted">
            {classCount
              ? `${classCount} × ${papersPerClassLabel} = ${preview.length} papers`
              : 'Select at least one class'}
          </span>
          <div className="row gap8">
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" icon="sparkle" disabled={!preview.length} onClick={apply}>
              Generate{preview.length ? ` (${preview.length})` : ''}
            </Btn>
          </div>
        </div>
      }
    >
      <div className="col gap16">
        <div className="sm-grid-2 gap16">
          <Field label="Start date" required>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Exams per day" hint="Same for every selected class">
            <Segmented
              value={sessionMode}
              onChange={(v) => setSessionMode(v as 'one' | 'two')}
              options={[
                { value: 'one', label: '1 exam / day' },
                { value: 'two', label: '2 exams / day' },
              ]}
            />
          </Field>
        </div>

        <Field
          label="Day gap between exam days"
          hint={gapDays === 0
            ? 'No day gap — papers continue the next working day'
            : gapDays === 1
              ? 'One free day between exam days'
              : 'Two free days between exam days'}
        >
          <Segmented
            value={String(gapDays)}
            onChange={(v) => setGapDays(Number(v))}
            options={[
              { value: '0', label: 'No day gap' },
              { value: '1', label: '1 day off' },
              { value: '2', label: '2 days off' },
            ]}
          />
        </Field>

        {classes.length > 0 ? (
          <Field label="Classes · Nursery → XII" required>
            <div className="col gap10">
              <div className="row ai-center jc-between wrap gap8">
                <span className="t-xs muted">
                  {selected.size
                    ? `${selected.size} of ${classes.length} selected · ${papersPerClassLabel} subject${maxSubjects === 1 ? '' : 's'} per class`
                    : 'Select all, a grade, or individual sections'}
                </span>
                <Btn size="sm" variant={allSelected ? 'primary' : 'secondary'} icon={allSelected ? 'check' : 'layers'} onClick={toggleAll}>
                  {allSelected ? 'Clear all' : 'Select all classes'}
                </Btn>
              </div>
              <div className="row gap6 wrap">
                {gradeGroups.map(([grade, rows]) => {
                  const on = rows.every((c) => selected.has(c.value))
                  return (
                    <Btn key={grade} size="sm" variant={on ? 'primary' : 'secondary'} onClick={() => toggleGrade(grade)}>
                      {grade}{rows.length > 1 ? ` (${rows.length})` : ''}
                    </Btn>
                  )
                })}
              </div>
              <div className="sm-exam-class-grid">
                {classes.map((c) => {
                  const n = classSubjectsByValue.get(c.value)?.length ?? 0
                  return (
                    <button
                      key={c.value}
                      type="button"
                      className={`sm-exam-class-chip${selected.has(c.value) ? ' on' : ''}`}
                      onClick={() => toggleClass(c.value)}
                      title={`${c.label} · ${n} subject${n === 1 ? '' : 's'}`}
                    >
                      {c.label}{n ? ` · ${n}` : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          </Field>
        ) : (
          <Empty icon="users" title="No classes yet" body="Add classes in Academics (Nursery–XII), then generate the exam timetable." />
        )}

        <div className="sm-grid-2 gap16">
          <Field label="Morning start" required={sessionMode === 'two'} hint={sessionMode === 'one' ? 'Only session today' : 'First exam of the day'}>
            <Input type="time" value={morning} onChange={(e) => setMorning(e.target.value)} />
          </Field>
          {sessionMode === 'two' ? (
            <Field label="Afternoon start" required hint="Second exam of the day (max 2)">
              <Input type="time" value={afternoon} onChange={(e) => setAfternoon(e.target.value)} />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Duration (min)">
            <Input type="number" min={1} value={String(duration)} onChange={(e) => setDuration(Math.max(1, Math.round(Number(e.target.value) || 0)))} />
          </Field>
          <Field label="Room / hall (optional)">
            <Input value={room} placeholder="e.g. Exam Hall" onChange={(e) => setRoom(e.target.value)} />
          </Field>
        </div>

        <div className="row gap8 wrap">
          <Btn size="sm" variant={skipSunday ? 'primary' : 'secondary'} onClick={() => setSkipSunday(!skipSunday)}>Skip Sundays</Btn>
          <Btn size="sm" variant={skipSaturday ? 'primary' : 'secondary'} onClick={() => setSkipSaturday(!skipSaturday)}>Skip Saturdays</Btn>
          <Btn size="sm" variant={replace ? 'primary' : 'secondary'} onClick={() => setReplace(!replace)}>
            {replace ? 'Replace existing papers' : 'Append to existing'}
          </Btn>
        </div>

        <div className="sm-exam-auto-preview">
          <div>
            <div className="t-xs muted3">Preview</div>
            <div className="t-sm fw6">
              {preview.length
                ? `${classCount} classes · ${papersPerClassLabel} subjects · ${sessionMode === 'two' ? `2/day (${morning} + ${afternoon})` : `1/day (${morning})`} · ${gapDays === 0 ? 'no day gap' : `${gapDays} day${gapDays > 1 ? 's' : ''} off`} · ${fmtDate(startDate)} → ${fmtDate(lastDate)}`
                : 'Pick classes to preview the timetable'}
            </div>
          </div>
          <Badge tone={preview.length ? 'success' : 'neutral'} soft>{preview.length} papers</Badge>
        </div>
      </div>
    </Modal>
  )
}

/* ============================================================
   Create exam
   ============================================================ */
const EXAM_TYPE_PRESETS = ['Term', 'Unit Test', 'Periodic', 'Board Prep', 'Custom'] as const
const GRADE_PRESETS: { label: string; grades: readonly string[] }[] = [
  { label: 'All Nursery–XII', grades: DEFAULT_GRADES },
  { label: 'Pre-primary', grades: ['Nursery', 'LKG', 'UKG'] },
  { label: 'I–V', grades: ['I', 'II', 'III', 'IV', 'V'] },
  { label: 'VI–VIII', grades: ['VI', 'VII', 'VIII'] },
  { label: 'IX–X', grades: ['IX', 'X'] },
  { label: 'XI–XII', grades: ['XI', 'XII'] },
]

function CreateExamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const createExam = useCreateExam()
  const subjectNames = useSubjectNames()
  const [name, setName] = useState('')
  const [typePreset, setTypePreset] = useState<string>('Term')
  const [customType, setCustomType] = useState('')
  const [curriculum, setCurriculum] = useState<string>('CBSE')
  const [grades, setGrades] = useState<Set<string>>(() => new Set(DEFAULT_GRADES))
  const [from, setFrom] = useState(todayIso())
  const [to, setTo] = useState(todayIso())

  useEffect(() => {
    if (!open) return
    setName('')
    setTypePreset('Term')
    setCustomType('')
    setCurriculum('CBSE')
    setGrades(new Set(DEFAULT_GRADES))
    setFrom(todayIso())
    setTo(todayIso())
  }, [open])

  const allGradesOn = grades.size === DEFAULT_GRADES.length
  const gradesLabel = formatExamGradesLabel(grades, curriculum)
  const resolvedType = typePreset === 'Custom' ? customType.trim() : typePreset

  const toggleGrade = (g: string) => {
    setGrades((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  const applyGradePreset = (preset: readonly string[]) => {
    setGrades(new Set(preset))
  }

  const toggleAllGrades = () => {
    setGrades(allGradesOn ? new Set() : new Set(DEFAULT_GRADES))
  }

  const submit = () => {
    if (!name.trim()) { toast.danger('Name required', 'Please enter an exam name.'); return }
    if (typePreset === 'Custom' && !customType.trim()) {
      toast.danger('Type required', 'Enter a custom exam type, or pick a preset.'); return
    }
    if (!grades.size) { toast.danger('Pick grades', 'Select at least one grade (Nursery–XII).'); return }
    if (to < from) { toast.danger('Invalid dates', 'End date cannot be before the start date.'); return }
    const exam: Exam = {
      id: '',
      name: name.trim(),
      type: resolvedType,
      grades: gradesLabel,
      from,
      to,
      subjects: Math.max(1, subjectNames.length),
      status: 'scheduled',
      marksEntered: 0,
      published: false,
    }
    createExam.mutate(exam, {
      onSuccess: () => {
        toast.success('Exam created', `${name} scheduled for ${gradesLabel}.`)
        onClose()
      },
      onError: (err) => toast.danger('Could not create exam', err instanceof Error ? err.message : 'Please try again.'),
    })
  }

  return (
    <Modal
      open={open} onClose={onClose} icon="clipboard" size="lg"
      title="Create exam / test" sub="Nursery → XII · pick grades and curriculum type"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={createExam.isPending} onClick={submit}>
            {createExam.isPending ? 'Creating…' : 'Create exam'}
          </Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Exam name" required>
          <Input icon="clipboard" value={name} placeholder="e.g. Term 2 Examination" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="sm-grid-2 gap16">
          <Field label="Exam type">
            <Select
              options={[...EXAM_TYPE_PRESETS]}
              value={typePreset}
              onChange={(e) => setTypePreset(e.target.value)}
            />
          </Field>
          <Field label="Curriculum type" hint="Board / scheme (CBSE, ICSE, State Board…)">
            <Select
              options={[...EXAM_CURRICULUM_TYPES]}
              value={curriculum}
              onChange={(e) => setCurriculum(e.target.value)}
            />
          </Field>
        </div>
        {typePreset === 'Custom' && (
          <Field label="Custom type" required>
            <Input value={customType} placeholder="e.g. Mid-term · Pre-board" onChange={(e) => setCustomType(e.target.value)} />
          </Field>
        )}
        <Field label="Grades · Nursery → XII" required>
          <div className="col gap10">
            <div className="row ai-center jc-between wrap gap8">
              <span className="t-xs muted">
                {grades.size
                  ? `${grades.size} of ${DEFAULT_GRADES.length} · ${gradesLabel}`
                  : 'Select grades for this exam'}
              </span>
              <Btn size="sm" variant={allGradesOn ? 'primary' : 'secondary'} icon={allGradesOn ? 'check' : 'layers'} onClick={toggleAllGrades}>
                {allGradesOn ? 'Clear all' : 'Select all Nursery–XII'}
              </Btn>
            </div>
            <div className="row wrap gap8">
              {GRADE_PRESETS.map((p) => (
                <Btn key={p.label} size="sm" variant="ghost" onClick={() => applyGradePreset(p.grades)}>
                  {p.label}
                </Btn>
              ))}
            </div>
            <div className="sm-exam-class-grid" role="group" aria-label="Select grades">
              {DEFAULT_GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`sm-exam-class-chip${grades.has(g) ? ' on' : ''}`}
                  aria-pressed={grades.has(g)}
                  onClick={() => toggleGrade(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </Field>
        <div className="sm-grid-2 gap16">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/* ============================================================
   Datesheet drawer — API papers + notify Email / SMS / App
   ============================================================ */
function DatesheetDrawer({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const toast = useToast()
  const app = useApp()
  const canPublish = can(app.role, 'exams', 'A')
  const canEdit = can(app.role, 'exams', 'E')
  const subjectNames = useSubjectNames()
  const classesQ = useClasses()
  const teachersQ = useTeachers()
  const qc = useQueryClient()
  const papersQ = useExamPapers(exam?.id ?? null)
  const updateExam = useUpdateExam()

  const [slots, setSlots] = useState<PaperSlot[]>([])
  const [email, setEmail] = useState(true)
  const [sms, setSms] = useState(true)
  const [appCh, setAppCh] = useState(true)
  const [busy, setBusy] = useState(false)
  const [savePct, setSavePct] = useState(0)
  const [saveLabel, setSaveLabel] = useState('')
  const [autoOpen, setAutoOpen] = useState(false)

  useEffect(() => {
    if (!exam) return
    if (papersQ.data) {
      setSlots(papersQ.data.map((p) => {
        const slot = paperToSlot(p)
        return { ...slot, className: classNameOf(slot.classId) }
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, papersQ.data, classesQ.data])

  const teacherNames = useMemo(
    () => (teachersQ.data ?? []).map((t) => t.name).filter(Boolean),
    [teachersQ.data],
  )
  const invigOptions = ['', ...teacherNames].map((t) => ({ value: t, label: t || '— Select —' }))
  const subjectOpts = subjectNames.length ? subjectNames : ['English', 'Mathematics', 'Science']
  const sortedClasses = useMemo(
    () => [...(classesQ.data ?? [])].filter((c) => c.id).sort(compareClassesAscending),
    [classesQ.data],
  )
  const classPickList = useMemo(
    () => sortedClasses.map((c) => ({
      value: c.id!,
      label: classLabel(c),
      grade: c.grade || classLabel(c).split('-')[0] || '',
    })),
    [sortedClasses],
  )
  const classOptions = [{ value: '', label: 'All classes' }, ...classPickList.map(({ value, label }) => ({ value, label }))]
  const classNameOf = (id?: string | null) =>
    id ? classOptions.find((c) => c.value === id)?.label ?? 'Selected class' : 'All classes'

  const setSlot = (id: string, patch: Partial<PaperSlot>) =>
    setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch, className: patch.classId !== undefined ? classNameOf(patch.classId) : s.className } : s)))
  const removePaper = (id: string) => setSlots((ss) => ss.filter((s) => s.id !== id))
  const addPaper = () =>
    setSlots((ss) => {
      const used = new Set(ss.map((s) => s.subject))
      const subj = subjectOpts.find((s) => !used.has(s)) ?? subjectOpts[0]
      const last = ss[ss.length - 1]
      return [...ss, {
        id: `new-${Date.now()}`,
        classId: last?.classId ?? (classOptions[1]?.value ?? null),
        className: last?.className ?? (classOptions[1]?.label ?? 'All classes'),
        subject: subj,
        date: last?.date ?? (exam?.from ?? todayIso()),
        start: '09:30',
        duration: 180,
        room: '',
        inv1: '',
        inv2: '',
      }]
    })

  const applyAuto = (generated: PaperSlot[], replace: boolean) => {
    setSlots((ss) => (replace ? generated : [...ss, ...generated]))
  }

  const clashes = useMemo(() => findClashes(slots), [slots])

  const persistSlots = async (): Promise<boolean> => {
    if (!exam || clashes.length) return false
    const existingIds = [...(papersQ.data ?? []).map((p) => p.id)]
    const keepIds = new Set(slots.filter((s) => !isTempId(s.id)).map((s) => s.id))
    const toDelete = existingIds.filter((id) => !keepIds.has(id))
    const total = toDelete.length + slots.length + 1 // +1 for exam patch
    let done = 0
    const tick = (label: string) => {
      done += 1
      setSaveLabel(label)
      setSavePct(Math.min(100, Math.round((100 * done) / Math.max(1, total))))
    }
    try {
      setSavePct(0)
      setSaveLabel('Preparing…')
      for (const id of toDelete) {
        await deleteExamPaper(id)
        tick(`Removing old papers… ${done}/${total}`)
      }
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        const n = i + 1
        if (isTempId(s.id)) {
          await createExamPaper(slotToCreateInput(exam.id, s))
          tick(`Saving papers… ${n}/${slots.length}`)
        } else {
          const current = (papersQ.data ?? []).find((p) => p.id === s.id)
          if ((current?.classId ?? null) !== (s.classId ?? null)) {
            await deleteExamPaper(s.id)
            await createExamPaper(slotToCreateInput(exam.id, s))
            tick(`Saving papers… ${n}/${slots.length}`)
          } else {
            await updateExamPaper(s.id, slotToUpdateInput(s))
            tick(`Updating papers… ${n}/${slots.length}`)
          }
        }
      }
      await updateExam.mutateAsync({
        id: exam.id,
        patch: { subjects: slots.length, status: 'scheduled' },
      })
      tick('Finishing…')
      await qc.invalidateQueries({ queryKey: queryKeys.exams.papers(exam.id) })
      await qc.invalidateQueries({ queryKey: queryKeys.exams.all })
      setSavePct(100)
      setSaveLabel('Done')
      return true
    } catch (err) {
      toast.danger('Could not save datesheet', err instanceof Error ? err.message : 'Please try again.')
      return false
    }
  }

  const save = async () => {
    if (!exam || clashes.length) return
    setBusy(true)
    const ok = await persistSlots()
    setBusy(false)
    setSavePct(0)
    setSaveLabel('')
    if (ok) toast.success('Datesheet saved', `${exam.name} · ${slots.length} papers`)
  }

  const publish = async () => {
    if (!exam || clashes.length) return
    if (!email && !sms && !appCh) {
      toast.danger('Pick a channel', 'Enable Email, SMS, and/or App.')
      return
    }
    setBusy(true)
    const ok = await persistSlots()
    if (!ok) {
      setBusy(false)
      setSavePct(0)
      setSaveLabel('')
      return
    }
    try {
      setSaveLabel('Notifying parents…')
      setSavePct(98)
      const res = await notifyExamAudience(
        exam, app.school.name, 'datesheet',
        { email, sms, app: appCh },
        'parents',
      )
      const bits = [
        email ? `${res.emails} email` : '',
        sms ? `${res.phones} SMS` : '',
        appCh ? 'app' : '',
      ].filter(Boolean)
      toast.success('Datesheet published', `${exam.name} → ${bits.join(' · ')}`)
      onClose()
    } catch (err) {
      toast.danger('Saved, but notify failed', err instanceof Error ? err.message : 'Try again from Publish.')
    } finally {
      setBusy(false)
      setSavePct(0)
      setSaveLabel('')
    }
  }

  return (
    <Drawer
      open={!!exam} onClose={onClose} width={680} icon="calendar"
      title="Datesheet" sub={exam ? `${exam.name} · ${exam.grades} · ${slots.length} papers` : ''}
      footer={
        <div className="col gap10" style={{ width: '100%' }}>
          <div className="row ai-center jc-between wrap gap8">
            <span className="t-xs muted">Notify on publish</span>
            <ChannelToggles email={email} sms={sms} app={appCh} onEmail={setEmail} onSms={setSms} onApp={setAppCh} />
          </div>
          <div className="row gap8 jc-between ai-center">
            <span className="t-xs muted">{clashes.length ? `${clashes.length} clash(es) to resolve` : 'No clashes'}</span>
            <div className="row gap8">
              <Btn variant="ghost" onClick={onClose} disabled={busy}>Close</Btn>
              {canEdit && (
                <Btn variant="secondary" icon="check" disabled={clashes.length > 0 || busy} onClick={() => void save()}>
                  {busy && savePct < 100 ? `Saving ${savePct}%` : 'Save'}
                </Btn>
              )}
              {canPublish && (
                <Btn variant="primary" icon="bell" disabled={clashes.length > 0 || busy} onClick={() => void publish()}>
                  {busy ? (savePct >= 98 ? 'Sending…' : `Saving ${savePct}%`) : 'Publish & notify'}
                </Btn>
              )}
            </div>
          </div>
          {busy && (
            <div className="col gap6" style={{ width: '100%' }}>
              <div className="row ai-center jc-between">
                <span className="t-xs muted">{saveLabel || 'Working…'}</span>
                <span className="t-xs fw6">{savePct}%</span>
              </div>
              <Progress value={savePct} color="var(--brand-600)" height={8} />
            </div>
          )}
        </div>
      }
    >
      {busy && (
        <div className="sm-exam-save-overlay" aria-live="polite">
          <div className="sm-exam-save-card">
            <Spinner size={22} />
            <div className="t-sm fw6" style={{ marginTop: 10 }}>{saveLabel || 'Saving datesheet…'}</div>
            <div className="t-xs muted" style={{ marginTop: 4 }}>{savePct}% complete</div>
            <div style={{ width: '100%', marginTop: 12 }}><Progress value={savePct} height={10} /></div>
          </div>
        </div>
      )}
      {papersQ.isLoading && <div className="t-sm muted" style={{ marginBottom: 12 }}>Loading papers…</div>}
      {clashes.length > 0 && (
        <div className="row ai-start gap8" style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 14, background: 'var(--danger-bg, rgba(220,38,38,.1))', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          <Icon name="alert" size={16} />
          <span className="t-sm fw6">{clashes.join(' · ')}</span>
        </div>
      )}

      <div className="row ai-center jc-between" style={{ marginBottom: 12 }}>
        <span className="t-sm muted">{slots.length} paper{slots.length === 1 ? '' : 's'}</span>
        {canEdit && (
          <div className="row gap8">
            <Btn variant="secondary" size="sm" icon="sparkle" disabled={busy} onClick={() => setAutoOpen(true)}>Auto-generate</Btn>
            <Btn variant="secondary" size="sm" icon="plus" disabled={busy} onClick={addPaper}>Add paper</Btn>
          </div>
        )}
      </div>

      {!slots.length && !papersQ.isLoading ? (
        <Empty
          icon="calendar"
          title="No papers yet"
          body="Auto-generate a timetable for Nursery–XII with time periods, or add papers manually."
          action={canEdit ? (
            <div className="row gap8 jc-center wrap">
              <Btn variant="primary" icon="sparkle" onClick={() => setAutoOpen(true)}>Auto-generate</Btn>
              <Btn variant="secondary" icon="plus" onClick={addPaper}>Add paper</Btn>
            </div>
          ) : undefined}
        />
      ) : (
        <div className="col gap12">
          {slots.map((s, i) => (
            <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div className="row ai-center jc-between" style={{ marginBottom: 10 }}>
                <div className="row ai-center gap10">
                  <span className="sm-card-ic"><Icon name="book" size={16} /></span>
                  <div>
                    <div className="fw6">{s.subject || '—'}</div>
                    <div className="t-xs muted">{s.className ?? classNameOf(s.classId)} · {s.date ? fmtDate(s.date) : '—'} · {s.start} – {endTime(s.start, s.duration)}</div>
                  </div>
                </div>
                <div className="row ai-center gap8">
                  <Badge tone="neutral">Paper {i + 1}</Badge>
                  {canEdit && <Btn variant="ghost" size="sm" onClick={() => removePaper(s.id)}>Remove</Btn>}
                </div>
              </div>
              <div className="sm-grid-3 gap12">
                <Field label="Subject">
                  <Select options={subjectOpts} value={s.subject} disabled={!canEdit} onChange={(e) => setSlot(s.id, { subject: e.target.value })} />
                </Field>
                <Field label="Class">
                  <Select
                    options={classOptions}
                    value={s.classId ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => setSlot(s.id, { classId: e.target.value || null })}
                  />
                </Field>
                <Field label="Date">
                  <Input type="date" value={s.date} disabled={!canEdit} onChange={(e) => setSlot(s.id, { date: e.target.value })} />
                </Field>
                <Field label="Start time">
                  <Input type="time" value={s.start} disabled={!canEdit} onChange={(e) => setSlot(s.id, { start: e.target.value })} />
                </Field>
                <Field label="Duration (min)">
                  <Input type="number" min={0} value={String(s.duration)} disabled={!canEdit} onChange={(e) => setSlot(s.id, { duration: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                </Field>
                <Field label="End time">
                  <Input value={endTime(s.start, s.duration)} disabled />
                </Field>
                <Field label="Room / hall">
                  <Input value={s.room} placeholder="e.g. Hall 1" disabled={!canEdit} onChange={(e) => setSlot(s.id, { room: e.target.value })} />
                </Field>
                <Field label="Invigilator 1">
                  <Select options={invigOptions} value={s.inv1} disabled={!canEdit} onChange={(e) => setSlot(s.id, { inv1: e.target.value })} />
                </Field>
                <Field label="Invigilator 2">
                  <Select options={invigOptions} value={s.inv2} disabled={!canEdit} onChange={(e) => setSlot(s.id, { inv2: e.target.value })} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}

      <ExamAutoModal
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        subjects={subjectOpts}
        classes={classPickList}
        defaultStart={slots[0]?.date || exam?.from || todayIso()}
        selectAllOnOpen
        onApply={applyAuto}
      />
    </Drawer>
  )
}

/* ============================================================
   Tab 1 — Exams list
   ============================================================ */
function ExamsListTab({ onDatesheet, onPublish }: { onDatesheet: (e: Exam) => void; onPublish: (e: Exam) => void }) {
  const app = useApp()
  const { data: examsData, isLoading } = useExams()
  const exams = examsData ?? []
  const [createOpen, setCreateOpen] = useState(false)
  const editable = can(app.role, 'exams', 'E') || can(app.role, 'exams', 'A')

  const columns: Column<Exam>[] = [
    {
      key: 'name', label: 'Exam', sortValue: (e) => e.name,
      render: (e) => (
        <div>
          <div className="fw6">{e.name}</div>
          <div className="t-xs muted">{e.grades}</div>
        </div>
      ),
    },
    { key: 'type', label: 'Type', sortValue: (e) => e.type, render: (e) => <Badge tone="brand">{e.type}</Badge> },
    {
      key: 'dates', label: 'Dates', sortValue: (e) => e.from,
      render: (e) => <span className="t-sm">{fmtDate(e.from)} – {fmtDate(e.to)}</span>,
    },
    { key: 'subjects', label: 'Papers', align: 'center', sortValue: (e) => e.subjects, render: (e) => <span className="fw6">{e.subjects}</span> },
    {
      key: 'marks', label: 'Marks entered', sortValue: (e) => e.marksEntered,
      render: (e) => (
        <div className="row ai-center gap8" style={{ minWidth: 130 }}>
          <div style={{ flex: 1 }}><Progress value={e.marksEntered} color={e.marksEntered >= 90 ? 'var(--success)' : e.marksEntered > 0 ? 'var(--warning)' : 'var(--border)'} /></div>
          <span className="t-sm fw6" style={{ width: 36 }}>{e.marksEntered}%</span>
        </div>
      ),
    },
    {
      key: 'status', label: 'Status', align: 'center', sortValue: (e) => e.status,
      render: (e) => <Badge tone={statusTone[e.status]} dot>{statusLabel[e.status]}</Badge>,
    },
    {
      key: 'published', label: 'Published', align: 'center', sortValue: (e) => (e.published ? 1 : 0),
      render: (e) => <Badge tone={e.published ? 'success' : 'neutral'}>{e.published ? 'Published' : 'Pending'}</Badge>,
    },
    {
      key: 'actions', label: '',
      render: (e) => (
        <div className="row gap8 jc-end" onClick={(ev) => ev.stopPropagation()}>
          <Btn variant="secondary" size="sm" icon="calendar" onClick={() => onDatesheet(e)}>Datesheet</Btn>
          <Btn variant={e.published ? 'ghost' : 'primary'} size="sm" icon="bell" onClick={() => onPublish(e)}>
            {e.published ? 'Notify again' : 'Publish'}
          </Btn>
        </div>
      ),
    },
  ]

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead title="Exam & test schedule" sub={isLoading ? 'Loading…' : `${exams.length} examinations`} icon="clipboard" />
        {editable
          ? <Btn variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>Create exam</Btn>
          : <Badge tone="neutral" icon="eye">View only</Badge>}
      </div>
      <DataTable<Exam>
        columns={columns}
        rows={exams}
        pageSize={10}
        rowKey={(e) => e.id}
        initialSort={{ key: 'dates', dir: 'asc' }}
        onRowClick={(e) => onDatesheet(e)}
        empty={<Empty icon="clipboard" title="No exams yet" body="Create an exam, then add its datesheet and notify parents." />}
      />
      <CreateExamModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  )
}

/* ============================================================
   Tab 2 — Marks entry (API grades)
   ============================================================ */
function MarksEntryTab() {
  const app = useApp()
  const toast = useToast()
  const updateExam = useUpdateExam()
  const upsertGrade = useUpsertGrade()
  const editable = can(app.role, 'exams', 'E')
  const classesQ = useClasses()
  const classList = useClassNames()
  const studentsQ = useStudents()
  const { data: examsData } = useExams()
  const exams = examsData ?? []

  const [examId, setExamId] = useState('')
  const [cls, setCls] = useState('')
  const [paperId, setPaperId] = useState('')

  useEffect(() => {
    if (!examId && exams[0]) setExamId(exams[0].id)
  }, [exams, examId])

  useEffect(() => {
    if (!cls && classList.length) setCls(classList[0])
    else if (cls && classList.length && !classList.includes(cls)) setCls(classList[0])
  }, [classList, cls])

  const papersQ = useExamPapers(examId || null)
  const selectedClassId = useMemo(
    () => (classesQ.data ?? []).find((c) => classLabel(c) === cls)?.id ?? null,
    [classesQ.data, cls],
  )
  const classNameById = (id?: string | null) => {
    const c = (classesQ.data ?? []).find((row) => row.id === id)
    return c ? classLabel(c) : 'Selected class'
  }
  const papers = useMemo(
    () => (papersQ.data ?? []).filter((p) => !p.classId || !selectedClassId || p.classId === selectedClassId),
    [papersQ.data, selectedClassId],
  )
  useEffect(() => {
    if (!paperId && papers[0]) setPaperId(papers[0].id)
    else if (paperId && papers.length && !papers.some((p) => p.id === paperId)) setPaperId(papers[0]?.id ?? '')
    else if (paperId && !papers.length) setPaperId('')
  }, [papers, paperId])

  const paper = papers.find((p) => p.id === paperId)
  const gradesQ = useGrades(paperId || null)
  const gradesByStudent = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of gradesQ.data ?? []) m.set(g.studentId, g.marks)
    return m
  }, [gradesQ.data])

  const roster = useMemo(
    () => (studentsQ.data ?? []).filter((s) => s.cls === cls).sort((a, b) => a.roll - b.roll),
    [studentsQ.data, cls],
  )

  const [marks, setMarks] = useState<Record<string, number>>({})
  useEffect(() => {
    const out: Record<string, number> = {}
    roster.forEach((s) => { out[s.id] = gradesByStudent.get(s.id) ?? 0 })
    setMarks(out)
  }, [roster, gradesByStudent])

  const setMark = (id: string, raw: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)))
    setMarks((m) => ({ ...m, [id]: n }))
  }

  const entered = roster.map((s) => marks[s.id] ?? 0)
  const avg = entered.length ? +(entered.reduce((a, b) => a + b, 0) / entered.length).toFixed(1) : 0
  const passCount = entered.filter((v) => v >= 33).length
  const exam = exams.find((e) => e.id === examId)

  const save = async () => {
    if (!exam || !paper) { toast.danger('Pick exam & paper', 'Select an exam and a datesheet paper first.'); return }
    try {
      for (const s of roster) {
        await upsertGrade.mutateAsync({
          studentId: s.id,
          studentName: s.name,
          examPaperId: paper.id,
          marks: marks[s.id] ?? 0,
        })
      }
      const progress = Math.max(exam.marksEntered, Math.round((100 * 1) / Math.max(1, papers.length || exam.subjects)))
      await updateExam.mutateAsync({ id: examId, patch: { status: 'marks_entry', marksEntered: Math.min(100, progress) } })
      toast.success('Marks saved', `${roster.length} entries · ${cls} · ${paper.subject}`)
    } catch (err) {
      toast.danger('Could not save marks', err instanceof Error ? err.message : 'Please try again.')
    }
  }

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead title="Marks entry" sub={`${cls || '—'} · ${paper?.subject ?? '—'} · ${roster.length} students`} icon="edit" />
        <div className="row gap8 ai-center wrap" style={{ marginLeft: 'auto' }}>
          <Select
            options={exams.map((e) => ({ value: e.id, label: e.name }))}
            value={examId}
            onChange={(e) => { setExamId(e.target.value); setPaperId('') }}
          />
          <Select options={classList} value={cls} onChange={(e) => setCls(e.target.value)} />
          <Select
            options={papers.map((p) => ({ value: p.id, label: `${p.subject || p.name || p.id}${p.classId ? ` · ${classNameById(p.classId)}` : ''}` }))}
            value={paperId}
            onChange={(e) => setPaperId(e.target.value)}
          />
        </div>
      </div>

      {!papers.length ? (
        <Empty icon="calendar" title="No datesheet papers" body="Open Datesheet on the exam and add papers first." />
      ) : roster.length === 0 ? (
        <Empty icon="users" title="No students in this class" body="Pick another class or enrol students in People." />
      ) : (
        <>
          <div className="row ai-center gap20 wrap" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-sm">Class average <span className="fw7">{avg}%</span> · Grade <Badge tone={gradeTone(gradeFor(avg))}>{gradeFor(avg)}</Badge></span>
            <span className="t-sm">Passing <span className="fw7">{passCount}/{roster.length}</span></span>
          </div>
          <table className="sm-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Roll</th>
                <th>Student</th>
                <th className="ta-center" style={{ width: 120 }}>Marks /100</th>
                <th className="ta-center" style={{ width: 90 }}>Grade</th>
                <th className="ta-center" style={{ width: 90 }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const m = marks[s.id] ?? 0
                const g = gradeFor(m)
                return (
                  <tr key={s.id}>
                    <td className="muted">{s.roll}</td>
                    <td className="fw6">{s.name}</td>
                    <td className="ta-center">
                      <Input type="number" min={0} max={100} value={String(m)} disabled={!editable}
                        style={{ width: 80, textAlign: 'center' }}
                        onChange={(e) => setMark(s.id, e.target.value)} />
                    </td>
                    <td className="ta-center"><Badge tone={gradeTone(g)}>{g}</Badge></td>
                    <td className="ta-center"><Badge tone={m >= 33 ? 'success' : 'danger'}>{m >= 33 ? 'Pass' : 'Fail'}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="row jc-end gap8" style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
            {editable
              ? <Btn variant="primary" icon="check" disabled={upsertGrade.isPending} onClick={() => void save()}>
                  {upsertGrade.isPending ? 'Saving…' : 'Save marks'}
                </Btn>
              : <Badge tone="neutral" icon="eye">View only</Badge>}
          </div>
        </>
      )}
    </Card>
  )
}

/* ============================================================
   Tab — Exam attendance
   ============================================================ */
function ExamAttendanceTab() {
  const toast = useToast()
  const app = useApp()
  const editable = can(app.role, 'exams', 'E')
  const classesQ = useClasses()
  const classList = useClassNames()
  const studentsQ = useStudents()
  const { data: examsData } = useExams()
  const exams = examsData ?? []

  const [examId, setExamId] = useState('')
  const [cls, setCls] = useState('')
  const [paperId, setPaperId] = useState('')

  useEffect(() => {
    if (!examId && exams[0]) setExamId(exams[0].id)
  }, [exams, examId])
  useEffect(() => {
    if (!cls && classList.length) setCls(classList[0])
    else if (cls && classList.length && !classList.includes(cls)) setCls(classList[0])
  }, [classList, cls])

  const papersQ = useExamPapers(examId || null)
  const selectedClassId = useMemo(
    () => (classesQ.data ?? []).find((c) => classLabel(c) === cls)?.id ?? null,
    [classesQ.data, cls],
  )
  const classNameById = (id?: string | null) => {
    const c = (classesQ.data ?? []).find((row) => row.id === id)
    return c ? classLabel(c) : 'Selected class'
  }
  const papers = useMemo(
    () => (papersQ.data ?? []).filter((p) => !p.classId || !selectedClassId || p.classId === selectedClassId),
    [papersQ.data, selectedClassId],
  )
  useEffect(() => {
    if (!paperId && papers[0]) setPaperId(papers[0].id)
    else if (paperId && papers.length && !papers.some((p) => p.id === paperId)) setPaperId(papers[0]?.id ?? '')
    else if (paperId && !papers.length) setPaperId('')
  }, [papers, paperId])

  const paper = papers.find((p) => p.id === paperId)
  const date = paper?.date || todayIso()
  const subject = paper?.subject || ''

  const roster = useMemo(
    () => (studentsQ.data ?? []).filter((s) => s.cls === cls).sort((a, b) => a.roll - b.roll),
    [studentsQ.data, cls],
  )

  const [att, setAtt] = useState<Record<string, 'present' | 'absent'>>({})
  useEffect(() => {
    if (!examId || !subject) { setAtt({}); return }
    const saved = loadExamAttendance(examId, subject, date)
    const out: Record<string, 'present' | 'absent'> = {}
    roster.forEach((s) => { out[s.id] = saved[s.id] ?? 'present' })
    setAtt(out)
  }, [roster, examId, subject, date])

  const present = roster.filter((s) => (att[s.id] ?? 'present') === 'present').length
  const absent = roster.length - present
  const exam = exams.find((e) => e.id === examId)

  const save = () => {
    if (!examId || !subject) return
    const entries: Record<string, 'present' | 'absent'> = {}
    roster.forEach((s) => { entries[s.id] = att[s.id] ?? 'present' })
    saveExamAttendance(examId, subject, date, entries)
    toast.success('Attendance saved', `${present} present · ${absent} absent · ${cls} · ${subject}`)
  }

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead title="Exam attendance" sub={`${cls || '—'} · ${subject || '—'} · ${roster.length} students`} icon="calendar" />
        <div className="row gap8 ai-center wrap" style={{ marginLeft: 'auto' }}>
          <Select options={exams.map((e) => ({ value: e.id, label: e.name }))} value={examId} onChange={(e) => { setExamId(e.target.value); setPaperId('') }} />
          <Select options={classList} value={cls} onChange={(e) => setCls(e.target.value)} />
          <Select
            options={papers.map((p) => ({ value: p.id, label: `${p.subject || p.name || p.id}${p.classId ? ` · ${classNameById(p.classId)}` : ''}` }))}
            value={paperId}
            onChange={(e) => setPaperId(e.target.value)}
          />
        </div>
      </div>

      {!papers.length ? (
        <Empty icon="calendar" title="No datesheet papers" body="Add papers on the datesheet first." />
      ) : roster.length === 0 ? (
        <Empty icon="users" title="No students in this class" body="Pick another class." />
      ) : (
        <>
          <div className="row ai-center gap20 wrap" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span className="t-sm">Present <span className="fw7" style={{ color: 'var(--success)' }}>{present}</span></span>
            <span className="t-sm">Absent <span className="fw7" style={{ color: 'var(--danger)' }}>{absent}</span></span>
            <span className="t-sm muted">{exam?.name} · {fmtDate(date)}</span>
          </div>
          <table className="sm-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Roll</th>
                <th>Student</th>
                <th className="ta-center" style={{ width: 200 }}>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const v = att[s.id] ?? 'present'
                return (
                  <tr key={s.id}>
                    <td className="muted">{s.roll}</td>
                    <td className="fw6">{s.name}</td>
                    <td className="ta-center">
                      <div className="row gap6 jc-center">
                        <Btn variant={v === 'present' ? 'primary' : 'secondary'} size="sm" disabled={!editable}
                          onClick={() => setAtt((m) => ({ ...m, [s.id]: 'present' }))}>Present</Btn>
                        <Btn variant={v === 'absent' ? 'primary' : 'secondary'} size="sm" disabled={!editable}
                          onClick={() => setAtt((m) => ({ ...m, [s.id]: 'absent' }))}>Absent</Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="row jc-end gap8" style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
            {editable
              ? <Btn variant="primary" icon="check" onClick={save}>Save attendance</Btn>
              : <Badge tone="neutral" icon="eye">View only</Badge>}
          </div>
        </>
      )}
    </Card>
  )
}

/* ============================================================
   Report card modal
   ============================================================ */
function ReportCardModal({ student, examId, getMark, subjects, peers, onClose }: {
  student: Student | null
  examId?: string
  getMark?: (studentId: string, subject: string) => number | undefined
  subjects: string[]
  peers: Student[]
  onClose: () => void
}) {
  const app = useApp()
  if (!student) return null
  const report = reportFor(student, examId, getMark, subjects)
  const rank = classRank(student, examId, getMark, peers, subjects)

  return (
    <Modal
      open={!!student} onClose={onClose} size="lg" icon="clipboard"
      title="Report card" sub={`${student.name} · ${student.cls}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          <Btn variant="primary" icon="download" onClick={() => window.print()}>Print</Btn>
        </div>
      }
    >
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div className="row ai-center jc-between" style={{ padding: 18, background: 'var(--brand-50)', borderBottom: '1px solid var(--border)' }}>
          <div className="row ai-center gap12">
            <span className="sm-card-ic" style={{ width: 42, height: 42 }}><Icon name="cap" size={22} /></span>
            <div>
              <div className="fw7 t-lg">{app.school.name}</div>
              <div className="t-xs muted">Academic Year · Term Report Card</div>
            </div>
          </div>
          <Badge tone={report.result === 'PASS' ? 'success' : 'danger'} solid>{report.result}</Badge>
        </div>

        <div className="sm-grid-3 gap12" style={{ padding: 18 }}>
          <div><div className="t-xs muted">Student</div><div className="fw6">{student.name}</div></div>
          <div><div className="t-xs muted">Admission no</div><div className="fw6">{student.adm}</div></div>
          <div><div className="t-xs muted">Class · Roll</div><div className="fw6">{student.cls} · {student.roll}</div></div>
          <div><div className="t-xs muted">Guardian</div><div className="fw6">{student.guardian}</div></div>
          <div><div className="t-xs muted">Attendance</div><div className="fw6">{student.attendance}%</div></div>
          <div><div className="t-xs muted">Class rank</div><div className="fw6">{rank.rank} / {rank.classSize}</div></div>
        </div>

        <table className="sm-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th className="ta-right">Marks</th>
              <th className="ta-right">Max</th>
              <th className="ta-center">Grade</th>
              <th className="ta-center">GPA</th>
              <th className="ta-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.subject}>
                <td className="fw6">{r.subject}</td>
                <td className="ta-right">{r.marks}</td>
                <td className="ta-right muted">{r.max}</td>
                <td className="ta-center"><Badge tone={gradeTone(r.grade)}>{r.grade}</Badge></td>
                <td className="ta-center">{r.gpa}</td>
                <td className="ta-center"><Badge tone={r.pass ? 'success' : 'danger'}>{r.pass ? 'Pass' : 'Fail'}</Badge></td>
              </tr>
            ))}
            <tr>
              <td className="fw7">Total</td>
              <td className="ta-right fw7">{report.total}</td>
              <td className="ta-right muted">{report.maxTotal}</td>
              <td className="ta-center fw7">{report.grade}</td>
              <td className="ta-center fw7">{report.gpa}</td>
              <td className="ta-center fw7">{report.pct}%</td>
            </tr>
          </tbody>
        </table>

        <div className="row ai-center jc-between wrap gap16" style={{ padding: 18, borderTop: '1px solid var(--border)' }}>
          <div className="row gap20 wrap">
            <div><div className="t-xs muted">Percentage</div><div className="fw7 t-lg">{report.pct}%</div></div>
            <div><div className="t-xs muted">Overall grade</div><div className="fw7 t-lg">{report.grade}</div></div>
            <div><div className="t-xs muted">GPA</div><div className="fw7 t-lg">{report.gpa}</div></div>
            <div><div className="t-xs muted">Result</div><div className="fw7 t-lg">{report.result}</div></div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ============================================================
   Tab 3 — Report cards
   ============================================================ */
function ReportCardsTab() {
  const classesQ = useClasses()
  const classList = useClassNames()
  const studentsQ = useStudents()
  const { data: examsData } = useExams()
  const exams = examsData ?? []
  const [examId, setExamId] = useState('')
  const [cls, setCls] = useState('')
  const [open, setOpen] = useState<Student | null>(null)

  useEffect(() => {
    if (!examId && exams[0]) setExamId(exams[0].id)
  }, [exams, examId])
  useEffect(() => {
    if (!cls && classList.length) setCls(classList[0])
    else if (cls && classList.length && !classList.includes(cls)) setCls(classList[0])
  }, [classList, cls])

  const papersQ = useExamPapers(examId || null)
  const selectedClassId = useMemo(
    () => (classesQ.data ?? []).find((c) => classLabel(c) === cls)?.id ?? null,
    [classesQ.data, cls],
  )
  const classPapers = useMemo(
    () => (papersQ.data ?? []).filter((p) => !p.classId || !selectedClassId || p.classId === selectedClassId),
    [papersQ.data, selectedClassId],
  )
  const subjects = useMemo(
    () => [...new Set(classPapers.map((p) => p.subject).filter(Boolean))],
    [classPapers],
  )
  const marksQ = useExamMarksMap(examId || null)
  const getMark = (sid: string, subject: string) => marksQ.data?.[markKey(examId, sid, subject)]

  const roster = useMemo(
    () => (studentsQ.data ?? []).filter((s) => s.cls === cls).sort((a, b) => a.roll - b.roll),
    [studentsQ.data, cls],
  )

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead title="Report cards" sub={`${cls || '—'} · ${roster.length} students`} icon="clipboard" />
        <div className="row gap8 ai-center" style={{ marginLeft: 'auto' }}>
          <Select options={exams.map((e) => ({ value: e.id, label: e.name }))} value={examId} onChange={(e) => setExamId(e.target.value)} />
          <Select options={classList} value={cls} onChange={(e) => setCls(e.target.value)} />
        </div>
      </div>

      {!subjects.length ? (
        <Empty icon="calendar" title="No papers / marks yet" body="Add a datesheet and enter marks first." />
      ) : roster.length === 0 ? (
        <Empty icon="users" title="No students in this class" body="Pick another class." />
      ) : (
        <div className="sm-grid-3 gap12" style={{ padding: 16 }}>
          {roster.map((s) => {
            const report = reportFor(s, examId, getMark, subjects)
            const rank = classRank(s, examId, getMark, roster, subjects)
            return (
              <Card key={s.id} hover onClick={() => setOpen(s)}>
                <div className="row ai-center jc-between">
                  <div>
                    <div className="fw6">{s.name}</div>
                    <div className="t-xs muted">Roll {s.roll} · Rank {rank.rank}/{rank.classSize}</div>
                  </div>
                  <Badge tone={report.result === 'PASS' ? 'success' : 'danger'}>{report.result}</Badge>
                </div>
                <div className="row ai-center jc-between" style={{ marginTop: 12 }}>
                  <span className="t-sm">{report.pct}% · <span className="fw6">{report.grade}</span></span>
                  <span className="t-xs muted">GPA {report.gpa}</span>
                </div>
                <div style={{ marginTop: 8 }}><Progress value={report.pct} color={report.pct >= 60 ? 'var(--success)' : 'var(--warning)'} /></div>
              </Card>
            )
          })}
        </div>
      )}
      <ReportCardModal
        student={open}
        examId={examId}
        getMark={getMark}
        subjects={subjects}
        peers={roster}
        onClose={() => setOpen(null)}
      />
    </Card>
  )
}

/* ============================================================
   Tab — Exam timetable (day-wise from datesheet)
   ============================================================ */
function ExamTimetableTab({ onEditDatesheet }: { onEditDatesheet: (e: Exam) => void }) {
  const app = useApp()
  const toast = useToast()
  const canNotify = can(app.role, 'exams', 'A') || can(app.role, 'exams', 'E')
  const classesQ = useClasses()
  const { data: examsData, isLoading: examsLoading } = useExams()
  const exams = examsData ?? []
  const [examId, setExamId] = useState('')
  const [classId, setClassId] = useState('')
  const [email, setEmail] = useState(true)
  const [sms, setSms] = useState(true)
  const [appCh, setAppCh] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!examId && exams[0]) setExamId(exams[0].id)
  }, [exams, examId])

  const exam = exams.find((e) => e.id === examId) ?? null
  const papersQ = useExamPapers(examId || null)
  const classOptions = [
    { value: '', label: 'All classes' },
    ...[...(classesQ.data ?? [])]
      .filter((c) => c.id)
      .sort(compareClassesAscending)
      .map((c) => ({ value: c.id!, label: classLabel(c) })),
  ]
  const classNameOf = (id?: string | null) =>
    id ? classOptions.find((c) => c.value === id)?.label ?? 'Selected class' : 'All classes'
  const papers = useMemo(
    () => (papersQ.data ?? []).filter((p) => !classId || !p.classId || p.classId === classId),
    [papersQ.data, classId],
  )

  const flatPapers = useMemo(
    () => papers.map((p: ExamPaper) => ({
      id: p.id,
      classId: p.classId,
      className: classNameOf(p.classId),
      subject: p.subject,
      date: p.date,
      start: p.start,
      duration: p.duration,
      room: p.room,
      inv1: p.inv1,
      inv2: p.inv2,
      maxMarks: p.maxMarks,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [papers],
  )

  const days = useMemo(() => groupExamTimetable(flatPapers), [flatPapers])
  const periodGrid = useMemo(() => buildExamPeriodGrid(flatPapers), [flatPapers])

  const paperCount = flatPapers.length
  const clashes = useMemo(
    () => findClashes(papers.map((p) => ({
      id: p.id, subject: p.subject, date: p.date, start: p.start,
      duration: p.duration, room: p.room, inv1: p.inv1, inv2: p.inv2,
      classId: p.classId, className: classNameOf(p.classId),
    }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [papers],
  )

  const doPrint = () => {
    if (!exam) return
    const ok = printExamTimetable({
      schoolName: app.school.name,
      examName: exam.name,
      grades: classId ? classNameOf(classId) : exam.grades,
      from: exam.from,
      to: exam.to,
      days,
      papers: flatPapers,
      schoolLogoInitials: app.school.logo,
      schoolLogoUrl: app.school.logoUrl,
      schoolImageUrl: app.school.imageUrl,
      schoolBrandColor: app.school.color,
      schoolCity: app.school.city,
    })
    if (!ok) toast.danger('Pop-up blocked', 'Allow pop-ups to print the exam timetable.')
    else toast.success('Print ready', 'Same period grid as on screen · Save as PDF in the dialog.')
  }

  const notify = async () => {
    if (!exam) return
    if (!email && !sms && !appCh) {
      toast.danger('Pick a channel', 'Enable Email, SMS, and/or App.')
      return
    }
    setBusy(true)
    try {
      const res = await notifyExamAudience(
        exam, app.school.name, 'datesheet',
        { email, sms, app: appCh },
        'parents',
      )
      const bits = [
        email ? `${res.emails} email` : '',
        sms ? `${res.phones} SMS` : '',
        appCh ? 'app' : '',
      ].filter(Boolean)
      toast.success('Timetable sent', `${exam.name} → ${bits.join(' · ')}`)
    } catch (err) {
      toast.danger('Could not notify', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead
          title="Exam timetable"
          sub={exam ? `${exam.name} · ${classId ? classNameOf(classId) : exam.grades} · ${paperCount} papers · ${days.length} day${days.length === 1 ? '' : 's'}` : 'Pick an exam'}
          icon="calendar"
        />
        <div className="row gap8 ai-center wrap" style={{ marginLeft: 'auto' }}>
          <Select
            options={exams.map((e) => ({ value: e.id, label: e.name }))}
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
          />
          <Select
            options={classOptions}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          />
          {exam && (
            <Btn variant="secondary" size="sm" icon="edit" onClick={() => onEditDatesheet(exam)}>
              Edit datesheet
            </Btn>
          )}
          <Btn variant="secondary" size="sm" icon="download" disabled={!paperCount} onClick={doPrint}>
            Save PDF
          </Btn>
        </div>
      </div>

      {examsLoading || papersQ.isLoading ? (
        <div style={{ padding: 24 }}><span className="t-sm muted">Loading timetable…</span></div>
      ) : !exam ? (
        <Empty icon="clipboard" title="No exams yet" body="Create an exam, then add papers on the datesheet." />
      ) : !paperCount ? (
        <Empty
          icon="calendar"
          title="No timetable papers"
          body="Add class-wise papers on the datesheet first — students will see their paper times here."
          action={<Btn variant="primary" icon="plus" onClick={() => onEditDatesheet(exam)}>Open datesheet</Btn>}
        />
      ) : (
        <>
          <div className="sm-exam-tt-hero">
            <div className="sm-exam-tt-kpis">
              <div>
                <div className="sm-exam-tt-val">{days.length}</div>
                <div className="t-sm muted">Exam days</div>
              </div>
              <div className="sm-exam-tt-stat">
                <div className="t-lg fw7">{paperCount}</div>
                <div className="t-xs muted3">Papers</div>
              </div>
              <div className="sm-exam-tt-stat">
                <div className="t-lg fw7">{fmtDate(exam.from)} – {fmtDate(exam.to)}</div>
                <div className="t-xs muted3">Window</div>
              </div>
              <div className="sm-exam-tt-stat">
                <div className="t-lg fw7" style={{ color: clashes.length ? 'var(--danger)' : 'var(--success)' }}>
                  {clashes.length || 0}
                </div>
                <div className="t-xs muted3">Clashes</div>
              </div>
            </div>
            {canNotify && (
              <div className="row ai-center gap10 wrap">
                <span className="t-xs muted">Notify parents</span>
                <ChannelToggles email={email} sms={sms} app={appCh} onEmail={setEmail} onSms={setSms} onApp={setAppCh} />
                <Btn variant="primary" size="sm" icon="bell" disabled={busy} onClick={() => void notify()}>
                  {busy ? 'Sending…' : 'Send timetable'}
                </Btn>
              </div>
            )}
          </div>

          {clashes.length > 0 && (
            <div className="row ai-start gap8" style={{ margin: '0 16px 12px', padding: '10px 12px', borderRadius: 10, background: 'var(--danger-bg, rgba(220,38,38,.1))', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
              <Icon name="alert" size={16} />
              <span className="t-sm fw6">{clashes.join(' · ')}</span>
            </div>
          )}

          {/* Period × date grid — same look as class weekly timetable */}
          <div className="sm-exam-tt-grid-wrap">
            <div
              className="sm-exam-tt-grid"
              style={{
                gridTemplateColumns: `88px repeat(${Math.max(1, periodGrid.dates.length)}, minmax(100px, 1fr))`,
              }}
            >
              <div />
              {periodGrid.dates.map((d) => (
                <div key={d} className="sm-exam-tt-colhead">
                  <div className="fw7 t-sm">
                    {new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                  </div>
                  <div className="t-xs muted3">{fmtDate(d)}</div>
                </div>
              ))}
              {periodGrid.sessions.map((sess) => {
                const sample = flatPapers.find((p) => p.start === sess.start)
                const timeSub = sample
                  ? `${sess.start} – ${endTime(sess.start, sample.duration)}`
                  : sess.start
                return (
                  <Fragment key={sess.start}>
                    <div className="sm-exam-tt-rowhead">
                      <div className="fw7 t-sm">{sess.label}</div>
                      <div className="t-xs muted3">{timeSub}</div>
                    </div>
                    {periodGrid.dates.map((date) => {
                      const list = periodGrid.cell(date, sess.start)
                      if (!list.length) {
                        return <div key={`${date}-${sess.start}`} className="sm-exam-tt-cell empty">—</div>
                      }
                      const st = examSubjectStyle(list[0].subject)
                      return (
                        <div
                          key={`${date}-${sess.start}`}
                          className="sm-exam-tt-cell"
                          style={{ background: st.bg, borderColor: st.bd, color: st.fg }}
                        >
                          {list.map((p) => {
                            const inv = [p.inv1, p.inv2].filter(Boolean).join(' · ')
                            return (
                              <div key={p.id} className="sm-exam-tt-cell-block">
                                <div className="fw7 t-sm" style={{ color: st.fg }}>{p.subject}</div>
                                <div className="t-xs" style={{ color: 'var(--text-2)' }}>
                                  {[!classId && p.className ? p.className : '', p.room, inv].filter(Boolean).join(' · ') || `${p.duration} min`}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </Fragment>
                )
              })}
            </div>
            <div className="t-xs muted" style={{ marginTop: 10 }}>
              Period rows × exam dates — same layout as the class timetable. Print / Save PDF matches this view.
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

/* ============================================================
   Publish results — Email · SMS · App
   ============================================================ */
function PublishResultsModal({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const app = useApp()
  const toast = useToast()
  const updateExam = useUpdateExam()
  const canPublish = can(app.role, 'exams', 'A')
  const studentsQ = useStudents()
  const classList = useClassNames()
  const [email, setEmail] = useState(true)
  const [sms, setSms] = useState(true)
  const [appCh, setAppCh] = useState(true)
  const [busy, setBusy] = useState(false)

  const papersQ = useExamPapers(exam?.id ?? null)
  const subjects = useMemo(
    () => [...new Set((papersQ.data ?? []).map((p) => p.subject).filter(Boolean))],
    [papersQ.data],
  )
  const marksQ = useExamMarksMap(exam?.id ?? null)
  const getMark = (sid: string, subject: string) =>
    exam ? marksQ.data?.[markKey(exam.id, sid, subject)] : undefined

  if (!exam) return null

  const cls = classList[0] ?? ''
  const roster = (studentsQ.data ?? []).filter((s) => s.cls === cls).sort((a, b) => a.roll - b.roll)
  const sample = roster[0]
  const report = sample && subjects.length ? reportFor(sample, exam.id, getMark, subjects) : null
  const classAvg = roster.length && subjects.length
    ? +(roster.reduce((a, s) => a + reportFor(s, exam.id, getMark, subjects).pct, 0) / roster.length).toFixed(1)
    : 0
  const classPass = subjects.length
    ? roster.filter((s) => reportFor(s, exam.id, getMark, subjects).result === 'PASS').length
    : 0

  const publish = async () => {
    if (!email && !sms && !appCh) {
      toast.danger('Pick a channel', 'Enable Email, SMS, and/or App.')
      return
    }
    setBusy(true)
    try {
      await updateExam.mutateAsync({ id: exam.id, patch: { published: true, status: 'completed' } })
      const res = await notifyExamAudience(
        exam, app.school.name, 'results',
        { email, sms, app: appCh },
        'parents',
      )
      const bits = [
        email ? `${res.emails} email` : '',
        sms ? `${res.phones} SMS` : '',
        appCh ? 'app' : '',
      ].filter(Boolean)
      toast.success('Results published', `${exam.name} → ${bits.join(' · ')}`)
      onClose()
    } catch (err) {
      toast.danger('Could not publish', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!exam} onClose={onClose} size="lg" icon="bell"
      title={exam.published ? 'Notify again' : 'Publish results'}
      sub={`${exam.name} · ${exam.grades}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          {canPublish && (
            <Btn variant="primary" icon="bell" disabled={busy} onClick={() => void publish()}>
              {busy ? 'Sending…' : exam.published ? 'Send notify' : 'Publish & notify'}
            </Btn>
          )}
        </div>
      }
    >
      <div className="col gap16">
        <div>
          <div className="t-sm muted" style={{ marginBottom: 8 }}>Send via</div>
          <ChannelToggles email={email} sms={sms} app={appCh} onEmail={setEmail} onSms={setSms} onApp={setAppCh} />
          <div className="t-xs muted" style={{ marginTop: 8 }}>
            Uses parent / guardian emails & mobiles from People · same delivery as Announcements.
          </div>
        </div>

        <Card>
          <CardHead title="Class preview" sub={cls || '—'} icon="cap" />
          <div className="row gap20 wrap" style={{ marginTop: 8 }}>
            <div><div className="t-xs muted">Class average</div><div className="fw7 t-lg">{classAvg}%</div></div>
            <div><div className="t-xs muted">Passing</div><div className="fw7 t-lg">{classPass}/{roster.length}</div></div>
          </div>
        </Card>

        <Card>
          <CardHead title="Sample report" sub={sample ? `${sample.name} · ${cls}` : cls} icon="user" />
          {report ? (
            <div className="row ai-center jc-between wrap gap16" style={{ marginTop: 8 }}>
              <div className="row gap20 wrap">
                <div><div className="t-xs muted">Percentage</div><div className="fw7 t-lg">{report.pct}%</div></div>
                <div><div className="t-xs muted">Grade</div><div className="fw7 t-lg">{report.grade}</div></div>
                <div><div className="t-xs muted">Result</div><div className="fw7 t-lg">{report.result}</div></div>
              </div>
              <Badge tone={report.result === 'PASS' ? 'success' : 'danger'} solid>{report.result}</Badge>
            </div>
          ) : <Empty icon="users" title="No preview" body="Add papers, marks, and students to preview." />}
        </Card>
      </div>
    </Modal>
  )
}

/* ============================================================
   Screen
   ============================================================ */
function ExamsScreen() {
  const app = useApp()
  const [tab, setTab] = useState('exams')
  const [datesheetExam, setDatesheetExam] = useState<Exam | null>(null)
  const [publishExam, setPublishExam] = useState<Exam | null>(null)

  const tabs = [
    { value: 'exams', label: 'Exams & tests', icon: 'clipboard' },
    { value: 'timetable', label: 'Exam timetable', icon: 'calendar' },
    { value: 'marks', label: 'Marks entry', icon: 'edit' },
    { value: 'attendance', label: 'Exam attendance', icon: 'clock' },
    { value: 'reports', label: 'Report cards', icon: 'cap' },
  ]

  return (
    <div>
      <PageHead title="Exams & grading" sub={`Live schedule · timetable · marks · notify Email / SMS / App · ${app.school.name}`} />
      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
      </div>

      {tab === 'exams' && <ExamsListTab onDatesheet={setDatesheetExam} onPublish={setPublishExam} />}
      {tab === 'timetable' && <ExamTimetableTab onEditDatesheet={setDatesheetExam} />}
      {tab === 'marks' && <MarksEntryTab />}
      {tab === 'attendance' && <ExamAttendanceTab />}
      {tab === 'reports' && <ReportCardsTab />}

      <DatesheetDrawer exam={datesheetExam} onClose={() => setDatesheetExam(null)} />
      <PublishResultsModal exam={publishExam} onClose={() => setPublishExam(null)} />
    </div>
  )
}

export const examsScreens: Record<string, ComponentType> = { 'school.exams': ExamsScreen }
