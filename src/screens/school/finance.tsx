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
import type { FeeStructureDocument, FeeStructureStatus } from '@/api/feeStructure'
import { useFeeInvoices, useGenerateFeeInvoices } from '@/api/hooks/useFeeInvoices'
import { useFeeReportSummary } from '@/api/hooks/useFeeReports'
import { useClasses } from '@/api/hooks/useClasses'
import { useStudents } from '@/api/hooks/useStudents'
import { useTeachers } from '@/api/hooks/useTeachers'
import { useStaff } from '@/api/hooks/useStaff'
import { useSendFeeReminders } from '@/api/hooks/useFeeReminders'
import { notifyFeeAudience } from '@/lib/feeNotify'
import { buildUpiPayUri, upiQrImageUrl } from '@/lib/upiQr'
import { downloadTextFile, invoicesToCsv } from '@/lib/feeExport'
import { payrollRunToCsv, payrollCsvFileName, downloadPayslip } from '@/lib/payrollExport'
import { downloadFeeReceipt, type FeeReceiptData } from '@/lib/feeReceipt'
import { getStudent } from '@/api/students'
import { can } from '@/lib/gating'
import {
  PageHead, Card, CardHead, Kpi, Btn, Badge, Avatar, Search, Select, Field, Input,
  Modal, Tabs, Icon, Empty, Bars, DataTable, Checkbox, type Column, type BadgeTone,
} from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { grades } from '@/data/mockDb'
import { gradeRank } from '@/lib/defaultClasses'
import { fmtMoney, fmtNum } from '@/lib/format'
import { properName } from '@/lib/properCase'
import { localDateIso } from '@/api/feeReports'
import { currentPeriod, periodLabel, computeSalary, toAmount, type SalaryComponents } from '@/lib/payroll'
import {
  usePayrollRun, usePayrollPreview, useRunPayroll, useApprovePayroll, useSalaryStructures, useUpsertSalaryStructure,
} from '@/api/hooks/usePayroll'
import type { PayrollLine, PersonType, SalaryStructure } from '@/api/payroll'
import { TEACHER_DESIGNATIONS, STAFF_ROLES, LEADERSHIP_ROLES } from '@/lib/salaryRoles'
import { useQuery } from '@tanstack/react-query'
import { listSchoolUsers, fromApiRole } from '@/api/users'
import { queryKeys } from '@/api/queryKeys'
import type { FeeStatus, FeePayment, FeeHead, FeeInvoice } from '@/types'

/* ============================================================
   Fees collection
   ============================================================ */
/** After pay: email parent + push app receipt with downloadable attachment. */
async function notifyReceiptBestEffort(
  invoice: FeeInvoice,
  amount: number,
  mode: string,
  schoolName: string,
  cur: string,
  opts?: { ref?: string; headName?: string; schoolCity?: string; logoUrl?: string | null; logoInitials?: string; brandColor?: string },
): Promise<{ emailed: boolean; app: boolean; reason?: string }> {
  try {
    const student = await getStudent(invoice.studentId)
    const emails = [
      student.email,
      student.father?.email,
      student.mother?.email,
    ].filter((v): v is string => !!v && v.includes('@'))
    const phones = [
      student.phone,
      student.father?.phone,
      student.mother?.phone,
    ].filter((v): v is string => !!v && String(v).replace(/\D/g, '').length >= 10)
    const receipt: FeeReceiptData = {
      schoolName,
      schoolCity: opts?.schoolCity,
      studentName: invoice.studentName,
      studentAdm: invoice.studentAdm || student.adm,
      cls: invoice.cls,
      amount,
      currency: cur,
      mode,
      ref: opts?.ref,
      paidAt: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      term: invoice.term,
      academicYear: invoice.academicYear,
      headName: opts?.headName,
      invoiceId: invoice.id,
      logoUrl: opts?.logoUrl,
      logoInitials: opts?.logoInitials,
      brandColor: opts?.brandColor,
    }
    const res = await notifyFeeAudience({
      kind: 'receipt',
      schoolName,
      studentName: invoice.studentName,
      amount,
      mode,
      currency: cur,
      channels: {
        email: emails.length > 0,
        sms: phones.length > 0,
        app: true,
      },
      emails,
      phones,
      receipt,
    })
    return {
      emailed: res.channels.includes('email'),
      app: res.channels.includes('app'),
      reason: !emails.length ? 'No parent email on file — app receipt still sent.' : undefined,
    }
  } catch (err) {
    return {
      emailed: false,
      app: false,
      reason: err instanceof Error ? err.message : 'Receipt notify failed',
    }
  }
}

const feeTone: Record<FeeStatus, BadgeTone> = { paid: 'success', partial: 'warning', due: 'danger' }
const feeLabel: Record<FeeStatus, string> = { paid: 'Paid', partial: 'Partial', due: 'Due' }
const PAY_MODES = ['Cash', 'UPI (manual)', 'Cheque', 'Card / POS', 'Bank transfer', 'DD']
const ALL_MODES = [...PAY_MODES, 'Razorpay', 'Adjustment / waiver']
const STARTER_FEE_HEADS = ['Academic', 'Transport', 'Exam', 'Admission', 'Lab']

/** Razorpay may return amount in paise; receipt/toast need rupees. */
function feeAmountFromRazorpayOrder(orderAmount: number, dueHint: number): number {
  if (dueHint > 0 && orderAmount >= dueHint * 50) return Math.round(orderAmount / 100)
  return orderAmount
}

/* ---------- Record-payment modal ---------- */
function PaymentModal({ invoice, cur, schoolName, schoolCity, studentAdm, logoUrl, logoInitials, brandColor, onClose }: {
  invoice: FeeInvoice
  cur: string
  schoolName: string
  schoolCity?: string
  studentAdm?: string
  logoUrl?: string | null
  logoInitials?: string
  brandColor?: string
  onClose: () => void
}) {
  const toast = useToast()
  const payInvoice = usePayInvoice()
  const headsQ = useFeeHeads()
  const heads = useMemo<FeeHead[]>(() => (headsQ.data ?? []).filter((h) => h.active !== false), [headsQ.data])
  const adm = studentAdm || invoice.studentAdm || ''

  const [amount, setAmount] = useState(String(invoice.due || invoice.total))
  const [mode, setMode] = useState(PAY_MODES[0])
  const [headId, setHeadId] = useState('')
  const [ref, setRef] = useState('')
  const [chequeNumber, setChequeNumber] = useState('')
  const [chequeBank, setChequeBank] = useState('')
  const [chequeDate, setChequeDate] = useState('')
  const [upiVpa, setUpiVpa] = useState('')

  useEffect(() => {
    if (!headId && heads.length) setHeadId(heads[0].id)
  }, [heads, headId])

  const amtNum = Math.max(0, Number(amount) || 0)
  const upiUri = mode === 'UPI (manual)'
    ? buildUpiPayUri({
      pa: upiVpa,
      am: amtNum,
      pn: schoolName,
      tn: `Fee ${invoice.studentName} ${invoice.cls}`,
    })
    : ''
  const upiQr = upiUri ? upiQrImageUrl(upiUri) : ''

  const submit = () => {
    const n = Number(amount)
    if (!n || n <= 0) { toast.danger('Amount required', 'Enter a valid payment amount.'); return }
    if (mode === 'Cheque' && !chequeNumber.trim()) { toast.danger('Cheque number required', 'Enter the cheque number.'); return }
    if (mode === 'UPI (manual)' && !upiVpa.trim() && !ref.trim()) {
      toast.danger('UPI VPA or reference required', 'Enter the school UPI ID for QR, or a UPI transaction reference.')
      return
    }
    const head = heads.find((h) => h.id === headId)
    const paymentRef = ref.trim() || (mode === 'UPI (manual)' ? upiVpa.trim() : '')
    const payment: FeePayment = {
      id: Date.now(), invoiceId: invoice.id, studentId: invoice.studentId, studentName: invoice.studentName, cls: invoice.cls,
      headId: headId || undefined, headName: head?.name,
      amount: n, mode,
      ref: paymentRef,
      date: localDateIso(),
      ...(mode === 'Cheque' ? { cheque: { number: chequeNumber.trim(), bank: chequeBank.trim() || undefined, date: chequeDate || undefined } } : {}),
    }
    payInvoice.mutate({ invoiceId: invoice.id, payment }, {
      onSuccess: () => {
        toast.success('Payment recorded', `${fmtMoney(n, cur)} · ${mode} · ${properName(invoice.studentName)} (${invoice.cls})`)
        onClose()
        void notifyReceiptBestEffort(invoice, n, mode, schoolName, cur, {
          ref: paymentRef,
          headName: head?.name,
          schoolCity,
          logoUrl,
          logoInitials,
          brandColor,
        }).then((r) => {
          if (r.emailed) toast.success('Receipt emailed', 'Parent mail + app downloadable receipt sent.')
          else if (r.app) toast.info('Receipt on app', r.reason || 'Parent / student app can download the receipt.')
          else if (r.reason) toast.info('Receipt not sent', r.reason)
        })
      },
      onError: (err) => { toast.danger('Payment failed', err instanceof Error ? err.message : 'Please try again.') },
    })
  }

  return (
    <Modal
      open onClose={onClose} icon="rupee" size="sm"
      title="Record payment"
      sub={adm ? `${properName(invoice.studentName)} · ${adm}` : `${properName(invoice.studentName)} · ${invoice.cls}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>Record payment</Btn>
        </div>
      }
    >
      <div className="col gap16">
        <div className="row gap12 wrap" style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div style={{ flex: '1 1 140px' }}>
            <div className="t-xs muted">Student</div>
            <div className="fw6">{properName(invoice.studentName)}</div>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <div className="t-xs muted">Admission no.</div>
            <div className="fw6">{adm || '—'}</div>
          </div>
          <div style={{ flex: '1 1 80px' }}>
            <div className="t-xs muted">Class</div>
            <div className="fw6">{invoice.cls}</div>
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <div className="t-xs muted">Due</div>
            <div className="fw6" style={{ color: invoice.due > 0 ? 'var(--danger)' : undefined }}>{fmtMoney(invoice.due, cur)}</div>
          </div>
        </div>
        <Field label="Fee type" required hint="Which fee is being paid — Academic, Transport, etc.">
          <Select options={heads.map((h) => ({ value: h.id, label: h.name }))} value={headId} onChange={(e) => setHeadId(e.target.value)} />
        </Field>
        <Field label="Amount" required hint={`Term fee ${fmtMoney(invoice.total, cur)} · paid so far ${fmtMoney(invoice.paid, cur)}.`}>
          <Input icon="rupee" type="number" inputMode="numeric" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Payment mode" required>
          <Select options={PAY_MODES} value={mode} onChange={(e) => setMode(e.target.value)} />
        </Field>
        {mode === 'UPI (manual)' && (
          <div className="col gap12">
            <Field label="School UPI ID (VPA)" required hint="Used to show a desk QR parents can scan.">
              <Input icon="phone" value={upiVpa} placeholder="e.g. schoolname@okhdfcbank" onChange={(e) => setUpiVpa(e.target.value)} />
            </Field>
            {upiQr ? (
              <div className="col ai-center gap8" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
                <img src={upiQr} alt="UPI QR" width={180} height={180} style={{ borderRadius: 8, background: '#fff' }} />
                <div className="t-xs muted ta-center">Scan to pay {fmtMoney(amtNum, cur)} · {upiVpa.trim()}</div>
                <Btn size="sm" variant="ghost" icon="clipboard" onClick={() => {
                  void navigator.clipboard?.writeText(upiUri).then(
                    () => toast.success('UPI link copied', 'Share or open in a UPI app.'),
                    () => toast.info('Copy manually', upiUri),
                  )
                }}>Copy UPI link</Btn>
              </div>
            ) : (
              <div className="t-sm muted">Enter UPI ID to show QR for this amount.</div>
            )}
          </div>
        )}
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
      date: localDateIso(),
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
  const app = useApp()
  const { data: paymentsData } = useFeePayments()
  const feePayments = paymentsData ?? []
  const studentsQ = useStudents()
  const headsQ = useFeeHeads()
  const heads = headsQ.data ?? []
  const [q, setQ] = useState('')
  const [headId, setHeadId] = useState('all')
  const [mode, setMode] = useState('all')

  const admOfStudent = (studentId: string) =>
    (studentsQ.data ?? []).find((s) => s.id === studentId)?.adm || ''

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return feePayments.filter((p) => {
      if (needle) {
        const adm = admOfStudent(p.studentId).toLowerCase()
        const blob = `${p.studentName} ${p.cls} ${p.ref} ${p.headName ?? ''} ${p.feeType ?? ''} ${adm}`.toLowerCase()
        if (!blob.includes(needle)) return false
      }
      if (headId !== 'all') {
        if (p.headId) {
          if (p.headId !== headId) return false
        } else {
          const head = heads.find((h) => h.id === headId)
          if (!head || (p.headName || p.feeType || '').toLowerCase() !== head.name.toLowerCase()) return false
        }
      }
      if (mode !== 'all' && p.mode !== mode) return false
      return true
    })
  }, [feePayments, q, headId, mode, heads, studentsQ.data])

  const downloadReceipt = (p: FeePayment) => {
    downloadFeeReceipt({
      schoolName: app.school.name,
      schoolCity: app.school.city,
      studentName: p.studentName,
      studentAdm: admOfStudent(p.studentId),
      cls: p.cls,
      amount: p.amount,
      currency: cur,
      mode: p.mode,
      ref: p.ref,
      paidAt: p.date,
      headName: p.headName || p.feeType,
      invoiceId: p.invoiceId,
      logoUrl: app.school.logoUrl,
      logoInitials: app.school.logo,
      brandColor: app.school.color,
    })
  }

  const columns: Column<FeePayment>[] = [
    { key: 'date', label: 'Date', sortValue: (p) => p.id, render: (p) => <span className="muted">{p.date}</span> },
    {
      key: 'student', label: 'Student', sortValue: (p) => p.studentName,
      render: (p) => <div><div className="fw6">{properName(p.studentName)}</div><div className="t-xs muted">{p.cls}</div></div>,
    },
    {
      key: 'head', label: 'Fee type', sortValue: (p) => p.headName || p.feeType || '',
      render: (p) => <Badge tone="brand">{p.headName || p.feeType || '—'}</Badge>,
    },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (p) => p.amount, render: (p) => <span className="fw6">{fmtMoney(p.amount, cur)}</span> },
    { key: 'mode', label: 'Mode', sortValue: (p) => p.mode, render: (p) => <Badge tone="neutral">{p.mode}</Badge> },
    { key: 'ref', label: 'Reference', sortValue: (p) => p.ref, render: (p) => p.ref ? <span className="t-sm muted">{p.ref}</span> : <span className="muted">—</span> },
    {
      key: 'receipt', label: 'Receipt', align: 'right',
      render: (p) => (
        <Btn variant="ghost" size="sm" icon="download" onClick={() => downloadReceipt(p)}>
          Download
        </Btn>
      ),
    },
  ]

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <Search value={q} onChange={setQ} placeholder="Search student, class, head, reference…" style={{ flex: 1, minWidth: 220 }} />
        <Select
          options={[
            { value: 'all', label: 'All fee types' },
            ...heads.map((h) => ({ value: h.id, label: h.name })),
          ]}
          value={headId}
          onChange={(e) => setHeadId(e.target.value)}
        />
        <Select options={[{ value: 'all', label: 'All modes' }, ...ALL_MODES.map((m) => ({ value: m, label: m }))]} value={mode} onChange={(e) => setMode(e.target.value)} />
      </div>
      <DataTable<FeePayment>
        columns={columns}
        rows={rows}
        pageSize={12}
        rowKey={(p) => p.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty={<Empty icon="wallet" title="No payments recorded yet" body="Offline (cash / UPI / cheque) and Razorpay payments appear here." />}
      />
    </Card>
  )
}

/* ---------- Fee structure (named header + class-wise amounts) ---------- */
const STRUCTURE_GRADES = grades.slice(4)
const TERM_OPTIONS = ['Term 1', 'Term 2', 'Annual']
const SECTION_OPTIONS = ['', 'A', 'B', 'C', 'D']
const CURRENCY_OPTIONS = ['₹', 'INR', 'USD', 'AED', 'EUR']
/** Soft cap so desk typos don't become INR 1,00,00,00,00,00,00,000. */
const MAX_FEE_AMOUNT = 9_999_999
const STATUS_OPTIONS: { value: FeeStructureStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function parseFeeAmount(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return 0
  const n = Math.round(Number(trimmed))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, MAX_FEE_AMOUNT)
}

function defaultAcademicYear(d = new Date()): string {
  const y = d.getFullYear()
  const m = d.getMonth()
  /* Indian AY typically starts April. */
  return m >= 3 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

type StructureClassRow = { key: string; label: string; grade: string; section: string }

function FeeStructureTab({ cur, editable, onGenerated }: {
  cur: string
  editable: boolean
  onGenerated?: () => void
}) {
  const toast = useToast()
  const headsQ = useFeeHeads()
  const structureQ = useFeeStructure()
  const classesQ = useClasses()
  const studentsQ = useStudents()
  const createHead = useCreateFeeHead()
  const deleteHead = useDeleteFeeHead()
  const saveStructure = useSaveFeeStructure()
  const generateInvoices = useGenerateFeeInvoices()

  const heads = useMemo<FeeHead[]>(() => (headsQ.data ?? []).filter((h) => h.active !== false), [headsQ.data])

  const allClasses = useMemo<StructureClassRow[]>(() => {
    const live = (classesQ.data ?? [])
      .filter((c) => c.name.trim())
      .map((c) => ({
        key: c.name.trim(),
        label: c.name.trim(),
        grade: c.grade || c.name.split('-')[0] || c.name,
        section: c.section || '',
      }))
      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.label.localeCompare(b.label))
    if (live.length) return live
    return STRUCTURE_GRADES.map((g) => ({ key: `${g}-A`, label: `${g}-A`, grade: g, section: 'A' }))
  }, [classesQ.data])

  const gradeOptions = useMemo(() => {
    const live = [...new Set(allClasses.map((c) => c.grade).filter(Boolean))]
    return live.length ? live : [...STRUCTURE_GRADES]
  }, [allClasses])

  const [meta, setMeta] = useState({
    name: `School fees ${defaultAcademicYear()}`,
    academicYear: defaultAcademicYear(),
    classGrade: '',
    section: '',
    currency: cur || 'INR',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    status: 'active' as FeeStructureStatus,
    description: '',
  })
  const [newHead, setNewHead] = useState('')
  const [draft, setDraft] = useState<Record<string, Record<string, number>>>({})
  const [hydrated, setHydrated] = useState(false)
  const [viewGrade, setViewGrade] = useState('')
  const [classQ, setClassQ] = useState('')

  useEffect(() => {
    if (!structureQ.data || hydrated) return
    const d = structureQ.data
    setMeta({
      name: d.name,
      academicYear: d.academicYear,
      classGrade: d.classGrade,
      section: d.section,
      currency: d.currency || cur || 'INR',
      effectiveFrom: d.effectiveFrom,
      status: d.status,
      description: d.description,
    })
    setDraft(d.amounts)
    if (d.classGrade) setViewGrade(d.classGrade)
    setHydrated(true)
  }, [structureQ.data, hydrated, cur])

  /* Default amount editor to one grade so Nursery–XII doesn't dump 40+ rows at once. */
  useEffect(() => {
    if (viewGrade || !gradeOptions.length) return
    setViewGrade(meta.classGrade || gradeOptions.find((g) => g === 'IV') || gradeOptions[0])
  }, [gradeOptions, viewGrade, meta.classGrade])

  const structureClasses = useMemo(() => {
    const needle = classQ.trim().toLowerCase()
    return allClasses.filter((row) => {
      if (meta.classGrade && row.grade !== meta.classGrade) return false
      if (viewGrade && row.grade !== viewGrade) return false
      if (meta.section && row.section && row.section !== meta.section) return false
      if (meta.section && !row.section && !row.label.endsWith(`-${meta.section}`)) return false
      if (needle && !`${row.label} ${row.grade} ${row.section}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [allClasses, meta.classGrade, meta.section, viewGrade, classQ])

  const cellValue = (row: StructureClassRow, headId: string) =>
    draft[row.key]?.[headId] ?? draft[row.grade]?.[headId] ?? 0

  const cellKey = (row: StructureClassRow, headId: string) => `${row.key}::${headId}`
  const [amountText, setAmountText] = useState<Record<string, string>>({})

  const cellDisplay = (row: StructureClassRow, headId: string) => {
    const k = cellKey(row, headId)
    if (k in amountText) return amountText[k]
    const n = cellValue(row, headId)
    return n > 0 ? String(n) : ''
  }

  const setCell = (row: StructureClassRow, headId: string, raw: string) => {
    const k = cellKey(row, headId)
    setAmountText((t) => ({ ...t, [k]: raw }))
    const n = parseFeeAmount(raw)
    setDraft((d) => ({ ...d, [row.key]: { ...d[row.key], [headId]: n } }))
  }

  const commitCell = (row: StructureClassRow, headId: string) => {
    const k = cellKey(row, headId)
    const capped = parseFeeAmount(amountText[k] ?? String(cellValue(row, headId) || ''))
    if (capped !== cellValue(row, headId)) {
      setDraft((d) => ({ ...d, [row.key]: { ...d[row.key], [headId]: capped } }))
    }
    setAmountText((t) => {
      if (!(k in t)) return t
      const next = { ...t }
      delete next[k]
      return next
    })
  }

  const addHead = () => {
    const name = properName(newHead.trim())
    if (!name) { toast.danger('Name required', 'Enter a fee type name.'); return }
    if (heads.some((h) => h.name.toLowerCase() === name.toLowerCase())) { toast.danger('Already exists', `${name} is already a fee type.`); return }
    createHead.mutate({ name }, {
      onSuccess: () => { setNewHead('') },
      onError: (err) => { toast.danger('Could not add fee type', err instanceof Error ? err.message : 'Please try again.') },
    })
  }
  const removeHead = (head: FeeHead) => {
    deleteHead.mutate(head.id, {
      onError: (err) => { toast.danger('Could not remove fee type', err instanceof Error ? err.message : 'Please try again.') },
    })
  }
  const rowTotal = (row: StructureClassRow) => heads.reduce((a, h) => a + cellValue(row, h.id), 0)
  const grandTotal = useMemo(() => {
    return allClasses.reduce((sum, row) => sum + heads.reduce((a, h) => a + (draft[row.key]?.[h.id] ?? draft[row.grade]?.[h.id] ?? 0), 0), 0)
  }, [allClasses, heads, draft])

  /* Live enrolled-student count per class label (for expected-revenue projection). */
  const studentCountByClass = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of studentsQ.data ?? []) {
      const key = (s.cls || '').trim().toLowerCase()
      if (key) m.set(key, (m.get(key) ?? 0) + 1)
    }
    return m
  }, [studentsQ.data])
  const studentsInRow = (row: StructureClassRow) => studentCountByClass.get(row.label.trim().toLowerCase()) ?? 0

  /* Per-student fee for a set of rows. Sections of a grade share the same fee,
     so we report the range (min–max) instead of summing sections together. */
  const perStudentFee = (rows: StructureClassRow[]) => {
    const vals = rows.map(rowTotal).filter((v) => v > 0)
    if (!vals.length) return { min: 0, max: 0 }
    return { min: Math.min(...vals), max: Math.max(...vals) }
  }
  const feeRangeLabel = (r: { min: number; max: number }) =>
    r.min === r.max
      ? fmtMoney(r.min, meta.currency || cur)
      : `${fmtMoney(r.min, meta.currency || cur)}–${fmtMoney(r.max, meta.currency || cur)}`

  /* Expected annual collection = Σ (class fee × students enrolled in that class). */
  const expected = useMemo(() => {
    let revenue = 0
    let billedStudents = 0
    for (const row of allClasses) {
      const fee = heads.reduce((a, h) => a + (draft[row.key]?.[h.id] ?? draft[row.grade]?.[h.id] ?? 0), 0)
      if (fee <= 0) continue
      const n = studentCountByClass.get(row.label.trim().toLowerCase()) ?? 0
      revenue += fee * n
      billedStudents += n
    }
    return { revenue, billedStudents }
  }, [allClasses, heads, draft, studentCountByClass])

  const buildDocument = (): FeeStructureDocument => {
    /* Keep amounts for classes not on screen (other grades). */
    const amounts: Record<string, Record<string, number>> = { ...draft }
    allClasses.forEach((row) => {
      const rowAmounts: Record<string, number> = { ...(amounts[row.key] ?? {}) }
      heads.forEach((h) => {
        if (rowAmounts[h.id] == null) rowAmounts[h.id] = draft[row.key]?.[h.id] ?? draft[row.grade]?.[h.id] ?? 0
      })
      amounts[row.key] = rowAmounts
    })
    structureClasses.forEach((row) => {
      amounts[row.key] = {}
      heads.forEach((h) => { amounts[row.key][h.id] = cellValue(row, h.id) })
    })
    return {
      id: structureQ.data?.id,
      name: meta.name.trim(),
      academicYear: meta.academicYear.trim(),
      classGrade: meta.classGrade.trim(),
      section: meta.section.trim(),
      currency: meta.currency.trim() || cur || 'INR',
      effectiveFrom: meta.effectiveFrom.trim(),
      status: meta.status,
      description: meta.description.trim(),
      amounts,
    }
  }

  const validateMeta = (): string | null => {
    if (!meta.name.trim()) return 'Fee structure name is required'
    if (!meta.academicYear.trim()) return 'Academic year is required'
    if (!meta.effectiveFrom.trim()) return 'Effective from date is required'
    if (!meta.currency.trim()) return 'Currency is required'
    return null
  }

  /* ---- Generate invoices ---- */
  const [genTerm, setGenTerm] = useState(TERM_OPTIONS[0])
  const [genDue, setGenDue] = useState('')
  const [genClasses, setGenClasses] = useState<Set<string>>(new Set())
  const [seeding, setSeeding] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setGenClasses(new Set(structureClasses.map((c) => c.key)))
  }, [structureClasses])

  const toggleGenClass = (key: string) => setGenClasses((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const selectedRows = structureClasses.filter((c) => genClasses.has(c.key))

  const save = () => {
    const err = validateMeta()
    if (err) { toast.danger('Missing fields', err); return }
    saveStructure.mutate(buildDocument(), {
      onSuccess: (doc) => {
        toast.success('Fee structure saved', `${doc.name} · ${structureClasses.length} class(es) · ${heads.length} head(s).`)
      },
      onError: (e) => { toast.danger('Save failed', e instanceof Error ? e.message : 'Please try again.') },
    })
  }

  const generate = async () => {
    const err = validateMeta()
    if (err) { toast.danger('Missing fields', err); return }
    if (!selectedRows.length) { toast.danger('Pick classes', 'Select at least one class to generate invoices for.'); return }
    if (grandTotal <= 0) { toast.danger('Fill amounts', 'Enter fee amounts for at least one class / head.'); return }
    if (meta.status !== 'active') { toast.danger('Inactive structure', 'Set Status to Active before generating invoices.'); return }
    setBusy(true)
    try {
      const doc = await saveStructure.mutateAsync(buildDocument())
      const classes = selectedRows.map((r) => r.key)
      const res = await generateInvoices.mutateAsync({
        classes,
        academicYear: doc.academicYear,
        term: genTerm,
        ...(genDue.trim() ? { dueDate: genDue.trim() } : {}),
      })
      toast.success(
        'Structure saved · invoices generated',
        `${res.created} invoice(s) · ${classes.length} class(es) · ${genTerm} · ${doc.academicYear}. Open Collection to record payment.`,
      )
      onGenerated?.()
    } catch (e) {
      toast.danger('Could not generate', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const seedStarterHeads = async () => {
    setSeeding(true)
    let added = 0
    try {
      for (const name of STARTER_FEE_HEADS) {
        if (heads.some((h) => h.name.toLowerCase() === name.toLowerCase())) continue
        await createHead.mutateAsync({ name })
        added += 1
      }
      toast.success(
        added ? 'Starter fee heads added' : 'Heads already present',
        'Fill header + class amounts, then Save & generate.',
      )
    } catch (e) {
      toast.danger('Could not add starter heads', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setSeeding(false)
    }
  }

  const patchMeta = <K extends keyof typeof meta>(key: K, value: (typeof meta)[K]) => {
    setMeta((m) => {
      const next = { ...m, [key]: value }
      if (key === 'academicYear' && typeof value === 'string') {
        const year = value.trim()
        if (year && (!m.name.trim() || m.name.startsWith('School fees'))) {
          next.name = `School fees ${year}`
        }
      }
      return next
    })
  }

  return (
    <div className="col gap16">
      <Card pad={false}>
        <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="fw6">Create fee structure</div>
            <div className="t-sm muted">Header details + class-wise amounts → save & generate · {meta.currency || cur}</div>
          </div>
          {!editable && <Badge tone="neutral" icon="eye">View only</Badge>}
        </div>

        <div className="col gap16" style={{ padding: 16, borderBottom: heads.length ? '1px solid var(--border)' : undefined }}>
          <div className="row gap16 wrap">
            <div style={{ flex: '2 1 220px' }}>
              <Field label="Fee structure name" required>
                <Input
                  value={meta.name}
                  disabled={!editable}
                  placeholder="e.g. Class 1 Fee 2026-27"
                  onChange={(e) => patchMeta('name', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <Field label="Academic year" required>
                <Input
                  value={meta.academicYear}
                  disabled={!editable}
                  placeholder="e.g. 2026-27"
                  onChange={(e) => patchMeta('academicYear', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <Field label="Currency" required>
                <Select
                  options={CURRENCY_OPTIONS}
                  value={meta.currency}
                  disabled={!editable}
                  onChange={(e) => patchMeta('currency', e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="row gap16 wrap">
            <div style={{ flex: '1 1 140px' }}>
              <Field label="Class" hint="Optional — leave blank for all classes">
                <Select
                  options={[{ value: '', label: 'All classes' }, ...gradeOptions.map((g) => ({ value: g, label: g }))]}
                  value={meta.classGrade}
                  disabled={!editable}
                  onChange={(e) => patchMeta('classGrade', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <Field label="Section" hint="Optional">
                <Select
                  options={SECTION_OPTIONS.map((s) => ({ value: s, label: s || 'All sections' }))}
                  value={meta.section}
                  disabled={!editable}
                  onChange={(e) => patchMeta('section', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <Field label="Effective from" required>
                <Input
                  type="date"
                  value={meta.effectiveFrom}
                  disabled={!editable}
                  onChange={(e) => patchMeta('effectiveFrom', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <Field label="Status" required>
                <Select
                  options={STATUS_OPTIONS}
                  value={meta.status}
                  disabled={!editable}
                  onChange={(e) => patchMeta('status', e.target.value as FeeStructureStatus)}
                />
              </Field>
            </div>
          </div>
          <Field label="Description" hint="Optional remarks">
            <Input
              value={meta.description}
              disabled={!editable}
              placeholder="e.g. Term 1 tuition for primary"
              onChange={(e) => patchMeta('description', e.target.value)}
            />
          </Field>
        </div>

        {heads.length === 0 ? (
          <Empty
            icon="wallet"
            title="Add fee type & amount"
            body="1 · Add fee types (Academic, Transport…) · 2 · Type amount for each class · 3 · Save & generate"
            action={editable ? (
              <div className="col gap12" style={{ alignItems: 'center', width: '100%', maxWidth: 440 }}>
                <Btn variant="primary" icon="plus" disabled={seeding || createHead.isPending} onClick={() => { void seedStarterHeads() }}>
                  {seeding ? 'Adding…' : 'Add starter fee types'}
                </Btn>
                <div className="t-xs muted">or type a fee type</div>
                <div className="row ai-end gap8 wrap jc-center" style={{ width: '100%' }}>
                  <div style={{ flex: '1 1 180px' }}>
                    <Field label="Fee type" required>
                      <Input value={newHead} placeholder="e.g. Library" onChange={(e) => setNewHead(e.target.value)} />
                    </Field>
                  </div>
                  <Btn variant="secondary" icon="plus" disabled={createHead.isPending || !newHead.trim()} onClick={addHead}>
                    Add fee type
                  </Btn>
                </div>
              </div>
            ) : undefined}
          />
        ) : (
          <div className="col gap16" style={{ padding: 16 }}>
            <Card pad={false} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <div className="fw6">Fee type & amount</div>
                <div className="t-sm muted">Add a fee type, then enter amount for each class below</div>
              </div>
              <div className="col gap16" style={{ padding: 16 }}>
                {editable && (
                  <div className="row ai-end gap12 wrap">
                    <div style={{ flex: '1 1 200px' }}>
                      <Field label="Fee type" required hint="e.g. Academic, Transport, Exam">
                        <Input
                          value={newHead}
                          placeholder="Type fee name…"
                          onChange={(e) => setNewHead(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHead() } }}
                        />
                      </Field>
                    </div>
                    <Btn variant="secondary" icon="plus" disabled={createHead.isPending || !newHead.trim()} onClick={addHead}>
                      Add fee type
                    </Btn>
                  </div>
                )}
                <div className="row gap6 wrap">
                  {heads.map((h) => (
                    <Badge key={h.id} tone="brand">
                      {h.name}
                      {editable && (
                        <button
                          type="button"
                          onClick={() => removeHead(h)}
                          aria-label={`Remove ${h.name}`}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', display: 'inline-flex', marginLeft: 6, padding: 0, opacity: 0.75 }}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>

                <Field
                  label="Amount by class"
                  required
                  hint={`Showing ${structureClasses.length} class(es)${viewGrade ? ` · Grade ${viewGrade}` : ''} · max ${fmtMoney(MAX_FEE_AMOUNT, meta.currency || cur)} per cell`}
                >
                  <div className="col gap12">
                    <div className="row gap6 wrap" role="group" aria-label="Filter by grade">
                      {(meta.classGrade ? [meta.classGrade] : gradeOptions).map((g) => (
                        <Btn
                          key={g}
                          type="button"
                          size="sm"
                          variant={viewGrade === g ? 'primary' : 'secondary'}
                          onClick={() => setViewGrade(g)}
                        >
                          {g}
                        </Btn>
                      ))}
                    </div>
                    <Search
                      value={classQ}
                      onChange={setClassQ}
                      placeholder="Filter class e.g. IV-B"
                      style={{ maxWidth: 280 }}
                    />

                    {/* Mobile / narrow: stacked cards */}
                    <div className="sm-fee-amount-cards">
                      {structureClasses.map((row) => (
                        <div key={row.key} className="sm-fee-amount-card">
                          <div className="row ai-center jc-between gap8">
                            <div>
                              <div className="fw6">{row.label}</div>
                              <div className="t-xs muted">{studentsInRow(row)} student{studentsInRow(row) === 1 ? '' : 's'}</div>
                            </div>
                            <div className="t-sm fw7">{fmtMoney(rowTotal(row), meta.currency || cur)}</div>
                          </div>
                          <div className="sm-fee-amount-fields">
                            {heads.map((h) => (
                              <Field key={h.id} label={h.name}>
                                <Input
                                  type="number"
                                  min={0}
                                  max={MAX_FEE_AMOUNT}
                                  inputMode="numeric"
                                  icon="rupee"
                                  placeholder="0"
                                  value={cellDisplay(row, h.id)}
                                  disabled={!editable}
                                  onChange={(e) => setCell(row, h.id, e.target.value)}
                                  onBlur={() => commitCell(row, h.id)}
                                  aria-label={`${row.label} ${h.name} amount`}
                                />
                              </Field>
                            ))}
                          </div>
                        </div>
                      ))}
                      {!structureClasses.length && (
                        <div className="t-sm muted" style={{ padding: 12 }}>No classes in this grade — pick another grade or clear search.</div>
                      )}
                    </div>

                    {/* Desktop: compact sticky table */}
                    <div className="sm-fee-amount-table-wrap">
                      <table className="sm-table sm-fee-amount-table">
                        <thead>
                          <tr>
                            <th>Class</th>
                            {heads.map((h) => (
                              <th key={h.id} className="ta-right">
                                <div className="col ai-end gap2">
                                  <span className="fw6">{h.name}</span>
                                  <span className="t-xs muted fw4">Amount</span>
                                </div>
                              </th>
                            ))}
                            <th className="ta-right">Students</th>
                            <th className="ta-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {structureClasses.map((row) => (
                            <tr key={row.key}>
                              <td className="fw6 sm-fee-amount-sticky">{row.label}</td>
                              {heads.map((h) => (
                                <td key={h.id} className="ta-right">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={MAX_FEE_AMOUNT}
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={cellDisplay(row, h.id)}
                                    disabled={!editable}
                                    className="sm-fee-amount-input"
                                    onChange={(e) => setCell(row, h.id, e.target.value)}
                                    onBlur={() => commitCell(row, h.id)}
                                    aria-label={`${row.label} ${h.name} amount`}
                                  />
                                </td>
                              ))}
                              <td className="ta-right muted">{studentsInRow(row)}</td>
                              <td className="ta-right fw7">{fmtMoney(rowTotal(row), meta.currency || cur)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Field>
                <div className="col gap6" style={{ width: '100%' }}>
                  <div className="row jc-between ai-center wrap gap8">
                    <span className="t-sm muted" title="Fee one student pays in this grade (sections share the same fee)">
                      This grade · {feeRangeLabel(perStudentFee(structureClasses))} per student
                    </span>
                    <span className="fw7" title="Per-student fee across all classes (range if grades differ)">
                      All classes · {feeRangeLabel(perStudentFee(allClasses))} per student
                    </span>
                  </div>
                  <div className="row jc-between ai-center wrap gap8">
                    <span className="t-sm muted" title="Sum of each class fee × students enrolled in that class">
                      Expected annual collection
                    </span>
                    <span className="fw7">
                      {fmtMoney(expected.revenue, meta.currency || cur)}
                      <span className="t-xs muted fw4"> · {expected.billedStudents} student{expected.billedStudents === 1 ? '' : 's'}</span>
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Card>

      {editable && heads.length > 0 && (
        <Card>
          <CardHead
            title="Save & generate invoices"
            sub={`${meta.name || 'Fee structure'} · ${meta.academicYear} · ${meta.status}`}
            icon="rupee"
          />
          <div className="col gap16" style={{ marginTop: 12 }}>
            <div className="row gap16 wrap">
              <div style={{ flex: 1, minWidth: 160 }}>
                <Field label="Term" required>
                  <Select options={TERM_OPTIONS} value={genTerm} onChange={(e) => setGenTerm(e.target.value)} />
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <Field label="Due date" hint="Optional">
                  <Input type="date" value={genDue} onChange={(e) => setGenDue(e.target.value)} />
                </Field>
              </div>
            </div>
            <Field label="Classes" required hint={genClasses.size ? `${genClasses.size} selected` : 'Select at least one class'}>
              <div className="row gap6 wrap" role="group" aria-label="Select classes">
                <Btn type="button" size="sm" variant="ghost" onClick={() => setGenClasses(new Set(structureClasses.map((c) => c.key)))}>All</Btn>
                <Btn type="button" size="sm" variant="ghost" onClick={() => setGenClasses(new Set())}>None</Btn>
                {structureClasses.map((c) => (
                  <Btn key={c.key} type="button" size="sm" variant={genClasses.has(c.key) ? 'primary' : 'secondary'} onClick={() => toggleGenClass(c.key)}>
                    {c.label}
                  </Btn>
                ))}
              </div>
            </Field>
            <div className="row jc-end gap8 wrap">
              <Btn variant="secondary" icon="check" disabled={busy || saveStructure.isPending} onClick={save}>
                Save only
              </Btn>
              <Btn
                variant="primary"
                icon="arrowRight"
                disabled={busy || generateInvoices.isPending || grandTotal <= 0 || meta.status !== 'active'}
                onClick={() => { void generate() }}
              >
                {busy ? 'Working…' : 'Save & generate'}
              </Btn>
            </div>
            {grandTotal <= 0 && (
              <div className="t-sm muted">Fill at least one class amount above before generating.</div>
            )}
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
  const studentsQ = useStudents()
  const admOf = (inv: FeeInvoice) =>
    inv.studentAdm?.trim()
    || (studentsQ.data ?? []).find((s) => s.id === inv.studentId)?.adm
    || ''
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
              const paidAmt = feeAmountFromRazorpayOrder(order.amount, invoice.due || invoice.total)
              void notifyReceiptBestEffort(invoice, paidAmt, 'Razorpay', app.school.name, cur, {
                ref: response.razorpay_payment_id,
                schoolCity: app.school.city,
                logoUrl: app.school.logoUrl,
                logoInitials: app.school.logo,
                brandColor: app.school.color,
              }).then((r) => {
                if (r.emailed) toast.success('Receipt emailed', 'Parent mail + app downloadable receipt sent.')
                else if (r.app) toast.info('Receipt on app', r.reason || 'Parent / student app can download the receipt.')
                else if (r.reason) toast.info('Receipt not sent', r.reason)
              })
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
      if (needle) {
        const adm = admOf(inv).toLowerCase()
        const hit = inv.studentName.toLowerCase().includes(needle)
          || inv.cls.toLowerCase().includes(needle)
          || adm.includes(needle)
        if (!hit) return false
      }
      if (status !== 'all' && inv.status !== status) return false
      return true
    })
  }, [invoices, q, status, studentsQ.data])

  const exportCsv = () => {
    if (!rows.length) {
      toast.info('Nothing to export', 'No invoices match the current search / status filter.')
      return
    }
    const csv = invoicesToCsv(rows, admOf)
    const day = new Date().toISOString().slice(0, 10)
    downloadTextFile(`fees-collection-${day}.csv`, csv)
    toast.success('Export ready', `${rows.length} invoice row(s) downloaded.`)
  }

  const columns: Column<FeeInvoice>[] = [
    {
      key: 'name', label: 'Student', sortValue: (r) => r.studentName,
      render: (r) => (
        <div className="row ai-center gap10">
          <Avatar name={r.studentName} size={34} />
          <div className="fw6">{properName(r.studentName)}</div>
        </div>
      ),
    },
    {
      key: 'adm', label: 'Admission no.', sortValue: (r) => admOf(r),
      render: (r) => <span className="t-sm">{admOf(r) || '—'}</span>,
    },
    {
      key: 'cls', label: 'Class', sortValue: (r) => r.cls,
      render: (r) => <span className="t-sm">{r.cls}</span>,
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

  const searchHit = q.trim() && rows.length === 1 ? rows[0] : null

  return (
    <div>
      <PageHead
        title="Fees collection"
        sub={`${app.school.name} · ${summary?.pct ?? 0}% of term billed collected`}
        actions={
          canRecord ? (
            <>
              <Btn variant="secondary" icon="bell" onClick={() => setRemindOpen(true)}>Send reminders</Btn>
              <Btn variant="secondary" icon="download" onClick={exportCsv}>Export</Btn>
            </>
          ) : undefined
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'collection', label: 'Collection', icon: 'wallet' }, { value: 'history', label: 'History', icon: 'clock' }, { value: 'structure', label: 'Structure', icon: 'rupee' }]} />
      </div>

      {tab === 'history' && <FeeHistoryTab cur={cur} />}
      {tab === 'structure' && (
        <FeeStructureTab
          cur={cur}
          editable={canRecord}
          onGenerated={() => setTab('collection')}
        />
      )}

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
        <div className="col gap12" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div className="row ai-end gap12 wrap">
            <div style={{ flex: 1, minWidth: 240 }}>
              <Field label="Student search" hint="Name, class, or admission number — fields fill when one student matches.">
                <Search value={q} onChange={setQ} placeholder="e.g. Rahul or STU/26/0001" />
              </Field>
            </div>
            <div style={{ minWidth: 140 }}>
              <Field label="Status">
                <Select
                  options={[{ value: 'all', label: 'All status' }, { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'due', label: 'Due' }]}
                  value={status} onChange={(e) => setStatus(e.target.value)}
                />
              </Field>
            </div>
          </div>
          {searchHit && (
            <div className="row ai-center jc-between gap12 wrap" style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div className="row gap16 wrap" style={{ flex: 1 }}>
                <div>
                  <div className="t-xs muted">Student</div>
                  <div className="fw6">{properName(searchHit.studentName)}</div>
                </div>
                <div>
                  <div className="t-xs muted">Admission no.</div>
                  <div className="fw6">{admOf(searchHit) || '—'}</div>
                </div>
                <div>
                  <div className="t-xs muted">Class</div>
                  <div className="fw6">{searchHit.cls}</div>
                </div>
                <div>
                  <div className="t-xs muted">Due</div>
                  <div className="fw6" style={{ color: searchHit.due > 0 ? 'var(--danger)' : undefined }}>{fmtMoney(searchHit.due, cur)}</div>
                </div>
                <div>
                  <div className="t-xs muted">Status</div>
                  <Badge tone={feeTone[searchHit.status]} dot>{feeLabel[searchHit.status]}</Badge>
                </div>
              </div>
              {canRecord && (
                <Btn size="sm" variant="primary" icon="rupee" onClick={() => setPayRow(searchHit)}>Record payment</Btn>
              )}
            </div>
          )}
        </div>
        <DataTable<FeeInvoice>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(r) => r.id}
          initialSort={{ key: 'due', dir: 'desc' }}
          empty={
            <Empty
              icon="wallet"
              title="No invoices yet"
              body="Go to Structure → add fee types & amounts → Save & generate. Then search a student here to record payment."
              action={canRecord ? (
                <Btn variant="primary" icon="rupee" onClick={() => setTab('structure')}>Open Structure</Btn>
              ) : undefined}
            />
          }
        />
      </Card>

      </>)}

      {payRow && (
        <PaymentModal
          key={payRow.id}
          invoice={payRow}
          cur={cur}
          schoolName={app.school.name}
          schoolCity={app.school.city}
          studentAdm={admOf(payRow)}
          logoUrl={app.school.logoUrl}
          logoInitials={app.school.logo}
          brandColor={app.school.color}
          onClose={() => setPayRow(null)}
        />
      )}
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
/** Stable avatar hue from a person id/name so colours persist across renders. */
function nameHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

function PayrollBody() {
  const app = useApp()
  const [tab, setTab] = useState<'run' | 'structure'>('run')

  return (
    <div>
      <PageHead
        title="HR & Payroll"
        sub={`${app.school.name} · ${periodLabel(currentPeriod())} cycle · Prepared by Admin office`}
      />

      <div style={{ marginBottom: 16 }}>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as 'run' | 'structure')}
          tabs={[
            { value: 'run', label: 'Payroll run', icon: 'wallet' },
            { value: 'structure', label: 'Salary structure', icon: 'rupee' },
          ]}
        />
      </div>

      {tab === 'run' ? <PayrollRunTab /> : <SalaryStructureTab />}
    </div>
  )
}

function PayrollRunTab() {
  const app = useApp()
  const cur = app.school.currency
  const canRun = can(app.role, 'hr', 'E')
  const canApprove = can(app.role, 'hr', 'A')
  const toast = useToast()
  const [q, setQ] = useState('')
  const period = useMemo(() => currentPeriod(), [])

  const runQuery = usePayrollRun(period)
  const runMut = useRunPayroll()
  const approveMut = useApprovePayroll()
  const summaryQ = useFeeReportSummary()
  const [payslip, setPayslip] = useState<PayrollLine | null>(null)

  const run = runQuery.data
  const status = run?.status ?? 'draft'
  const ran = status === 'run' || status === 'approved'
  const approved = status === 'approved'

  // Until a cycle is approved, show LIVE figures re-priced from the current salary
  // structures/profiles — so setting a salary reflects immediately without a re-run.
  // Once approved, show the frozen approved snapshot.
  const previewQ = usePayrollPreview(period, ran && !approved)
  const preview = previewQ.data
  const view = (ran && !approved && preview) ? preview : run
  const lines = view?.lines ?? []

  // The prepared snapshot differs from current salaries (informational only — display is live).
  const stale = !!preview && ran && !approved && (
    preview.net !== (run?.net ?? 0) ||
    preview.gross !== (run?.gross ?? 0) ||
    preview.staffCount !== (run?.staffCount ?? 0)
  )

  const totals = {
    count: view?.staffCount ?? lines.length,
    gross: view?.gross ?? 0,
    ded: view?.deductions ?? 0,
    net: view?.net ?? 0,
  }

  // Revenue vs payroll — fees collected this term against this month's net payroll.
  const revenue = summaryQ.data?.collectedTerm ?? 0
  const remaining = revenue - totals.net
  const payrollShare = revenue > 0 ? Math.round((totals.net / revenue) * 100) : 0

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return lines
    return lines.filter((r) =>
      r.name.toLowerCase().includes(needle) ||
      (r.role ?? '').toLowerCase().includes(needle) ||
      (r.dept ?? '').toLowerCase().includes(needle))
  }, [lines, q])

  const runPayrollNow = () => {
    runMut.mutate(period, {
      onSuccess: () => toast.success(
        'Payroll run',
        canApprove
          ? 'Prepared. You can approve it now for disbursal.'
          : 'Prepared by Admin office. Sent to the Principal for approval.',
      ),
      onError: (e) => toast.danger('Could not run payroll', e.message),
    })
  }
  const approve = () => {
    approveMut.mutate(period, {
      onSuccess: (r) => toast.success('Payroll approved', `${periodLabel(period)} · ${fmtMoney(r.net, cur)} net cleared for disbursal.`),
      onError: (e) => toast.danger('Could not approve', e.message),
    })
  }

  const statusBadge = approved
    ? <Badge tone="success" icon="check">Approved</Badge>
    : ran
      ? <Badge tone="info" dot>{canApprove ? 'Ready to approve' : 'Awaiting Principal approval'}</Badge>
      : <Badge tone="warning" dot>{canRun ? 'Ready to run' : 'Awaiting Admin to run'}</Badge>

  const columns: Column<PayrollLine>[] = [
    {
      key: 'name', label: 'Staff', sortValue: (r) => r.name,
      render: (r) => (
        <div className="row ai-center gap10">
          <Avatar name={r.name} hue={nameHue(r.personId || r.name)} size={34} />
          <div>
            <div className="fw6">{r.name}</div>
            <div className="t-xs muted">{r.personType === 'teacher' ? 'Teacher' : r.personType === 'leadership' ? 'Leadership' : 'Staff'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role', label: 'Role / Dept', sortValue: (r) => r.dept ?? '',
      render: (r) => (
        <div>
          <div className="fw6">{r.role || '—'}</div>
          <div className="t-xs muted">{r.dept || '—'}</div>
        </div>
      ),
    },
    { key: 'gross', label: 'Gross', align: 'right', sortValue: (r) => r.gross, render: (r) => fmtMoney(r.gross, cur) },
    { key: 'deductions', label: 'Deductions', align: 'right', sortValue: (r) => r.deductions, render: (r) => <span className="muted">− {fmtMoney(r.deductions, cur)}</span> },
    { key: 'net', label: 'Net pay', align: 'right', sortValue: (r) => r.net, render: (r) => <span className="fw7">{fmtMoney(r.net, cur)}</span> },
    {
      key: 'payslip', label: '', align: 'right', sortValue: () => 0,
      render: (r) => (
        <Btn size="sm" variant="ghost" icon="doc" onClick={() => setPayslip(r)}>Payslip</Btn>
      ),
    },
  ]

  const exportCsv = () => {
    if (!run || lines.length === 0) return
    downloadTextFile(payrollCsvFileName(run), payrollRunToCsv(run))
    toast.success('Payroll exported', `${lines.length} rows · ${payrollCsvFileName(run)}`)
  }

  const busy = runMut.isPending || approveMut.isPending

  return (
    <div>
      {/* Ownership note + run controls */}
      <Card className="row ai-center gap10 wrap" style={{ marginBottom: 16 }}>
        <span className="sm-kpi-ic" style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}><Icon name="briefcase" size={18} /></span>
        <div className="t-sm" style={{ flex: 1, minWidth: 220 }}>
          <span className="fw6">HR is handled by the Admin office.</span>{' '}
          <span className="muted">
            {canRun && canApprove
              ? 'As Owner you can run and approve payroll yourself. '
              : 'Admin runs the monthly payroll; the Principal approves before disbursal. '}
            Pay comes from each person&rsquo;s profile, or the salary structure for their role. Principal &amp; Owner are included once you set their pay under Salary structure.
          </span>
        </div>
        <div className="row ai-center gap8 wrap">
          {statusBadge}
          <Btn variant="primary" icon="refresh" disabled={!canRun || approved || busy} onClick={runPayrollNow}>
            {runMut.isPending ? 'Running…' : ran ? 'Re-run' : 'Run payroll'}
          </Btn>
          <Btn variant="success" icon="check" disabled={!canApprove || !ran || approved || busy} onClick={approve}>
            {approveMut.isPending ? 'Approving…' : 'Approve'}
          </Btn>
        </div>
      </Card>

      {/* Live-figures note: display already reflects current salaries; approve locks them. */}
      {stale && (
        <Card className="row ai-center gap10 wrap" style={{ marginBottom: 16, borderColor: 'var(--info)', background: 'var(--info-bg)' }}>
          <span className="sm-kpi-ic" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}><Icon name="eye" size={18} /></span>
          <div className="t-sm" style={{ flex: 1, minWidth: 220 }}>
            <span className="fw6">Showing live figures from your current salary structure.</span>{' '}
            <span className="muted">
              The prepared run recorded {fmtMoney(run?.net ?? 0, cur)} net; the current figure is{' '}
              <span className="fw6">{fmtMoney(preview?.net ?? 0, cur)}</span> net for {preview?.staffCount ?? 0} staff.
              Approving locks the current figure — or Re-run to refresh the prepared snapshot.
            </span>
          </div>
          <Btn variant="secondary" icon="refresh" disabled={!canRun || busy} onClick={runPayrollNow}>
            {runMut.isPending ? 'Running…' : 'Re-run'}
          </Btn>
        </Card>
      )}

      {/* Revenue vs payroll — what's left after salaries */}
      <Card style={{ marginBottom: 16 }}>
        <CardHead title="Revenue vs payroll" icon="rupee" sub="Fees collected this term against this month's net payroll" />
        <div className="sm-revpay" style={{ marginTop: 12 }}>
          <div className="sm-revpay-cell">
            <div className="t-xs muted">Revenue collected (term)</div>
            <div className="sm-revpay-val">{fmtMoney(revenue, cur)}</div>
          </div>
          <div className="sm-revpay-op">−</div>
          <div className="sm-revpay-cell">
            <div className="t-xs muted">Net payroll (this month)</div>
            <div className="sm-revpay-val" style={{ color: 'var(--warning)' }}>{fmtMoney(totals.net, cur)}</div>
          </div>
          <div className="sm-revpay-op">=</div>
          <div className="sm-revpay-cell">
            <div className="t-xs muted">Remaining · your amount</div>
            <div className="sm-revpay-val" style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {fmtMoney(remaining, cur)}
            </div>
          </div>
        </div>
        <div className="sm-revpay-bar" title={`Payroll is ${payrollShare}% of collected revenue`}>
          <div
            className="sm-revpay-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, payrollShare))}%`, background: payrollShare > 100 ? 'var(--danger)' : 'var(--brand-500)' }}
          />
        </div>
        <div className="t-xs muted" style={{ marginTop: 6 }}>
          Payroll is <span className="fw6">{payrollShare}%</span> of fees collected this term.
          {revenue === 0 && ' Collect fees to see the balance.'}
        </div>
      </Card>

      {/* KPIs */}
      <div className="sm-kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi icon="users" iconBg="var(--brand-50)" iconColor="var(--brand-600)" label="Staff on payroll" value={fmtNum(totals.count)} foot="teaching + support" />
        <Kpi icon="wallet" iconBg="var(--info-bg)" iconColor="var(--info)" label="Gross payroll" value={fmtMoney(totals.gross, cur)} foot="before deductions" />
        <Kpi icon="rupee" iconBg="var(--success-bg)" iconColor="var(--success)" label="Net payable" value={fmtMoney(totals.net, cur)} foot={`${fmtMoney(totals.ded, cur)} deductions`} />
        <Kpi icon="clock" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Pending" value={approved ? fmtMoney(0, cur) : fmtMoney(totals.net, cur)} foot={approved ? 'cleared' : ran ? (canApprove ? 'ready to approve' : 'awaiting approval') : (canRun ? 'ready to run' : 'awaiting Admin to run')} />
      </div>

      {/* Run table */}
      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <Search value={q} onChange={setQ} placeholder="Search staff, role, department…" style={{ flex: 1, minWidth: 220 }} />
          <span className="t-sm muted">{rows.length} of {lines.length} staff</span>
          <Btn size="sm" variant="secondary" icon="download" disabled={lines.length === 0} onClick={exportCsv}>Export CSV</Btn>
        </div>
        <DataTable<PayrollLine>
          columns={columns}
          rows={rows}
          pageSize={10}
          rowKey={(r) => `${r.personType}:${r.personId}`}
          initialSort={{ key: 'net', dir: 'desc' }}
          empty={<Empty icon="briefcase" title="No staff on payroll" body="Add teachers and staff, then set each person's salary in their profile — or define a salary structure for their role." />}
        />
      </Card>

      {payslip && (
        <PayslipModal
          line={payslip}
          cur={cur}
          periodText={periodLabel(period)}
          status={status}
          schoolName={app.school.name}
          schoolCity={app.school.city}
          logoUrl={app.school.logoUrl}
          logoInitials={app.school.logo}
          brandColor={app.school.color}
          onClose={() => setPayslip(null)}
        />
      )}
    </div>
  )
}

function PayslipModal({
  line, cur, periodText, status, schoolName, schoolCity, logoUrl, logoInitials, brandColor, onClose,
}: {
  line: PayrollLine
  cur: string
  periodText: string
  status: string
  schoolName: string
  schoolCity?: string
  logoUrl?: string | null
  logoInitials?: string
  brandColor?: string
  onClose: () => void
}) {
  const earn = (label: string, amt: number) => amt > 0 && (
    <div className="row ai-center jc-between" style={{ padding: '5px 0' }}>
      <span className="muted">{label}</span><span className="fw6">{fmtMoney(amt, cur)}</span>
    </div>
  )
  const ded = (label: string, amt: number) => amt > 0 && (
    <div className="row ai-center jc-between" style={{ padding: '5px 0' }}>
      <span className="muted">{label}</span><span className="fw6">− {fmtMoney(amt, cur)}</span>
    </div>
  )
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon="doc"
      title={`Payslip · ${line.name}`}
      sub={`${periodText} · ${line.role || (line.personType === 'teacher' ? 'Teacher' : line.personType === 'leadership' ? 'Leadership' : 'Staff')}`}
      footer={
        <div className="row ai-center jc-between wrap gap8" style={{ width: '100%' }}>
          <span className="t-sm muted">Net pay <span className="fw7" style={{ color: 'var(--success)' }}>{fmtMoney(line.net, cur)}</span></span>
          <div className="row ai-center gap8">
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
            <Btn variant="primary" icon="download" onClick={() => downloadPayslip(line, { schoolName, schoolCity, periodLabel: periodText, currency: cur, status, logoUrl, logoInitials, brandColor }, periodText)}>Download PDF</Btn>
          </div>
        </div>
      }
    >
      <div className="sm-grid-2 gap16">
        <Card>
          <div className="fw7" style={{ marginBottom: 6 }}>Earnings</div>
          {earn('Basic', line.basic)}
          {earn('HRA', line.hra)}
          {earn('Allowances', line.allowances)}
          <div className="row ai-center jc-between" style={{ paddingTop: 8, marginTop: 4, borderTop: '2px solid var(--border)' }}>
            <span className="fw7">Gross</span><span className="fw7">{fmtMoney(line.gross, cur)}</span>
          </div>
        </Card>
        <Card>
          <div className="fw7" style={{ marginBottom: 6 }}>Deductions</div>
          {ded('EPF', line.epf)}
          {ded('Professional tax', line.profTax)}
          {ded('Other deductions', line.otherDeductions)}
          {line.deductions === 0 && <div className="t-sm muted" style={{ padding: '5px 0' }}>No deductions</div>}
          <div className="row ai-center jc-between" style={{ paddingTop: 8, marginTop: 4, borderTop: '2px solid var(--border)' }}>
            <span className="fw7">Total</span><span className="fw7">− {fmtMoney(line.deductions, cur)}</span>
          </div>
        </Card>
      </div>
    </Modal>
  )
}

/* ---------- Salary structure editor (templates by role / designation) ---------- */
type StructDraft = SalaryComponents & { dirty?: boolean }

function structKey(type: PersonType, roleKey: string): string {
  return `${type}:${roleKey.trim().toLowerCase()}`
}

function SalaryStructureTab() {
  const app = useApp()
  const cur = app.school.currency
  const canEdit = can(app.role, 'hr', 'E')
  const toast = useToast()
  const structuresQ = useSalaryStructures()
  const upsertMut = useUpsertSalaryStructure()
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  // Leadership headcount comes from CRM login users (admin/owner may read the list).
  const canReadUsers = app.role === 'owner' || app.role === 'admin'
  const usersQ = useQuery({
    queryKey: queryKeys.users.all,
    queryFn: listSchoolUsers,
    enabled: canReadUsers,
  })

  const saved = useMemo(() => {
    const m = new Map<string, SalaryStructure>()
    for (const s of structuresQ.data ?? []) m.set(structKey(s.personType, s.roleKey), s)
    return m
  }, [structuresQ.data])

  // How many people currently hold each role/designation (impact of a template).
  const headcount = useMemo(() => {
    const m = new Map<string, number>()
    const bump = (type: PersonType, roleKey: string) => {
      const k = structKey(type, roleKey)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    for (const t of teachersQ.data ?? []) if (t.desig) bump('teacher', t.desig)
    for (const s of staffQ.data ?? []) if (s.role) bump('staff', s.role)
    for (const u of usersQ.data ?? []) {
      const roles = u.roles.map((r) => fromApiRole(r))
      // Owner takes precedence over Principal when a user holds both (mirrors the backend).
      if (roles.includes('owner')) bump('leadership', 'Owner')
      else if (roles.includes('principal')) bump('leadership', 'Principal')
    }
    return m
  }, [teachersQ.data, staffQ.data, usersQ.data])

  // draft edits, keyed by `${type}:${roleKey}`
  const [draft, setDraft] = useState<Record<string, StructDraft>>({})

  const componentsFor = (type: PersonType, roleKey: string): SalaryComponents => {
    const k = structKey(type, roleKey)
    const d = draft[k]
    if (d) return d
    const s = saved.get(k)
    return s
      ? { basic: s.basic, hra: s.hra, allowances: s.allowances, epf: s.epf, profTax: s.profTax, otherDeductions: s.otherDeductions }
      : { basic: 0, hra: 0, allowances: 0, epf: 0, profTax: 0, otherDeductions: 0 }
  }

  const setField = (type: PersonType, roleKey: string, field: keyof SalaryComponents, value: string) => {
    const k = structKey(type, roleKey)
    setDraft((prev) => ({
      ...prev,
      [k]: { ...componentsFor(type, roleKey), ...prev[k], [field]: toAmount(value), dirty: true },
    }))
  }

  const saveRow = (type: PersonType, roleKey: string) => {
    const c = componentsFor(type, roleKey)
    upsertMut.mutate(
      { personType: type, roleKey, ...c },
      {
        onSuccess: () => {
          setDraft((prev) => {
            const next = { ...prev }
            delete next[structKey(type, roleKey)]
            return next
          })
          toast.success('Salary structure saved', `${roleKey} · ${fmtMoney(computeSalary(c).net, cur)} net / month.`)
        },
        onError: (e) => toast.danger('Could not save structure', e.message),
      },
    )
  }

  const renderSection = (type: PersonType, title: string, icon: string, roles: readonly string[]) => {
    const extra = (structuresQ.data ?? [])
      .filter((s) => s.personType === type && !roles.some((r) => r.toLowerCase() === s.roleKey.toLowerCase()))
      .map((s) => s.roleKey)
    const allRoles = [...roles, ...extra]

    // Estimated monthly cost if every person in these roles were paid by the structure.
    let people = 0
    let monthlyCost = 0
    for (const roleKey of allRoles) {
      const n = headcount.get(structKey(type, roleKey)) ?? 0
      people += n
      monthlyCost += computeSalary(componentsFor(type, roleKey)).net * n
    }

    return (
      <Card pad={false} style={{ marginBottom: 16 }}>
        <CardHead title={title} icon={icon} sub={`${allRoles.length} roles · ${people} people · net is auto-computed`} />
        <div className="sm-struct-table">
          <div className="sm-struct-row sm-struct-head">
            <div>Role</div>
            <div className="ar">People</div>
            <div className="ar">Basic</div>
            <div className="ar">HRA</div>
            <div className="ar">Allowances</div>
            <div className="ar">EPF</div>
            <div className="ar">Prof. tax</div>
            <div className="ar">Other ded.</div>
            <div className="ar">Gross</div>
            <div className="ar">Net / month</div>
            <div />
          </div>
          {allRoles.map((roleKey) => {
            const c = componentsFor(type, roleKey)
            const { gross, net } = computeSalary(c)
            const k = structKey(type, roleKey)
            const isDirty = !!draft[k]?.dirty
            const n = headcount.get(k) ?? 0
            const num = (field: keyof SalaryComponents) => (
              <input
                className="sm-struct-input"
                type="number"
                min={0}
                value={c[field] || ''}
                placeholder="0"
                disabled={!canEdit}
                onChange={(e) => setField(type, roleKey, field, e.target.value)}
              />
            )
            return (
              <div className="sm-struct-row" key={k}>
                <div className="fw6">{roleKey}</div>
                <div className="ar">{n > 0 ? <Badge tone="info">{n}</Badge> : <span className="muted">0</span>}</div>
                <div className="ar">{num('basic')}</div>
                <div className="ar">{num('hra')}</div>
                <div className="ar">{num('allowances')}</div>
                <div className="ar">{num('epf')}</div>
                <div className="ar">{num('profTax')}</div>
                <div className="ar">{num('otherDeductions')}</div>
                <div className="ar">{fmtMoney(gross, cur)}</div>
                <div className="ar fw7">{fmtMoney(net, cur)}</div>
                <div className="ar">
                  <Btn
                    size="sm"
                    variant={isDirty ? 'primary' : 'ghost'}
                    icon="check"
                    disabled={!canEdit || !isDirty || upsertMut.isPending}
                    onClick={() => saveRow(type, roleKey)}
                  >
                    Save
                  </Btn>
                </div>
              </div>
            )
          })}
        </div>
        <div className="row ai-center jc-between wrap" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <span className="t-sm muted">Est. monthly cost by structure · {people} people in these roles</span>
          <span className="fw7">{fmtMoney(monthlyCost, cur)}</span>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <Card className="row ai-center gap10 wrap" style={{ marginBottom: 16 }}>
        <span className="sm-kpi-ic" style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}><Icon name="layers" size={18} /></span>
        <div className="t-sm">
          <span className="fw6">Salary structure by role &amp; designation.</span>{' '}
          <span className="muted">
            Set a default pay package per role once. Anyone with that role inherits it automatically when payroll runs —
            unless they have their own salary on their profile, which always wins.
          </span>
        </div>
      </Card>

      {renderSection('teacher', 'Teaching staff — by designation', 'book', TEACHER_DESIGNATIONS)}
      {renderSection('staff', 'Support staff — by role', 'users', STAFF_ROLES)}
      {renderSection('leadership', 'Leadership — Principal & Owner', 'briefcase', LEADERSHIP_ROLES)}
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
