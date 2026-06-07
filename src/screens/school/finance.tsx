/* ============================================================
   SchoolMate — Fees collection + HR & Payroll.
   Phase 3 screens. Frontend-only, deterministic mock data.
   HR is owned by the Admin office (payroll prepared by Admin,
   Principal only approves). No separate HR persona.
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can } from '@/lib/gating'
import {
  PageHead, Card, CardHead, Kpi, Btn, Badge, Avatar, Search, Select, Field, Input,
  Modal, Icon, Empty, Bars, DataTable, type Column, type BadgeTone,
} from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { students, teachers, staff, grades } from '@/data/mockDb'
import { fmtMoney, fmtNum } from '@/lib/format'
import type { Student, Teacher, Staff, FeeStatus } from '@/types'

/* ============================================================
   Fees collection
   ============================================================ */
const feeTone: Record<FeeStatus, BadgeTone> = { paid: 'success', partial: 'warning', due: 'danger' }
const feeLabel: Record<FeeStatus, string> = { paid: 'Paid', partial: 'Partial', due: 'Due' }
const PAY_MODES = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque']

interface FeeRow { stu: Student; term: number; paid: number; due: number; status: FeeStatus }

/* term fee scales gently with grade level (deterministic) */
function termFeeFor(grade: string): number {
  const level = Math.max(0, grades.indexOf(grade))
  return 36000 + level * 1200
}

function buildFeeRow(s: Student): FeeRow {
  const term = termFeeFor(s.grade)
  const due = s.feeStatus === 'paid'
    ? 0
    : s.feeStatus === 'partial'
      ? Math.min(s.feeDue || Math.round(term * 0.4), term)
      : term
  return { stu: s, term, paid: term - due, due, status: s.feeStatus }
}

/* ---------- Record-payment modal ---------- */
function PaymentModal({ row, cur, onClose }: { row: FeeRow; cur: string; onClose: () => void }) {
  const toast = useToast()
  const [amount, setAmount] = useState(String(row.due || row.term))
  const [mode, setMode] = useState(PAY_MODES[1])
  const [ref, setRef] = useState('')

  const submit = () => {
    const n = Number(amount)
    if (!n || n <= 0) { toast.danger('Amount required', 'Enter a valid payment amount.'); return }
    toast.success('Payment recorded', `${fmtMoney(n, cur)} · ${mode} · ${row.stu.name} (${row.stu.cls})`)
    onClose()
  }

  return (
    <Modal
      open onClose={onClose} icon="rupee" size="sm"
      title="Record payment" sub={`${row.stu.name} · ${row.stu.cls} · Outstanding ${fmtMoney(row.due, cur)}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>Record payment</Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Amount" required hint={`Term fee ${fmtMoney(row.term, cur)} · paid so far ${fmtMoney(row.paid, cur)}.`}>
          <Input icon="rupee" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Payment mode" required>
          <Select options={PAY_MODES} value={mode} onChange={(e) => setMode(e.target.value)} />
        </Field>
        <Field label="Reference / receipt no." hint="UPI ref, cheque no. or transaction id.">
          <Input icon="clipboard" value={ref} placeholder="e.g. UPI-8842019" onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ---------- Waiver modal (Principal approves) ---------- */
function WaiverModal({ row, cur, onClose }: { row: FeeRow; cur: string; onClose: () => void }) {
  const toast = useToast()
  const [amount, setAmount] = useState(String(row.due))
  const [reason, setReason] = useState('Financial hardship')

  const submit = () => {
    const n = Number(amount)
    if (!n || n <= 0) { toast.danger('Amount required', 'Enter the waiver amount to approve.'); return }
    toast.success('Waiver approved', `${fmtMoney(n, cur)} waived for ${row.stu.name} · ${reason}.`)
    onClose()
  }

  return (
    <Modal
      open onClose={onClose} icon="shield" size="sm"
      title="Approve fee waiver" sub={`${row.stu.name} · ${row.stu.cls}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="success" icon="check" onClick={submit}>Approve waiver</Btn>
        </div>
      }
    >
      <div className="col gap16">
        <div className="row ai-center gap8 t-sm muted">
          <Icon name="shield" size={14} />
          Waivers require Principal approval and are written to the audit trail.
        </div>
        <Field label="Waiver amount" required hint={`Outstanding due ${fmtMoney(row.due, cur)}.`}>
          <Input icon="rupee" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Reason" required>
          <Select options={['Financial hardship', 'Staff ward concession', 'Sibling discount', 'Scholarship', 'Merit award']} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function FeesScreen() {
  const app = useApp()
  const cur = app.school.currency
  const canRecord = can(app.role, 'fees', 'E')
  const canWaive = can(app.role, 'fees', 'A')

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [payRow, setPayRow] = useState<FeeRow | null>(null)
  const [waiveRow, setWaiveRow] = useState<FeeRow | null>(null)

  const all = useMemo(() => students.map(buildFeeRow), [])

  /* deterministic finance totals */
  const totals = useMemo(() => {
    const billed = all.reduce((a, r) => a + r.term, 0)
    const paid = all.reduce((a, r) => a + r.paid, 0)
    const due = all.reduce((a, r) => a + r.due, 0)
    const defaulters = all.filter((r) => r.status === 'due').length
    return { billed, paid, due, defaulters, pct: Math.round((paid / (billed || 1)) * 100) }
  }, [all])

  /* sample "received today" stream (deterministic, drives KPI + live cue) */
  const todays = useMemo(() => all.filter((r) => r.paid > 0).slice(0, 6), [all])
  const collectedToday = useMemo(() => todays.reduce((a, r) => a + r.stu.roll * 900 + 4000, 0), [todays])
  const latest = todays[0]

  /* collection % by class */
  const byClass = useMemo(() =>
    grades.slice(4)
      .map((g) => {
        const rs = all.filter((r) => r.stu.grade === g)
        const billed = rs.reduce((a, r) => a + r.term, 0)
        const paid = rs.reduce((a, r) => a + r.paid, 0)
        return { label: g, value: billed ? Math.round((paid / billed) * 100) : 0, n: rs.length }
      })
      .filter((d) => d.n > 0), [all])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((r) => {
      if (needle && !(r.stu.name.toLowerCase().includes(needle) || r.stu.cls.toLowerCase().includes(needle) || r.stu.adm.toLowerCase().includes(needle))) return false
      if (status !== 'all' && r.status !== status) return false
      return true
    })
  }, [all, q, status])

  const columns: Column<FeeRow>[] = [
    {
      key: 'name', label: 'Student', sortValue: (r) => r.stu.name,
      render: (r) => (
        <div className="row ai-center gap10">
          <Avatar name={r.stu.name} hue={r.stu.avatarHue} size={34} />
          <div>
            <div className="fw6">{r.stu.name}</div>
            <div className="t-xs muted">{r.stu.cls} · Roll {r.stu.roll}</div>
          </div>
        </div>
      ),
    },
    { key: 'term', label: 'Term fee', align: 'right', sortValue: (r) => r.term, render: (r) => fmtMoney(r.term, cur) },
    { key: 'paid', label: 'Paid', align: 'right', sortValue: (r) => r.paid, render: (r) => fmtMoney(r.paid, cur) },
    {
      key: 'due', label: 'Due', align: 'right', sortValue: (r) => r.due,
      render: (r) => <span className={r.due > 0 ? 'fw6' : 'muted'} style={r.due > 0 ? { color: 'var(--danger)' } : undefined}>{fmtMoney(r.due, cur)}</span>,
    },
    {
      key: 'status', label: 'Status', align: 'center', sortValue: (r) => r.status,
      render: (r) => <Badge tone={feeTone[r.status]} dot>{feeLabel[r.status]}</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <div className="row gap6 jc-end">
          {canRecord && <Btn size="sm" variant="secondary" icon="rupee" onClick={() => setPayRow(r)}>Record</Btn>}
          {canWaive && r.due > 0 && <Btn size="sm" variant="ghost" icon="shield" onClick={() => setWaiveRow(r)}>Waiver</Btn>}
          {!canRecord && !canWaive && <span className="t-xs muted">—</span>}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHead
        title="Fees collection"
        sub={`${app.school.name} · ${totals.pct}% of term billed collected`}
        actions={
          <>
            <Btn variant="secondary" icon="bell" onClick={() => app.go('school.communication', { intent: 'fee-reminder' })}>Send reminders</Btn>
            <Btn variant="secondary" icon="download" onClick={() => { /* export stub */ }}>Export</Btn>
          </>
        }
      />

      {/* Live "payment received" cue */}
      {latest && (
        <Card className="row ai-center jc-between gap12 wrap" style={{ marginBottom: 16, borderColor: 'var(--success)' }}>
          <div className="row ai-center gap10">
            <span className="sm-dot-live" />
            <span className="sm-kpi-ic" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}><Icon name="rupee" size={18} /></span>
            <div>
              <div className="fw6">Payment received · {fmtMoney(latest.stu.roll * 900 + 4000, cur)}</div>
              <div className="t-xs muted">{latest.stu.name} ({latest.stu.cls}) · just now via UPI</div>
            </div>
          </div>
          <Badge tone="success" soft>Live</Badge>
        </Card>
      )}

      {/* KPIs */}
      <div className="sm-kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi icon="rupee" iconBg="var(--success-bg)" iconColor="var(--success)" label="Collected today" value={fmtMoney(collectedToday, cur)} foot={`${todays.length} payments`} />
        <Kpi icon="wallet" iconBg="var(--brand-50)" iconColor="var(--brand-600)" label="Collected this term" value={fmtMoney(totals.paid, cur)} delta={`${totals.pct}%`} deltaDir="up" foot={`of ${fmtMoney(totals.billed, cur)} billed`} />
        <Kpi icon="alert" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Outstanding dues" value={fmtMoney(totals.due, cur)} foot="across all classes" />
        <Kpi icon="users" iconBg="var(--danger-bg)" iconColor="var(--danger)" label="Defaulters" value={fmtNum(totals.defaulters)} foot="students with full dues" />
      </div>

      {/* Collection by class */}
      <Card style={{ marginBottom: 16 }}>
        <CardHead title="Collection by class" sub="Share of term fee collected" icon="trend" />
        <div style={{ marginTop: 12 }}>
          <Bars data={byClass} h={150} color="var(--success)" valueFmt={(v) => `${v}%`} />
        </div>
      </Card>

      {/* Table */}
      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search student, class, admission no…" style={{ flex: 1, minWidth: 220 }} />
          <Select
            options={[{ value: 'all', label: 'All status' }, { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'due', label: 'Due' }]}
            value={status} onChange={(e) => setStatus(e.target.value)}
          />
        </div>
        <DataTable<FeeRow>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(r) => r.stu.id}
          initialSort={{ key: 'due', dir: 'desc' }}
          empty={<Empty icon="wallet" title="No matching records" body="Try adjusting the search or status filter." />}
        />
      </Card>

      {payRow && <PaymentModal key={payRow.stu.id} row={payRow} cur={cur} onClose={() => setPayRow(null)} />}
      {waiveRow && <WaiverModal key={waiveRow.stu.id} row={waiveRow} cur={cur} onClose={() => setWaiveRow(null)} />}
    </div>
  )
}

/* ============================================================
   HR & Payroll (Gold) — owned by the Admin office
   ============================================================ */
interface PayRow { id: string; name: string; role: string; dept: string; hue: number; gross: number; ded: number; net: number }

function teacherPay(t: Teacher): { gross: number; ded: number; net: number } {
  const desigBump = t.desig === 'HOD' ? 12000 : t.desig === 'PGT' ? 6000 : t.desig === 'Senior Teacher' ? 5000 : t.desig === 'TGT' ? 3000 : 0
  const gross = 28000 + t.exp * 1600 + desigBump + Math.round(t.rating * 1000)
  const ded = Math.round(gross * 0.12)
  return { gross, ded, net: gross - ded }
}

function staffPay(s: Staff): { gross: number; ded: number; net: number } {
  const base = s.cat === 'admin' ? 22000 : s.cat === 'academic' ? 20000 : s.cat === 'transport' ? 17000 : s.cat === 'security' ? 16000 : 14000
  const shiftBump = s.shift === 'Rotational' ? 2500 : s.shift === 'Evening' ? 1500 : 0
  const gross = base + shiftBump
  const ded = Math.round(gross * 0.09)
  return { gross, ded, net: gross - ded }
}

function PayrollBody() {
  const app = useApp()
  const cur = app.school.currency
  const canRun = can(app.role, 'hr', 'E')
  const canApprove = can(app.role, 'hr', 'A')
  const toast = useToast()
  const [q, setQ] = useState('')
  const [ran, setRan] = useState(false)
  const [approved, setApproved] = useState(false)

  const all = useMemo<PayRow[]>(() => [
    ...teachers.map((t) => ({ id: t.id, name: t.name, role: t.desig, dept: t.dept, hue: t.avatarHue, ...teacherPay(t) })),
    ...staff.map((s) => ({ id: s.id, name: s.name, role: s.role, dept: s.dept, hue: s.avatarHue, ...staffPay(s) })),
  ], [])

  const totals = useMemo(() => ({
    count: all.length,
    gross: all.reduce((a, r) => a + r.gross, 0),
    ded: all.reduce((a, r) => a + r.ded, 0),
    net: all.reduce((a, r) => a + r.net, 0),
  }), [all])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all.filter((r) => r.name.toLowerCase().includes(needle) || r.role.toLowerCase().includes(needle) || r.dept.toLowerCase().includes(needle))
  }, [all, q])

  const runPayroll = () => { setRan(true); toast.success('Payroll run', 'Prepared by Admin office. Sent to the Principal for approval.') }
  const approve = () => { setApproved(true); toast.success('Payroll approved', `June 2026 · ${fmtMoney(totals.net, cur)} net cleared for disbursal.`) }

  const statusBadge = approved
    ? <Badge tone="success" icon="check">Approved</Badge>
    : ran
      ? <Badge tone="info" dot>Awaiting Principal approval</Badge>
      : <Badge tone="warning" dot>Awaiting Admin to run</Badge>

  const columns: Column<PayRow>[] = [
    {
      key: 'name', label: 'Staff', sortValue: (r) => r.name,
      render: (r) => (
        <div className="row ai-center gap10">
          <Avatar name={r.name} hue={r.hue} size={34} />
          <div>
            <div className="fw6">{r.name}</div>
            <div className="t-xs muted">{r.id}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role', label: 'Role / Dept', sortValue: (r) => r.dept,
      render: (r) => (
        <div>
          <div className="fw6">{r.role}</div>
          <div className="t-xs muted">{r.dept}</div>
        </div>
      ),
    },
    { key: 'gross', label: 'Gross', align: 'right', sortValue: (r) => r.gross, render: (r) => fmtMoney(r.gross, cur) },
    { key: 'ded', label: 'Deductions', align: 'right', sortValue: (r) => r.ded, render: (r) => <span className="muted">− {fmtMoney(r.ded, cur)}</span> },
    { key: 'net', label: 'Net pay', align: 'right', sortValue: (r) => r.net, render: (r) => <span className="fw7">{fmtMoney(r.net, cur)}</span> },
  ]

  return (
    <div>
      <PageHead
        title="HR & Payroll"
        sub={`${app.school.name} · June 2026 cycle · Prepared by Admin office`}
        actions={
          <div className="row ai-center gap8 wrap">
            {statusBadge}
            <Btn variant="primary" icon="refresh" disabled={!canRun || ran} onClick={runPayroll}>{ran ? 'Payroll run' : 'Run payroll'}</Btn>
            <Btn variant="success" icon="check" disabled={!canApprove || !ran || approved} onClick={approve}>Approve</Btn>
          </div>
        }
      />

      {/* Ownership note */}
      <Card className="row ai-center gap10 wrap" style={{ marginBottom: 16 }}>
        <span className="sm-kpi-ic" style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}><Icon name="briefcase" size={18} /></span>
        <div className="t-sm">
          <span className="fw6">HR is handled by the Admin office.</span>{' '}
          <span className="muted">Admin runs the monthly payroll; the Principal reviews and approves before disbursal.</span>
        </div>
      </Card>

      {/* KPIs */}
      <div className="sm-kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi icon="users" iconBg="var(--brand-50)" iconColor="var(--brand-600)" label="Staff on payroll" value={fmtNum(totals.count)} foot="teaching + support" />
        <Kpi icon="wallet" iconBg="var(--info-bg)" iconColor="var(--info)" label="Gross payroll" value={fmtMoney(totals.gross, cur)} foot="before deductions" />
        <Kpi icon="rupee" iconBg="var(--success-bg)" iconColor="var(--success)" label="Net payable" value={fmtMoney(totals.net, cur)} foot={`${fmtMoney(totals.ded, cur)} deductions`} />
        <Kpi icon="clock" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Pending" value={approved ? fmtMoney(0, cur) : fmtMoney(totals.net, cur)} foot={approved ? 'cleared' : ran ? 'awaiting approval' : 'awaiting Admin to run'} />
      </div>

      {/* Run table */}
      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search staff, role, department…" style={{ flex: 1, minWidth: 220 }} />
          <span className="t-sm muted">{rows.length} of {all.length} staff</span>
        </div>
        <DataTable<PayRow>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(r) => r.id}
          initialSort={{ key: 'net', dir: 'desc' }}
          empty={<Empty icon="briefcase" title="No matching staff" body="Try a different search." />}
        />
      </Card>
    </div>
  )
}

function PayrollScreen() {
  return (
    <TierGate feature="hr_payroll" title="HR & Payroll" blurb="HR & Payroll is part of the Gold plan.">
      <PayrollBody />
    </TierGate>
  )
}

/* ---------- export contract ---------- */
export const financeScreens: Record<string, ComponentType> = {
  'school.fees': FeesScreen,
  'school.hr': PayrollScreen,
}
