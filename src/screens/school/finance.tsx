/* ============================================================
   SchoolMate — Fees collection + HR & Payroll.
   Phase 3 screens. Frontend-only, deterministic mock data.
   HR is owned by the Admin office (payroll prepared by Admin,
   Principal only approves). No separate HR persona.
   ============================================================ */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { useFeePayments, usePayInvoice, useCreateFeeRazorpayOrder, useVerifyFeeRazorpayPayment } from '@/api/hooks/useFeePayments'
import { useSchoolIntegrations } from '@/api/hooks/useSchoolIntegrations'
import { loadRazorpayScript } from '@/api/upgradeRequests'
import { useFeeHeads, useCreateFeeHead, useDeleteFeeHead } from '@/api/hooks/useFeeHeads'
import { useFeeStructure, useSaveFeeStructure } from '@/api/hooks/useFeeStructure'
import { useFeeInvoices, useGenerateFeeInvoices } from '@/api/hooks/useFeeInvoices'
import { useFeeReportSummary } from '@/api/hooks/useFeeReports'
import { useClasses } from '@/api/hooks/useClasses'
import { useSendFeeReminders } from '@/api/hooks/useFeeReminders'
import { notifyFeeAudience } from '@/lib/feeNotify'
import { getStudent } from '@/api/students'
import { can } from '@/lib/gating'
import {
  PageHead, Card, CardHead, Kpi, Btn, Badge, Avatar, Search, Select, Field, Input,
  Modal, Tabs, Icon, Empty, Bars, DataTable, Checkbox, type Column, type BadgeTone,
  DemoBadge,
} from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { teachers, staff, grades } from '@/data/mockDb'
import { gradeRank } from '@/lib/defaultClasses'
import { fmtMoney, fmtNum } from '@/lib/format'
import type { Teacher, Staff, FeeStatus, FeeType, FeePayment, FeeHead, FeeInvoice } from '@/types'

/* ============================================================
   Fees collection
   ============================================================ */
/** Best-effort parent receipt after an offline payment — never surfaces errors to the pay flow. */
async function notifyReceiptBestEffort(invoice: FeeInvoice, amount: number, mode: string, schoolName: string, cur: string) {
  try {
    const student = await getStudent(invoice.studentId)
    const emails = [student.email, student.father?.email, student.mother?.email].filter((v): v is string => !!v)
    const phones = [student.phone, student.father?.phone, student.mother?.phone].filter((v): v is string => !!v)
    if (!emails.length && !phones.length) return
    await notifyFeeAudience({
      kind: 'receipt',
      schoolName,
      studentName: invoice.studentName,
      amount,
      mode,
      currency: cur,
      channels: { email: emails.length > 0, sms: phones.length > 0, app: true },
      emails,
      phones,
    })
  } catch {
    /* best-effort — payment already succeeded */
  }
}

const feeTone: Record<FeeStatus, BadgeTone> = { paid: 'success', partial: 'warning', due: 'danger' }
const feeLabel: Record<FeeStatus, string> = { paid: 'Paid', partial: 'Partial', due: 'Due' }
const PAY_MODES = ['Cash', 'UPI (manual)', 'Cheque', 'Card / POS', 'Bank transfer', 'DD']
const ALL_MODES = [...PAY_MODES, 'Razorpay']
const feeTypeMeta: Record<FeeType, { label: string; tone: BadgeTone }> = {
  academic: { label: 'Academic', tone: 'brand' },
  transport: { label: 'Transport (Bus)', tone: 'info' },
  other: { label: 'Other', tone: 'neutral' },
}
const FEE_TYPE_OPTS = (Object.keys(feeTypeMeta) as FeeType[]).map((v) => ({ value: v, label: feeTypeMeta[v].label }))

/* ---------- Record-payment modal ---------- */
function PaymentModal({ invoice, cur, schoolName, onClose }: { invoice: FeeInvoice; cur: string; schoolName: string; onClose: () => void }) {
  const toast = useToast()
  const payInvoice = usePayInvoice()
  const headsQ = useFeeHeads()
  const heads = useMemo<FeeHead[]>(() => (headsQ.data ?? []).filter((h) => h.active !== false), [headsQ.data])

  const [amount, setAmount] = useState(String(invoice.due || invoice.total))
  const [mode, setMode] = useState(PAY_MODES[0])
  const [headId, setHeadId] = useState('')
  const [ref, setRef] = useState('')
  const [chequeNumber, setChequeNumber] = useState('')
  const [chequeBank, setChequeBank] = useState('')
  const [chequeDate, setChequeDate] = useState('')

  useEffect(() => {
    if (!headId && heads.length) setHeadId(heads[0].id)
  }, [heads, headId])

  const submit = () => {
    const n = Number(amount)
    if (!n || n <= 0) { toast.danger('Amount required', 'Enter a valid payment amount.'); return }
    if (mode === 'Cheque' && !chequeNumber.trim()) { toast.danger('Cheque number required', 'Enter the cheque number.'); return }
    const head = heads.find((h) => h.id === headId)
    const payment: FeePayment = {
      id: Date.now(), invoiceId: invoice.id, studentId: invoice.studentId, studentName: invoice.studentName, cls: invoice.cls,
      headId: headId || undefined, headName: head?.name,
      amount: n, mode, ref: ref.trim(),
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      ...(mode === 'Cheque' ? { cheque: { number: chequeNumber.trim(), bank: chequeBank.trim() || undefined, date: chequeDate || undefined } } : {}),
    }
    payInvoice.mutate({ invoiceId: invoice.id, payment }, {
      onSuccess: () => {
        toast.success('Payment recorded', `${fmtMoney(n, cur)} · ${mode} · ${invoice.studentName} (${invoice.cls})`)
        onClose()
        void notifyReceiptBestEffort(invoice, n, mode, schoolName, cur)
      },
      onError: (err) => { toast.danger('Payment failed', err instanceof Error ? err.message : 'Please try again.') },
    })
  }

  return (
    <Modal
      open onClose={onClose} icon="rupee" size="sm"
      title="Record payment" sub={`${invoice.studentName} · ${invoice.cls} · Outstanding ${fmtMoney(invoice.due, cur)}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>Record payment</Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Fee head" required>
          <Select options={heads.map((h) => ({ value: h.id, label: h.name }))} value={headId} onChange={(e) => setHeadId(e.target.value)} />
        </Field>
        <Field label="Amount" required hint={`Term fee ${fmtMoney(invoice.total, cur)} · paid so far ${fmtMoney(invoice.paid, cur)}.`}>
          <Input icon="rupee" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Payment mode" required>
          <Select options={PAY_MODES} value={mode} onChange={(e) => setMode(e.target.value)} />
        </Field>
        {mode === 'Cheque' && (
          <div className="row gap12 wrap">
            <div style={{ flex: '1 1 140px' }}>
              <Field label="Cheque number" required>
                <Input icon="clipboard" value={chequeNumber} placeholder="e.g. 004821" onChange={(e) => setChequeNumber(e.target.value)} />
              </Field>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <Field label="Bank">
                <Input value={chequeBank} placeholder="e.g. HDFC Bank" onChange={(e) => setChequeBank(e.target.value)} />
              </Field>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <Field label="Cheque date">
                <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
              </Field>
            </div>
          </div>
        )}
        <Field label="Reference / receipt no." hint="UPI ref, transaction id, or leave blank for cash.">
          <Input icon="clipboard" value={ref} placeholder="e.g. UPI-8842019" onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ---------- Waiver modal (Principal approves) ---------- */
function WaiverModal({ invoice, cur, onClose }: { invoice: FeeInvoice; cur: string; onClose: () => void }) {
  const toast = useToast()
  const payInvoice = usePayInvoice()
  const [amount, setAmount] = useState(String(invoice.due))
  const [reason, setReason] = useState('Financial hardship')

  const submit = () => {
    const n = Number(amount)
    if (!n || n <= 0) { toast.danger('Amount required', 'Enter the waiver amount to approve.'); return }
    const payment: FeePayment = {
      id: Date.now(), invoiceId: invoice.id, studentId: invoice.studentId, studentName: invoice.studentName, cls: invoice.cls,
      amount: n, mode: 'Adjustment / waiver', ref: '', note: reason,
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    }
    payInvoice.mutate({ invoiceId: invoice.id, payment }, {
      onSuccess: () => { toast.success('Waiver approved', `${fmtMoney(n, cur)} waived for ${invoice.studentName} · ${reason}.`); onClose() },
      onError: (err) => { toast.danger('Waiver failed', err instanceof Error ? err.message : 'Please try again.') },
    })
  }

  return (
    <Modal
      open onClose={onClose} icon="shield" size="sm"
      title="Approve fee waiver" sub={`${invoice.studentName} · ${invoice.cls}`}
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
        <Field label="Waiver amount" required hint={`Outstanding due ${fmtMoney(invoice.due, cur)}.`}>
          <Input icon="rupee" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Reason" required>
          <Select options={['Financial hardship', 'Staff ward concession', 'Sibling discount', 'Scholarship', 'Merit award']} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ---------- Fee history (saved payments) ---------- */
function FeeHistoryTab({ cur }: { cur: string }) {
  const { data: paymentsData } = useFeePayments()
  const feePayments = paymentsData ?? []
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [mode, setMode] = useState('all')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return feePayments.filter((p) => {
      if (needle && !(p.studentName.toLowerCase().includes(needle) || p.cls.toLowerCase().includes(needle) || p.ref.toLowerCase().includes(needle))) return false
      if (type !== 'all' && p.feeType !== type) return false
      if (mode !== 'all' && p.mode !== mode) return false
      return true
    })
  }, [feePayments, q, type, mode])

  const columns: Column<FeePayment>[] = [
    { key: 'date', label: 'Date', sortValue: (p) => p.id, render: (p) => <span className="muted">{p.date}</span> },
    {
      key: 'student', label: 'Student', sortValue: (p) => p.studentName,
      render: (p) => <div><div className="fw6">{p.studentName}</div><div className="t-xs muted">{p.cls}</div></div>,
    },
    { key: 'feeType', label: 'Fee type', sortValue: (p) => p.feeType ?? '', render: (p) => {
      const ft = (p.feeType ?? 'other') as FeeType
      return <Badge tone={feeTypeMeta[ft].tone}>{feeTypeMeta[ft].label}</Badge>
    } },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (p) => p.amount, render: (p) => <span className="fw6">{fmtMoney(p.amount, cur)}</span> },
    { key: 'mode', label: 'Mode', sortValue: (p) => p.mode, render: (p) => <Badge tone="neutral">{p.mode}</Badge> },
    { key: 'ref', label: 'Reference', sortValue: (p) => p.ref, render: (p) => p.ref ? <span className="t-sm muted">{p.ref}</span> : <span className="muted">—</span> },
  ]

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <Search value={q} onChange={setQ} placeholder="Search student, class, reference…" style={{ flex: 1, minWidth: 220 }} />
        <Select options={[{ value: 'all', label: 'All fee types' }, ...FEE_TYPE_OPTS]} value={type} onChange={(e) => setType(e.target.value)} />
        <Select options={[{ value: 'all', label: 'All modes' }, ...ALL_MODES.map((m) => ({ value: m, label: m }))]} value={mode} onChange={(e) => setMode(e.target.value)} />
      </div>
      <DataTable<FeePayment>
        columns={columns}
        rows={rows}
        pageSize={12}
        rowKey={(p) => p.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty={<Empty icon="wallet" title="No payments recorded yet" body="Recorded fee payments will appear here with their type and mode." />}
      />
    </Card>
  )
}

/* ---------- Fee structure (configurable heads × per-grade amounts) ---------- */
const STRUCTURE_GRADES = grades.slice(4)
const TERM_OPTIONS = ['Term 1', 'Term 2', 'Annual']

function FeeStructureTab({ cur, editable }: { cur: string; editable: boolean }) {
  const toast = useToast()
  const headsQ = useFeeHeads()
  const structureQ = useFeeStructure()
  const classesQ = useClasses()
  const createHead = useCreateFeeHead()
  const deleteHead = useDeleteFeeHead()
  const saveStructure = useSaveFeeStructure()
  const generateInvoices = useGenerateFeeInvoices()

  const heads = useMemo<FeeHead[]>(() => (headsQ.data ?? []).filter((h) => h.active !== false), [headsQ.data])

  /* Grades: live class grades when available, else the existing grades list. */
  const structureGrades = useMemo(() => {
    const live = [...new Set((classesQ.data ?? []).map((c) => c.grade).filter(Boolean))]
    return live.length ? live.sort((a, b) => gradeRank(a) - gradeRank(b)) : STRUCTURE_GRADES
  }, [classesQ.data])

  const [newHead, setNewHead] = useState('')
  const [draft, setDraft] = useState<Record<string, Record<string, number>>>({})
  useEffect(() => {
    if (structureQ.data) setDraft(structureQ.data)
  }, [structureQ.data])

  const cellValue = (g: string, headId: string) => draft[g]?.[headId] ?? 0
  const setCell = (g: string, headId: string, raw: string) => {
    const n = Math.max(0, Math.round(Number(raw) || 0))
    setDraft((d) => ({ ...d, [g]: { ...d[g], [headId]: n } }))
  }

  const addHead = () => {
    const name = newHead.trim()
    if (!name) { toast.danger('Name required', 'Enter a fee head name.'); return }
    if (heads.some((h) => h.name.toLowerCase() === name.toLowerCase())) { toast.danger('Already exists', `${name} is already a fee head.`); return }
    createHead.mutate({ name }, {
      onSuccess: () => { setNewHead('') },
      onError: (err) => { toast.danger('Could not add fee head', err instanceof Error ? err.message : 'Please try again.') },
    })
  }
  const removeHead = (head: FeeHead) => {
    deleteHead.mutate(head.id, {
      onError: (err) => { toast.danger('Could not remove fee head', err instanceof Error ? err.message : 'Please try again.') },
    })
  }
  const rowTotal = (g: string) => heads.reduce((a, h) => a + cellValue(g, h.id), 0)
  const grandTotal = structureGrades.reduce((a, g) => a + rowTotal(g), 0)

  const save = () => {
    const matrix: Record<string, Record<string, number>> = {}
    structureGrades.forEach((g) => {
      matrix[g] = {}
      heads.forEach((h) => { matrix[g][h.id] = cellValue(g, h.id) })
    })
    saveStructure.mutate(matrix, {
      onSuccess: () => { toast.success('Fee structure saved', `${structureGrades.length} grades · ${heads.length} fee heads.`) },
      onError: (err) => { toast.danger('Save failed', err instanceof Error ? err.message : 'Please try again.') },
    })
  }

  /* ---- Generate invoices ---- */
  const [genYear, setGenYear] = useState('')
  const [genTerm, setGenTerm] = useState(TERM_OPTIONS[0])
  const [genGrades, setGenGrades] = useState<Set<string>>(new Set())
  const toggleGenGrade = (g: string) => setGenGrades((prev) => {
    const next = new Set(prev)
    if (next.has(g)) next.delete(g); else next.add(g)
    return next
  })
  const generate = () => {
    const year = genYear.trim()
    if (!year) { toast.danger('Academic year required', 'Enter the academic year (e.g. 2026-27).'); return }
    if (!genGrades.size) { toast.danger('Pick grades', 'Select at least one grade to generate invoices for.'); return }
    generateInvoices.mutate({ grades: [...genGrades], academicYear: year, term: genTerm }, {
      onSuccess: (res) => { toast.success('Invoices generated', `${res.created} invoice(s) created for ${genGrades.size} grade(s) · ${genTerm}.`) },
      onError: (err) => { toast.danger('Generate failed', err instanceof Error ? err.message : 'Please try again.') },
    })
  }

  return (
    <div className="col gap16">
      <Card pad={false}>
        <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div><div className="fw6">Fee structure</div><div className="t-sm muted">Per-grade amounts by fee head · {cur}</div></div>
          <div className="row ai-center gap8 wrap">
            {editable && (
              <div className="row ai-center gap6">
                <Input value={newHead} placeholder="New fee head (e.g. Lab fee)" onChange={(e) => setNewHead(e.target.value)} style={{ width: 200 }} />
                <Btn variant="secondary" size="sm" icon="plus" disabled={createHead.isPending} onClick={addHead}>Add fee head</Btn>
              </div>
            )}
            {editable
              ? <Btn variant="primary" icon="check" disabled={heads.length === 0 || saveStructure.isPending} onClick={save}>Save structure</Btn>
              : <Badge tone="neutral" icon="eye">View only</Badge>}
          </div>
        </div>
        {heads.length === 0 ? (
          <Empty icon="wallet" title="No fee heads" body="Add a fee head (e.g. Academic, Transport, Lab) to define the structure." />
        ) : (
          <>
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Grade</th>
                  {heads.map((h) => (
                    <th key={h.id} className="ta-right">
                      <span className="row ai-center jc-end gap6">
                        {h.name}
                        {editable && <button onClick={() => removeHead(h)} aria-label={`Remove ${h.name}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'inline-flex', padding: 0 }}><Icon name="x" size={12} /></button>}
                      </span>
                    </th>
                  ))}
                  <th className="ta-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {structureGrades.map((g) => (
                  <tr key={g}>
                    <td className="fw6">Grade {g}</td>
                    {heads.map((h) => (
                      <td key={h.id} className="ta-right" style={{ width: 130 }}>
                        <Input type="number" min={0} value={String(cellValue(g, h.id))} disabled={!editable}
                          style={{ width: 110, textAlign: 'right' }}
                          onChange={(e) => setCell(g, h.id, e.target.value)} />
                      </td>
                    ))}
                    <td className="ta-right fw7">{fmtMoney(rowTotal(g), cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row jc-end" style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <span className="t-sm">Grand total (all grades) <span className="fw7">{fmtMoney(grandTotal, cur)}</span></span>
            </div>
          </>
        )}
      </Card>

      {editable && (
        <Card>
          <CardHead title="Generate invoices" sub="Bill selected grades from the current fee structure" icon="rupee" />
          <div className="col gap16" style={{ marginTop: 12 }}>
            <div className="row gap16 wrap">
              <div style={{ flex: 1, minWidth: 160 }}>
                <Field label="Academic year" required>
                  <Input value={genYear} placeholder="e.g. 2026-27" onChange={(e) => setGenYear(e.target.value)} />
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <Field label="Term" required>
                  <Select options={TERM_OPTIONS} value={genTerm} onChange={(e) => setGenTerm(e.target.value)} />
                </Field>
              </div>
            </div>
            <Field label="Grades" required hint={genGrades.size ? `${genGrades.size} selected` : 'Select at least one grade'}>
              <div className="row gap6 wrap" role="group" aria-label="Select grades">
                {structureGrades.map((g) => (
                  <Btn key={g} type="button" size="sm" variant={genGrades.has(g) ? 'primary' : 'secondary'} onClick={() => toggleGenGrade(g)}>{g}</Btn>
                ))}
              </div>
            </Field>
            <div className="row jc-end">
              <Btn variant="primary" icon="arrowRight" disabled={generateInvoices.isPending} onClick={generate}>Generate invoices</Btn>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ---------- Send reminders modal ---------- */
function RemindersModal({ dueInvoices, defaultersCount, onClose }: {
  dueInvoices: FeeInvoice[]; defaultersCount: number; onClose: () => void
}) {
  const toast = useToast()
  const sendReminders = useSendFeeReminders()
  const [email, setEmail] = useState(true)
  const [sms, setSms] = useState(true)
  const [appCh, setAppCh] = useState(true)
  const [audience, setAudience] = useState<'defaulters' | 'selected'>('defaulters')
  const [payLink, setPayLink] = useState(true)

  const selectedIds = useMemo(() => dueInvoices.map((i) => i.id), [dueInvoices])

  const submit = () => {
    const channels = [email ? 'email' : '', sms ? 'sms' : '', appCh ? 'app' : ''].filter(Boolean)
    if (!channels.length) { toast.danger('Pick a channel', 'Enable Email, SMS, and/or App.'); return }
    if (audience === 'selected' && !selectedIds.length) { toast.danger('No invoices selected', 'No due/partial invoices match the current view.'); return }
    sendReminders.mutate({
      audience,
      channels,
      includePayLink: payLink,
      ...(audience === 'selected' ? { invoiceIds: selectedIds } : {}),
    }, {
      onSuccess: (res) => { toast.success('Reminders sent', `Reached ${fmtNum(res.reach)} parent(s) via ${channels.join(' · ')}.`); onClose() },
      onError: (err) => { toast.danger('Could not send reminders', err instanceof Error ? err.message : 'Please try again.') },
    })
  }

  return (
    <Modal
      open onClose={onClose} icon="bell" size="sm"
      title="Send fee reminders"
      sub={audience === 'defaulters' ? `${fmtNum(defaultersCount)} defaulter(s) · full outstanding dues` : `${fmtNum(selectedIds.length)} invoice(s) in the current view`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="bell" disabled={sendReminders.isPending} onClick={submit}>
            {sendReminders.isPending ? 'Sending…' : 'Send reminders'}
          </Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Audience" hint="Defaulters are resolved by the server; Selected uses invoices matching the current search/status filters.">
          <div className="row gap8 wrap">
            <Btn type="button" size="sm" variant={audience === 'defaulters' ? 'primary' : 'secondary'} onClick={() => setAudience('defaulters')}>Defaulters (all)</Btn>
            <Btn type="button" size="sm" variant={audience === 'selected' ? 'primary' : 'secondary'} onClick={() => setAudience('selected')}>Selected (current view)</Btn>
          </div>
        </Field>
        <Field label="Send via">
          <div className="col gap8">
            <Checkbox checked={appCh} onChange={setAppCh} label="App notification" />
            <Checkbox checked={email} onChange={setEmail} label="Email" />
            <Checkbox checked={sms} onChange={setSms} label="SMS" />
          </div>
        </Field>
        <Checkbox checked={payLink} onChange={setPayLink} label="Include pay link" />
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
  const [payRow, setPayRow] = useState<FeeInvoice | null>(null)
  const [waiveRow, setWaiveRow] = useState<FeeInvoice | null>(null)
  const [remindOpen, setRemindOpen] = useState(false)
  const [tab, setTab] = useState('collection')

  const invoicesQ = useFeeInvoices()
  const invoices = useMemo<FeeInvoice[]>(() => invoicesQ.data ?? [], [invoicesQ.data])
  const summaryQ = useFeeReportSummary()
  const summary = summaryQ.data
  const latest = summary?.latestPayment

  const byClass = summary?.byClass ?? []

  const toast = useToast()
  const integrationsQ = useSchoolIntegrations()
  const razorpayReady = integrationsQ.data?.razorpay?.enabled && integrationsQ.data?.razorpay?.status === 'configured'
  const createOrder = useCreateFeeRazorpayOrder()
  const verifyPayment = useVerifyFeeRazorpayPayment()

  const collectOnline = async (invoice: FeeInvoice) => {
    try {
      const order = await createOrder.mutateAsync(invoice.id)
      const ok = await loadRazorpayScript()
      if (!ok || !window.Razorpay) {
        toast.info('Payment not started', 'Razorpay checkout did not load. Try again or collect offline.')
        return
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: app.school.name,
        description: `Fee payment · ${invoice.studentName} (${invoice.cls})`,
        handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          verifyPayment.mutate({
            invoiceId: invoice.id,
            body: {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            },
          }, {
            onSuccess: () => {
              toast.success('Payment received', `${invoice.studentName} (${invoice.cls}) paid online via Razorpay.`)
              void notifyReceiptBestEffort(invoice, order.amount, 'Razorpay', app.school.name, cur)
            },
            onError: (err) => { toast.danger('Verification failed', err instanceof Error ? err.message : 'Please try again.') },
          })
        },
        modal: {
          ondismiss: () => { toast.info('Payment not completed', 'Checkout closed — payment is still pending.') },
        },
      })
      rzp.open()
    } catch (err) {
      toast.danger('Could not start payment', err instanceof Error ? err.message : 'Please try again.')
    }
  }

  const sendPayLink = async (invoice: FeeInvoice) => {
    try {
      const order = await createOrder.mutateAsync(invoice.id)
      if (order.payLink) {
        if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(order.payLink).catch(() => {})
        toast.success('Pay link copied', `Share it with ${invoice.studentName}'s parent to collect online.`)
      } else {
        toast.info('Pay link unavailable', 'The server did not return a shareable pay link for this order.')
      }
    } catch (err) {
      toast.danger('Could not create pay link', err instanceof Error ? err.message : 'Please try again.')
    }
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (needle && !(inv.studentName.toLowerCase().includes(needle) || inv.cls.toLowerCase().includes(needle))) return false
      if (status !== 'all' && inv.status !== status) return false
      return true
    })
  }, [invoices, q, status])

  const columns: Column<FeeInvoice>[] = [
    {
      key: 'name', label: 'Student', sortValue: (r) => r.studentName,
      render: (r) => (
        <div className="row ai-center gap10">
          <Avatar name={r.studentName} size={34} />
          <div>
            <div className="fw6">{r.studentName}</div>
            <div className="t-xs muted">{r.cls}</div>
          </div>
        </div>
      ),
    },
    { key: 'term', label: 'Term fee', align: 'right', sortValue: (r) => r.total, render: (r) => fmtMoney(r.total, cur) },
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
          {canRecord && razorpayReady && r.due > 0 && (
            <Btn size="sm" variant="secondary" icon="zap" disabled={createOrder.isPending} onClick={() => { void collectOnline(r) }}>Collect online</Btn>
          )}
          {canRecord && razorpayReady && r.due > 0 && (
            <Btn size="sm" variant="ghost" icon="clipboard" disabled={createOrder.isPending} onClick={() => { void sendPayLink(r) }}>Send pay link</Btn>
          )}
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
        sub={`${app.school.name} · ${summary?.pct ?? 0}% of term billed collected`}
        actions={
          <>
            <Btn variant="secondary" icon="bell" onClick={() => setRemindOpen(true)}>Send reminders</Btn>
            <Btn variant="secondary" icon="download" onClick={() => { /* export stub */ }}>Export</Btn>
          </>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'collection', label: 'Collection', icon: 'wallet' }, { value: 'history', label: 'History', icon: 'clock' }, { value: 'structure', label: 'Structure', icon: 'rupee' }]} />
      </div>

      {tab === 'history' && <FeeHistoryTab cur={cur} />}
      {tab === 'structure' && <FeeStructureTab cur={cur} editable={canRecord} />}

      {tab === 'collection' && (<>
      {/* Live "payment received" cue */}
      {latest && (
        <Card className="row ai-center jc-between gap12 wrap" style={{ marginBottom: 16, borderColor: 'var(--success)' }}>
          <div className="row ai-center gap10">
            <span className="sm-dot-live" />
            <span className="sm-kpi-ic" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}><Icon name="rupee" size={18} /></span>
            <div>
              <div className="fw6">Payment received · {fmtMoney(latest.amount, cur)}</div>
              <div className="t-xs muted">{latest.studentName} ({latest.cls}) · just now via {latest.mode}</div>
            </div>
          </div>
          <Badge tone="success" soft>Live</Badge>
        </Card>
      )}

      {/* KPIs */}
      <div className="sm-kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi icon="rupee" iconBg="var(--success-bg)" iconColor="var(--success)" label="Collected today" value={fmtMoney(summary?.collectedToday ?? 0, cur)} foot="so far today" />
        <Kpi icon="wallet" iconBg="var(--brand-50)" iconColor="var(--brand-600)" label="Collected this term" value={fmtMoney(summary?.collectedTerm ?? 0, cur)} delta={`${summary?.pct ?? 0}%`} deltaDir="up" foot={`of ${fmtMoney(summary?.billedTerm ?? 0, cur)} billed`} />
        <Kpi icon="alert" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Outstanding dues" value={fmtMoney(summary?.outstanding ?? 0, cur)} foot="across all classes" />
        <Kpi icon="users" iconBg="var(--danger-bg)" iconColor="var(--danger)" label="Defaulters" value={fmtNum(summary?.defaulters ?? 0)} foot="students with full dues" />
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
          <Search value={q} onChange={setQ} placeholder="Search student, class…" style={{ flex: 1, minWidth: 220 }} />
          <Select
            options={[{ value: 'all', label: 'All status' }, { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'due', label: 'Due' }]}
            value={status} onChange={(e) => setStatus(e.target.value)}
          />
        </div>
        <DataTable<FeeInvoice>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(r) => r.id}
          initialSort={{ key: 'due', dir: 'desc' }}
          empty={<Empty icon="wallet" title="No matching records" body="Try adjusting the search or status filter." />}
        />
      </Card>

      </>)}

      {payRow && <PaymentModal key={payRow.id} invoice={payRow} cur={cur} schoolName={app.school.name} onClose={() => setPayRow(null)} />}
      {waiveRow && <WaiverModal key={waiveRow.id} invoice={waiveRow} cur={cur} onClose={() => setWaiveRow(null)} />}
      {remindOpen && (
        <RemindersModal
          dueInvoices={rows.filter((r) => r.due > 0)}
          defaultersCount={summary?.defaulters ?? 0}
          onClose={() => setRemindOpen(false)}
        />
      )}
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
            <DemoBadge />
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
