/* ============================================================
   SchoolMate — Exams & grading hub.
   Tabbed: Exams & tests · Marks entry · Report cards, plus a
   datesheet drawer with per-paper room + dual invigilator
   allocation and live clash detection. Frontend-only, mock data.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can } from '@/lib/gating'
import {
  PageHead, Tabs, Card, CardHead, Btn, Badge, Select, Field, Input,
  Modal, Drawer, Icon, Empty, Progress, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui'
import { students, subjects, grades, sections } from '@/data/mockDb'
import { reportFor, classRank, gradeFor, studentSubjectMarks } from '@/lib/format'
import { markKey, marksProgress } from '@/lib/examData'
import type { Exam, Student } from '@/types'

/* ---------- sample invigilator pool (frontend-only) ---------- */
const TEACHER_POOL = [
  'R. Kumar', 'S. Rao', 'M. Krishnan', 'A. Banerjee', 'P. Nair',
  'V. Reddy', 'L. Iyer', 'K. Das', 'N. Sharma', 'D. Menon',
]

/* ---------- shared helpers ---------- */
const statusTone: Record<Exam['status'], BadgeTone> = {
  scheduled: 'info', completed: 'success', marks_entry: 'warning', draft: 'neutral',
}
const statusLabel: Record<Exam['status'], string> = {
  scheduled: 'Scheduled', completed: 'Completed', marks_entry: 'Marks entry', draft: 'Draft',
}
const fmtDate = (iso: string): string =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
const gradeTone = (g: string): BadgeTone =>
  g === 'A1' || g === 'A2' ? 'success' : g === 'B1' || g === 'B2' ? 'brand'
    : g === 'C1' || g === 'C2' ? 'info' : g === 'D' ? 'warning' : 'danger'

const clsOptions = grades.slice(4).flatMap((g) => sections.map((s) => g + '-' + s))

interface Paper { id: number; subject: string; date: string }
function buildPapers(exam: Exam): Paper[] {
  const subs = subjects.slice(0, exam.subjects)
  const start = new Date(exam.from + 'T00:00:00')
  return subs.map((s, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i * 2)
    return { id: i, subject: s, date: d.toISOString().slice(0, 10) }
  })
}

/* ============================================================
   Create-exam modal
   ============================================================ */
function CreateExamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const app = useApp()
  const [name, setName] = useState('')
  const [type, setType] = useState('Term')
  const [gradeRange, setGradeRange] = useState('VI–XII')
  const [from, setFrom] = useState('2026-09-08')
  const [to, setTo] = useState('2026-09-20')

  const submit = () => {
    if (!name.trim()) { toast.danger('Name required', 'Please enter an exam name.'); return }
    if (to < from) { toast.danger('Invalid dates', 'End date cannot be before the start date.'); return }
    const exam: Exam = {
      id: 'EX-' + Date.now().toString(36).toUpperCase(),
      name: name.trim(), type, grades: gradeRange, from, to,
      subjects: subjects.length, status: 'scheduled', marksEntered: 0, published: false,
    }
    app.addExam(exam)
    toast.success('Exam created', `${name} (${type}) scheduled for ${gradeRange}.`)
    setName('')
    onClose()
  }

  return (
    <Modal
      open={open} onClose={onClose} icon="clipboard"
      title="Create exam / test" sub="Set up a new examination schedule"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>Create exam</Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Exam name" required>
          <Input icon="clipboard" value={name} placeholder="e.g. Term 2 Examination" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="sm-grid-2 gap16">
          <Field label="Type">
            <Select options={['Term', 'Unit Test', 'Periodic', 'Board Prep']} value={type} onChange={(e) => setType(e.target.value)} />
          </Field>
          <Field label="Grades">
            <Select options={['I–V', 'VI–X', 'VI–XII', 'XII']} value={gradeRange} onChange={(e) => setGradeRange(e.target.value)} />
          </Field>
        </div>
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
   Datesheet drawer — per-paper room + dual invigilators + clash
   ============================================================ */
function DatesheetDrawer({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const toast = useToast()
  const app = useApp()
  const canPublish = can(app.role, 'exams', 'A')
  const papers = useMemo(() => (exam ? buildPapers(exam) : []), [exam])

  const [rooms, setRooms] = useState<Record<number, string>>({})
  const [inv1, setInv1] = useState<Record<number, string>>({})
  const [inv2, setInv2] = useState<Record<number, string>>({})

  /* seed a sensible, clash-free default whenever the exam changes */
  useEffect(() => {
    if (!exam) return
    const r: Record<number, string> = {}
    const a: Record<number, string> = {}
    const b: Record<number, string> = {}
    papers.forEach((p, i) => {
      r[p.id] = 'Hall ' + (i + 1)
      a[p.id] = TEACHER_POOL[(i * 2) % TEACHER_POOL.length]
      b[p.id] = TEACHER_POOL[(i * 2 + 1) % TEACHER_POOL.length]
    })
    setRooms(r); setInv1(a); setInv2(b)
  }, [exam, papers])

  /* clash detection — a teacher invigilating two slots on the same day */
  const clashes = useMemo(() => {
    const seen: Record<string, number> = {}
    const out: string[] = []
    papers.forEach((p) => {
      for (const t of [inv1[p.id], inv2[p.id]]) {
        if (!t) continue
        const key = p.date + '|' + t
        seen[key] = (seen[key] || 0) + 1
        if (seen[key] === 2) out.push(`${t} — ${fmtDate(p.date)}`)
      }
    })
    return out
  }, [papers, inv1, inv2])

  const invigOptions = ['', ...TEACHER_POOL].map((t) => ({ value: t, label: t || '— Select —' }))

  const publish = () => {
    if (clashes.length) return
    toast.success('Datesheet published', `${exam?.name} datesheet sent to staff & parents.`)
    onClose()
  }

  return (
    <Drawer
      open={!!exam} onClose={onClose} width={620} icon="calendar"
      title="Datesheet" sub={exam ? `${exam.name} · ${exam.grades} · ${papers.length} papers` : ''}
      footer={
        <div className="row gap8 jc-between ai-center">
          <span className="t-xs muted">{clashes.length ? `${clashes.length} clash(es) to resolve` : 'No invigilator clashes'}</span>
          <div className="row gap8">
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
            {canPublish && (
              <Btn variant="primary" icon="check" disabled={clashes.length > 0} onClick={publish}>Publish datesheet</Btn>
            )}
          </div>
        </div>
      }
    >
      {clashes.length > 0 && (
        <div className="row ai-center gap8" style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 14, background: 'var(--danger-bg, rgba(220,38,38,.1))', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          <Icon name="alert" size={16} />
          <span className="t-sm fw6">Invigilator clash: {clashes.join('; ')} is assigned to two slots on the same day. Resolve to publish.</span>
        </div>
      )}

      <div className="col gap12">
        {papers.map((p) => {
          const clashed = (inv1[p.id] && inv1[p.id] === inv2[p.id])
          return (
            <div key={p.id} style={{ border: `1px solid ${clashed ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 12, padding: 14 }}>
              <div className="row ai-center jc-between" style={{ marginBottom: 10 }}>
                <div className="row ai-center gap10">
                  <span className="sm-card-ic"><Icon name="book" size={16} /></span>
                  <div>
                    <div className="fw6">{p.subject}</div>
                    <div className="t-xs muted">{fmtDate(p.date)} · 09:30 – 12:30</div>
                  </div>
                </div>
                <Badge tone="neutral">Paper {p.id + 1}</Badge>
              </div>
              <div className="sm-grid-3 gap12">
                <Field label="Room / hall">
                  <Input value={rooms[p.id] ?? ''} placeholder="e.g. Hall 1" onChange={(e) => setRooms((m) => ({ ...m, [p.id]: e.target.value }))} />
                </Field>
                <Field label="Invigilator 1" error={clashed ? 'Clash' : undefined}>
                  <Select options={invigOptions} value={inv1[p.id] ?? ''} onChange={(e) => setInv1((m) => ({ ...m, [p.id]: e.target.value }))} />
                </Field>
                <Field label="Invigilator 2" error={clashed ? 'Clash' : undefined}>
                  <Select options={invigOptions} value={inv2[p.id] ?? ''} onChange={(e) => setInv2((m) => ({ ...m, [p.id]: e.target.value }))} />
                </Field>
              </div>
            </div>
          )
        })}
      </div>
    </Drawer>
  )
}

/* ============================================================
   Tab 1 — Exams & tests list
   ============================================================ */
function ExamsListTab({ onDatesheet, onReports }: { onDatesheet: (e: Exam) => void; onReports: () => void }) {
  const app = useApp()
  const [createOpen, setCreateOpen] = useState(false)
  const editable = can(app.role, 'exams', 'E') || can(app.role, 'exams', 'A')

  const columns: Column<Exam>[] = [
    {
      key: 'name', label: 'Exam', sortValue: (e) => e.name,
      render: (e) => (
        <div>
          <div className="fw6">{e.name}</div>
          <div className="t-xs muted">{e.id} · {e.grades}</div>
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
          <Btn variant="ghost" size="sm" icon="clipboard" onClick={onReports}>Report cards</Btn>
        </div>
      ),
    },
  ]

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead title="Exam & test schedule" sub={`${app.exams.length} examinations`} icon="clipboard" />
        {editable
          ? <Btn variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>Create exam</Btn>
          : <Badge tone="neutral" icon="eye">View only</Badge>}
      </div>
      <DataTable<Exam>
        columns={columns}
        rows={app.exams}
        pageSize={10}
        rowKey={(e) => e.id}
        initialSort={{ key: 'dates', dir: 'asc' }}
        onRowClick={(e) => onDatesheet(e)}
        empty={<Empty icon="clipboard" title="No exams scheduled" body="Create an exam to build its datesheet." />}
      />
      <CreateExamModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  )
}

/* ============================================================
   Tab 2 — Marks entry grid (auto-grade, live pass/fail)
   ============================================================ */
function MarksEntryTab() {
  const app = useApp()
  const toast = useToast()
  const editable = can(app.role, 'exams', 'E')

  const [examId, setExamId] = useState(app.exams[0]?.id ?? '')
  const [grade, setGrade] = useState('VI')
  const [section, setSection] = useState('A')
  const [subject, setSubject] = useState(subjects[0])
  const cls = grade + '-' + section

  const roster = useMemo(
    () => students.filter((s) => s.cls === cls).sort((a, b) => a.roll - b.roll),
    [cls],
  )

  const loadMarks = (): Record<string, number> => {
    const out: Record<string, number> = {}
    roster.forEach((s) => {
      const saved = app.examMarks[markKey(examId, s.id, subject)]
      out[s.id] = saved ?? studentSubjectMarks(s, subject)
    })
    return out
  }

  const [marks, setMarks] = useState<Record<string, number>>(loadMarks)
  useEffect(() => { setMarks(loadMarks()) }, [roster, subject, examId])

  const setMark = (id: string, raw: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)))
    setMarks((m) => ({ ...m, [id]: n }))
  }

  const entered = roster.map((s) => marks[s.id] ?? 0)
  const avg = entered.length ? +(entered.reduce((a, b) => a + b, 0) / entered.length).toFixed(1) : 0
  const passCount = entered.filter((v) => v >= 33).length

  const exam = app.exams.find((e) => e.id === examId)

  const save = () => {
    if (!exam) { toast.danger('Pick an exam', 'Select an exam to save marks against.'); return }
    const entries: Record<string, number> = {}
    roster.forEach((s) => { entries[markKey(examId, s.id, subject)] = marks[s.id] ?? 0 })
    app.saveExamMarks(entries)
    const merged = { ...app.examMarks, ...entries }
    app.updateExam(examId, { status: 'marks_entry', marksEntered: marksProgress(merged, examId, exam.subjects) })
    toast.success('Marks saved', `${roster.length} entries saved for ${cls} · ${subject} · ${exam.name}.`)
  }

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead title="Marks entry" sub={`${cls} · ${subject} · ${roster.length} students`} icon="edit" />
        <div className="row gap8 ai-center wrap" style={{ marginLeft: 'auto' }}>
          <Select options={app.exams.map((e) => ({ value: e.id, label: e.name }))} value={examId} onChange={(e) => setExamId(e.target.value)} />
          <Select options={grades.slice(4)} value={grade} onChange={(e) => setGrade(e.target.value)} />
          <Select options={sections} value={section} onChange={(e) => setSection(e.target.value)} />
          <Select options={subjects} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      </div>

      {roster.length === 0 ? (
        <Empty icon="users" title="No students in this class" body="Pick another grade or section." />
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
              ? <Btn variant="primary" icon="check" onClick={save}>Save marks</Btn>
              : <Badge tone="neutral" icon="eye">View only</Badge>}
          </div>
        </>
      )}
    </Card>
  )
}

/* ============================================================
   Report card modal — printable
   ============================================================ */
function ReportCardModal({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const app = useApp()
  if (!student) return null
  const report = reportFor(student)
  const rank = classRank(student)

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
        {/* header */}
        <div className="row ai-center jc-between" style={{ padding: 18, background: 'var(--brand-50)', borderBottom: '1px solid var(--border)' }}>
          <div className="row ai-center gap12">
            <span className="sm-card-ic" style={{ width: 42, height: 42 }}><Icon name="cap" size={22} /></span>
            <div>
              <div className="fw7 t-lg">{app.school.name}</div>
              <div className="t-xs muted">Academic Year 2026–27 · Term Report Card</div>
            </div>
          </div>
          <Badge tone={report.result === 'PASS' ? 'success' : 'danger'} solid>{report.result}</Badge>
        </div>

        {/* student meta */}
        <div className="sm-grid-3 gap12" style={{ padding: 18 }}>
          <div><div className="t-xs muted">Student</div><div className="fw6">{student.name}</div></div>
          <div><div className="t-xs muted">Admission no</div><div className="fw6">{student.adm}</div></div>
          <div><div className="t-xs muted">Class · Roll</div><div className="fw6">{student.cls} · {student.roll}</div></div>
          <div><div className="t-xs muted">Guardian</div><div className="fw6">{student.guardian}</div></div>
          <div><div className="t-xs muted">Attendance</div><div className="fw6">{student.attendance}%</div></div>
          <div><div className="t-xs muted">Class rank</div><div className="fw6">{rank.rank} / {rank.classSize}</div></div>
        </div>

        {/* subject table */}
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

        {/* summary */}
        <div className="row ai-center jc-between wrap gap16" style={{ padding: 18, borderTop: '1px solid var(--border)' }}>
          <div className="row gap20 wrap">
            <div><div className="t-xs muted">Percentage</div><div className="fw7 t-lg">{report.pct}%</div></div>
            <div><div className="t-xs muted">Overall grade</div><div className="fw7 t-lg">{report.grade}</div></div>
            <div><div className="t-xs muted">GPA</div><div className="fw7 t-lg">{report.gpa}</div></div>
            <div><div className="t-xs muted">Result</div><div className="fw7 t-lg">{report.result}</div></div>
          </div>
          <div className="t-xs muted" style={{ textAlign: 'right' }}>
            Generated {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}<br />
            Class teacher · Principal signature
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ============================================================
   Tab 3 — Report cards grid
   ============================================================ */
function ReportCardsTab() {
  const [cls, setCls] = useState('VI-A')
  const [open, setOpen] = useState<Student | null>(null)

  const roster = useMemo(
    () => students.filter((s) => s.cls === cls).sort((a, b) => a.roll - b.roll),
    [cls],
  )

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead title="Report cards" sub={`${cls} · ${roster.length} students`} icon="clipboard" />
        <div style={{ marginLeft: 'auto' }}>
          <Select options={clsOptions} value={cls} onChange={(e) => setCls(e.target.value)} />
        </div>
      </div>

      {roster.length === 0 ? (
        <Empty icon="users" title="No students in this class" body="Pick another class to preview report cards." />
      ) : (
        <div className="sm-grid-3 gap12" style={{ padding: 16 }}>
          {roster.map((s) => {
            const report = reportFor(s)
            const rank = classRank(s)
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
      <ReportCardModal student={open} onClose={() => setOpen(null)} />
    </Card>
  )
}

/* ============================================================
   ExamsScreen — hub with internal tabs
   ============================================================ */
function ExamsScreen() {
  const app = useApp()
  const [tab, setTab] = useState('exams')
  const [datesheetExam, setDatesheetExam] = useState<Exam | null>(null)

  const tabs = [
    { value: 'exams', label: 'Exams & tests', icon: 'clipboard' },
    { value: 'marks', label: 'Marks entry', icon: 'edit' },
    { value: 'reports', label: 'Report cards', icon: 'cap' },
  ]

  return (
    <div>
      <PageHead title="Exams & grading" sub={`Scheduling · marks · report cards · ${app.school.name}`} />
      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
      </div>

      {tab === 'exams' && <ExamsListTab onDatesheet={setDatesheetExam} onReports={() => setTab('reports')} />}
      {tab === 'marks' && <MarksEntryTab />}
      {tab === 'reports' && <ReportCardsTab />}

      <DatesheetDrawer exam={datesheetExam} onClose={() => setDatesheetExam(null)} />
    </div>
  )
}

import type { ComponentType } from 'react'
export const examsScreens: Record<string, ComponentType> = { 'school.exams': ExamsScreen }
