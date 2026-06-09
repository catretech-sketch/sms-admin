/* ============================================================
   SchoolMate — Students (SIS) list + Student 360 profile.
   Phase 1 flagship screen. Frontend-only, mock data.
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import {
  PageHead, Card, CardHead, Btn, Badge, Avatar, Search, Select,
  Drawer, Tabs, Icon, Empty, Progress, Spark, Bars, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui'
import { grades } from '@/data/mockDb'
import { reportFor, classRank, attendanceMonths, fmtMoney } from '@/lib/format'
import type { Student, FeeStatus } from '@/types'

/* ---------- shared helpers ---------- */
const feeTone: Record<FeeStatus, BadgeTone> = { paid: 'success', partial: 'warning', due: 'danger' }
const feeLabel: Record<FeeStatus, string> = { paid: 'Paid', partial: 'Partial', due: 'Due' }
const attColor = (v: number): string => (v >= 90 ? 'var(--success)' : v >= 80 ? 'var(--brand-600)' : v >= 75 ? 'var(--warning)' : 'var(--danger)')

function canEdit(role: string): boolean {
  return role === 'admin' || role === 'principal' || role === 'vice_principal'
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
   StudentsScreen — SIS list
   ============================================================ */
function StudentsScreen() {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [grade, setGrade] = useState('all')
  const [status, setStatus] = useState('all')
  const [fee, setFee] = useState('all')
  const [importOpen, setImportOpen] = useState(false)

  const editable = canEdit(app.role)
  const students = app.students

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return students.filter((s) => {
      if (needle && !(s.name.toLowerCase().includes(needle) || s.adm.toLowerCase().includes(needle) || s.cls.toLowerCase().includes(needle))) return false
      if (grade !== 'all' && s.grade !== grade) return false
      if (status !== 'all' && s.status !== status) return false
      if (fee !== 'all' && s.feeStatus !== fee) return false
      return true
    })
  }, [students, q, grade, status, fee])

  const columns: Column<Student>[] = [
    {
      key: 'name', label: 'Student', sortValue: (s) => s.name,
      render: (s) => (
        <div className="row ai-center gap10">
          <Avatar name={s.name} hue={s.avatarHue} size={34} />
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
          <div className="t-xs muted">Roll {s.roll}</div>
        </div>
      ),
    },
    {
      key: 'guardian', label: 'Guardian', sortValue: (s) => s.guardian,
      render: (s) => (
        <div>
          <div>{s.guardian}</div>
          <div className="t-xs muted">{s.phone}</div>
        </div>
      ),
    },
    {
      key: 'attendance', label: 'Attendance', align: 'left', sortValue: (s) => s.attendance,
      render: (s) => (
        <div className="row ai-center gap8" style={{ minWidth: 120 }}>
          <div style={{ flex: 1 }}><Progress value={s.attendance} color={attColor(s.attendance)} /></div>
          <span className="t-sm fw6" style={{ width: 34 }}>{s.attendance}%</span>
        </div>
      ),
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

  const sub = `${rows.length} of ${students.length} students · ${app.school.name}`

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

      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search name, admission no, class…" style={{ flex: 1, minWidth: 220 }} />
          <Select options={['all', ...grades.slice(4)]} value={grade} onChange={(e) => setGrade(e.target.value)} />
          <Select options={[{ value: 'all', label: 'All status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} value={status} onChange={(e) => setStatus(e.target.value)} />
          <Select options={[{ value: 'all', label: 'All fees' }, { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'due', label: 'Due' }]} value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>

        <DataTable<Student>
          columns={columns}
          rows={rows}
          pageSize={12}
          rowKey={(s) => s.id}
          initialSort={{ key: 'name', dir: 'asc' }}
          bulk
          onRowClick={(s) => app.go('school.student', { focus: s.id })}
          bulkActions={(selected, clear) => (
            <>
              <Btn variant="secondary" size="sm" icon="message" onClick={() => { toast.success('Message queued', `Sent to ${selected.length} guardian(s).`); clear() }}>Message</Btn>
              <Btn variant="secondary" size="sm" icon="arrowRight" onClick={() => { toast.success('Promoted', `${selected.length} student(s) advanced.`); clear() }}>Promote</Btn>
              <Btn variant="ghost" size="sm" onClick={clear}>Clear</Btn>
            </>
          )}
          empty={<Empty icon="users" title="No students match" body="Try adjusting the search or filters." />}
        />
      </Card>

      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
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

function Student360() {
  const app = useApp()
  const toast = useToast()
  const [tab, setTab] = useState('overview')

  const stu = app.students.find((s) => s.id === app.focus) ?? app.students[0]
  const report = reportFor(stu)
  const rank = classRank(stu)
  const months = attendanceMonths(stu)

  const tabs = [
    { value: 'overview', label: 'Overview', icon: 'grid' },
    { value: 'academics', label: 'Academics', icon: 'cap' },
    { value: 'attendance', label: 'Attendance', icon: 'calendar' },
    { value: 'fees', label: 'Fees', icon: 'rupee' },
    { value: 'documents', label: 'Documents', icon: 'doc' },
    { value: 'timeline', label: 'Timeline', icon: 'clock' },
  ]

  /* sample fee ledger derived from the student's status */
  const ledger = [
    { id: 'INV-2026-T1', label: 'Term 1 tuition', amount: 48000, paid: 48000, date: '12 Apr 2026' },
    { id: 'INV-2026-T2', label: 'Term 2 tuition', amount: 48000, paid: stu.feeStatus === 'paid' ? 48000 : stu.feeStatus === 'partial' ? 48000 - stu.feeDue : 0, date: stu.feeStatus === 'due' ? '— pending' : '18 Aug 2026' },
    { id: 'INV-2026-TR', label: 'Transport (annual)', amount: 18000, paid: 18000, date: '12 Apr 2026' },
  ]

  const docs = [
    { name: 'Birth certificate', type: 'PDF', size: '212 KB', on: 'Verified' },
    { name: 'Aadhaar card', type: 'PDF', size: '180 KB', on: 'Verified' },
    { name: 'Previous report card', type: 'PDF', size: '344 KB', on: 'Verified' },
    { name: 'Medical record', type: 'PDF', size: '96 KB', on: 'Pending' },
    { name: 'Passport photo', type: 'JPG', size: '64 KB', on: 'Verified' },
  ]

  const timeline = [
    { tone: 'var(--success)', title: 'Fee payment received', body: '₹48,000 — Term 1 tuition', time: '12 Apr 2026' },
    { tone: 'var(--brand-600)', title: 'Promoted to ' + stu.cls, body: 'Academic year 2026–27', time: '01 Apr 2026' },
    { tone: 'var(--warning)', title: 'Late arrival', body: 'Marked late · bus delay', time: '22 Mar 2026' },
    { tone: 'var(--brand-600)', title: 'Won inter-house quiz', body: stu.house + ' house · 2nd place', time: '14 Mar 2026' },
    { tone: 'var(--success)', title: 'Enrolled', body: 'Admission ' + stu.adm, time: '02 Apr 2025' },
  ]

  return (
    <div>
      <div className="row ai-center gap12" style={{ marginBottom: 16 }}>
        <Btn variant="ghost" icon="arrowLeft" onClick={() => app.go('school.sis')}>Back to students</Btn>
      </div>

      {/* Header card */}
      <Card>
        <div className="row ai-center gap16 wrap jc-between">
          <div className="row ai-center gap16">
            <Avatar name={stu.name} hue={stu.avatarHue} size={68} />
            <div>
              <div className="row ai-center gap8">
                <h2 className="sm-pagehead-title" style={{ margin: 0 }}>{stu.name}</h2>
                <Badge tone={stu.status === 'active' ? 'success' : 'neutral'}>{stu.status === 'active' ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="row ai-center gap12 wrap muted t-sm" style={{ marginTop: 4 }}>
                <span>{stu.adm}</span><span>·</span>
                <span>Class {stu.cls} · Roll {stu.roll}</span><span>·</span>
                <span>{stu.house} House</span><span>·</span>
                <span>{stu.guardian} · {stu.phone}</span>
              </div>
            </div>
          </div>
          <div className="row ai-center gap20 wrap">
            <StatTile icon="calendar" label="Attendance" value={stu.attendance + '%'} color={attColor(stu.attendance)} />
            <StatTile icon="cap" label={`Rank · ${rank.rank}/${rank.classSize}`} value={report.pct + '%'} color="var(--brand-600)" />
            <StatTile icon="rupee" label="Fee status" value={feeLabel[stu.feeStatus]} color={`var(--${feeTone[stu.feeStatus] === 'success' ? 'success' : feeTone[stu.feeStatus] === 'warning' ? 'warning' : 'danger'})`} />
            <Btn variant="secondary" icon="message" onClick={() => toast.success('Message sent', `Notified ${stu.guardian}.`)}>Message</Btn>
          </div>
        </div>
      </Card>

      <div style={{ margin: '16px 0' }}>
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
      </div>

      {/* ---- Overview ---- */}
      {tab === 'overview' && (
        <div className="sm-grid-2 gap16">
          <Card>
            <CardHead title="Performance by subject" sub="Latest term · marks out of 100" icon="cap" />
            <Bars data={report.rows.map((r) => ({ label: r.subject.slice(0, 4), value: r.marks, color: attColor(r.marks) }))} h={150} valueFmt={(v) => v} />
          </Card>
          <Card>
            <CardHead title="Snapshot" icon="user" />
            <div className="col gap14" style={{ marginTop: 8 }}>
              <div className="row ai-center jc-between"><span className="muted t-sm">Overall</span><span className="fw7">{report.pct}% · {report.grade}</span></div>
              <div className="row ai-center jc-between"><span className="muted t-sm">Class rank</span><span className="fw7">{rank.rank} / {rank.classSize}</span></div>
              <div className="row ai-center jc-between"><span className="muted t-sm">GPA</span><span className="fw7">{report.gpa}</span></div>
              <div className="row ai-center jc-between"><span className="muted t-sm">Result</span><Badge tone={report.result === 'PASS' ? 'success' : 'danger'}>{report.result}</Badge></div>
              <div className="row ai-center jc-between"><span className="muted t-sm">Attendance trend</span><Spark data={months.map((m) => m.value)} w={120} color={attColor(stu.attendance)} /></div>
              <div className="row ai-center jc-between"><span className="muted t-sm">Outstanding fees</span><span className="fw7">{fmtMoney(stu.feeDue)}</span></div>
            </div>
          </Card>
        </div>
      )}

      {/* ---- Academics ---- */}
      {tab === 'academics' && (
        <Card pad={false}>
          <div style={{ padding: 16 }}>
            <CardHead
              title="Subject-wise marks"
              sub={`Overall ${report.pct}% · Grade ${report.grade} · Rank ${rank.rank}/${rank.classSize} · GPA ${report.gpa}`}
              icon="cap"
              action={<Badge tone={report.result === 'PASS' ? 'success' : 'danger'}>{report.result}</Badge>}
            />
          </div>
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
        </Card>
      )}

      {/* ---- Attendance ---- */}
      {tab === 'attendance' && (
        <Card>
          <CardHead title="Monthly attendance" sub={`Year average ${stu.attendance}%`} icon="calendar" />
          <Bars data={months.map((m) => ({ label: m.label, value: m.value, color: attColor(m.value) }))} h={160} valueFmt={(v) => v + '%'} />
          <div className="row ai-center gap20 wrap" style={{ marginTop: 16 }}>
            <StatTile icon="check" label="Best month" value={Math.max(...months.map((m) => m.value)) + '%'} color="var(--success)" />
            <StatTile icon="alert" label="Lowest month" value={Math.min(...months.map((m) => m.value)) + '%'} color="var(--warning)" />
            <StatTile icon="trend" label="Trend" value={months[months.length - 1].value >= months[0].value ? 'Improving' : 'Declining'} color="var(--brand-600)" />
          </div>
        </Card>
      )}

      {/* ---- Fees ---- */}
      {tab === 'fees' && (
        <Card pad={false}>
          <div style={{ padding: 16 }}>
            <CardHead
              title="Fee ledger"
              sub={`Outstanding ${fmtMoney(stu.feeDue)}`}
              icon="rupee"
              action={<Badge tone={feeTone[stu.feeStatus]} dot>{feeLabel[stu.feeStatus]}</Badge>}
            />
          </div>
          <table className="sm-table">
            <thead>
              <tr><th>Invoice</th><th>Description</th><th className="ta-right">Amount</th><th className="ta-right">Paid</th><th className="ta-right">Balance</th><th>Date</th></tr>
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
        </Card>
      )}

      {/* ---- Documents ---- */}
      {tab === 'documents' && (
        <Card>
          <CardHead title="Documents" sub={`${docs.length} files on record`} icon="doc" action={<Btn variant="secondary" size="sm" icon="upload" onClick={() => toast.info('Upload', 'Choose a file to attach to this student.')}>Upload</Btn>} />
          <div className="col gap8" style={{ marginTop: 8 }}>
            {docs.map((d) => (
              <div key={d.name} className="row ai-center jc-between" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div className="row ai-center gap12">
                  <span className="sm-card-ic"><Icon name="doc" size={16} /></span>
                  <div>
                    <div className="fw6">{d.name}</div>
                    <div className="t-xs muted">{d.type} · {d.size}</div>
                  </div>
                </div>
                <div className="row ai-center gap8">
                  <Badge tone={d.on === 'Verified' ? 'success' : 'warning'}>{d.on}</Badge>
                  <Btn variant="ghost" size="sm" icon="download" onClick={() => toast.success('Downloading', d.name)}>Download</Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---- Timeline ---- */}
      {tab === 'timeline' && (
        <Card>
          <CardHead title="Activity timeline" sub="Recent events" icon="clock" />
          <div className="col" style={{ marginTop: 8 }}>
            {timeline.map((t, i) => (
              <div key={i} className="row gap12" style={{ paddingBottom: 16 }}>
                <div className="col ai-center" style={{ width: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: t.tone, marginTop: 4, flex: '0 0 auto' }} />
                  {i < timeline.length - 1 && <span style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="row ai-center jc-between">
                    <span className="fw6">{t.title}</span>
                    <span className="t-xs muted">{t.time}</span>
                  </div>
                  <div className="t-sm muted">{t.body}</div>
                </div>
              </div>
            ))}
          </div>
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
