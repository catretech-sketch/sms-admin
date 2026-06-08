/* ============================================================
   SchoolMate — Owner console: Portfolio overview, Schools list
   (+ branded account report) and the 5-step Create-school wizard.
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import {
  PageHead, Card, CardHead, Kpi, Btn, Badge, TierPill, Avatar, Search, Select, Segmented,
  Field, Input, Modal, Icon, Empty, Donut, Bars, LineChart, Legend, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui'
import { schools, TIERS, TIER_META } from '@/data/mockDb'
import { fmtMoney, fmtNum } from '@/lib/format'
import type { School, Tier } from '@/types'

/* ============================================================
   Shared: student-strength-based per-student pricing bands
   (smaller schools pay more per student; volume discounts apply)
   ============================================================ */
const PRICE_BANDS: { max: number; rates: [number, number, number] }[] = [
  { max: 500, rates: [120, 300, 520] },
  { max: 1500, rates: [96, 240, 430] },
  { max: 3000, rates: [78, 190, 340] },
  { max: Infinity, rates: [64, 160, 290] },
]
/* rates are ordered to match TIERS = ['silver','gold','platinum'] */
function priceBand(strength: number): [number, number, number] {
  return (PRICE_BANDS.find((b) => strength <= b.max) ?? PRICE_BANDS[PRICE_BANDS.length - 1]).rates
}
function rateFor(strength: number, tier: Tier): number {
  return priceBand(strength)[TIERS.indexOf(tier)]
}
function recommendedTier(strength: number): Tier {
  if (strength <= 500) return 'silver'
  if (strength <= 2000) return 'gold'
  return 'platinum'
}

const STATUS_TONE: Record<School['status'], BadgeTone> = {
  active: 'success',
  trial: 'info',
  past_due: 'danger',
}
const STATUS_LABEL: Record<School['status'], string> = {
  active: 'Active',
  trial: 'Trial',
  past_due: 'Past due',
}

/* compact INR (e.g. ₹1.92L / ₹2.4Cr) for tight chart/price lines */
function fmtCompact(n: number): string {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + 'Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + 'L'
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K'
  return '₹' + n
}

/* ============================================================
   1) Portfolio overview (Owner dashboard)
   ============================================================ */
function OwnerDashboard() {
  const app = useApp()

  const totals = useMemo(() => {
    const students = schools.reduce((a, s) => a + s.students, 0)
    const staff = schools.reduce((a, s) => a + s.staff, 0)
    const mrr = schools.reduce((a, s) => a + s.mrr, 0)
    const att = schools.reduce((a, s) => a + s.attendance, 0) / schools.length
    return { students, staff, mrr, att: +att.toFixed(1) }
  }, [])

  const planCounts = useMemo(() => {
    const c: Record<Tier, number> = { silver: 0, gold: 0, platinum: 0 }
    schools.forEach((s) => { c[s.plan]++ })
    return c
  }, [])

  const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  /* synthetic monthly trend climbing to the live totals */
  const mrrTrend = [0.86, 0.88, 0.91, 0.93, 0.96, 0.98, 1].map((f) => Math.round(totals.mrr * f))
  const enrolTrend = [0.9, 0.92, 0.94, 0.95, 0.97, 0.99, 1].map((f) => Math.round(totals.students * f))

  const alerts = schools.filter((s) => s.status !== 'active' || s.fees < 70)

  return (
    <div className="col gap20">
      <PageHead
        title="Portfolio overview"
        sub="Consolidated performance across all schools"
        actions={
          <div className="row gap8">
            <Btn icon="building" onClick={() => app.go('owner.schools')}>All schools</Btn>
            <Btn variant="primary" icon="plus" onClick={() => app.go('owner.create')}>Create school</Btn>
          </div>
        }
      />

      {/* ---- KPI row ---- */}
      <div className="sm-kpi-grid">
        <Kpi
          icon="building" iconBg="var(--brand-50)" iconColor="var(--brand-600)"
          label="Total schools" value={fmtNum(schools.length)}
          delta="1" deltaDir="up" foot={`${planCounts.platinum} Platinum · ${planCounts.gold} Gold · ${planCounts.silver} Silver`}
        />
        <Kpi
          icon="users" iconBg="var(--info-bg)" iconColor="var(--info)"
          label="Total students" value={fmtNum(totals.students)}
          delta="4.2%" deltaDir="up" foot={`${fmtNum(totals.staff)} staff across portfolio`}
          spark={enrolTrend} sparkColor="var(--info)"
        />
        <Kpi
          icon="rupee" iconBg="var(--success-bg)" iconColor="var(--success)"
          label="Total MRR" value={fmtMoney(totals.mrr)}
          delta="6.1%" deltaDir="up" foot={`${fmtMoney(totals.mrr * 12)} annual run-rate`}
          spark={mrrTrend} sparkColor="var(--success)"
        />
        <Kpi
          icon="check" iconBg="var(--warning-bg)" iconColor="var(--warning)"
          label="Avg attendance" value={totals.att + '%'}
          delta="0.4%" deltaDir="up" foot="Weighted across active schools"
        />
      </div>

      {/* ---- Trend + plan distribution ---- */}
      <div className="sm-grid-2">
        <Card>
          <CardHead title="MRR & enrolment trend" sub="Last 7 months · portfolio-wide" icon="trend" />
          <div style={{ marginTop: 12 }}>
            <LineChart
              series={[
                { data: mrrTrend, color: 'var(--success)', label: 'MRR' },
                { data: enrolTrend, color: 'var(--info)', label: 'Students' },
              ]}
              labels={months}
              yFmt={(v) => fmtCompact(v)}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <Legend items={[
              { color: 'var(--success)', label: 'MRR (₹)' },
              { color: 'var(--info)', label: 'Students' },
            ]} />
          </div>
        </Card>

        <Card>
          <CardHead title="Plan distribution" sub="Schools by subscription tier" icon="layers" />
          <div className="row ai-center jc-between gap16 wrap" style={{ marginTop: 12 }}>
            <Donut
              segments={TIERS.map((t) => ({ value: planCounts[t], color: TIER_META[t].color, label: TIER_META[t].label }))}
              size={148} thickness={18}
              center={
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{schools.length}</div>
                  <div className="t-xs muted3" style={{ marginTop: 2 }}>schools</div>
                </div>
              }
            />
            <div className="col gap12" style={{ flex: 1, minWidth: 160 }}>
              <Legend items={TIERS.map((t) => ({ color: TIER_META[t].color, label: `${TIER_META[t].label} — ${planCounts[t]}` }))} />
              <div className="t-sm muted">Platinum tenants drive the largest share of MRR.</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ---- Per-school revenue + alerts ---- */}
      <div className="sm-grid-2">
        <Card>
          <CardHead title="Revenue by school" sub="Monthly recurring revenue" icon="rupee" />
          <div style={{ marginTop: 12 }}>
            <Bars
              data={schools.map((s) => ({ value: s.mrr, label: s.logo, color: s.color }))}
              h={160} valueFmt={(v) => fmtCompact(v)}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Attention needed" sub="Trials, billing & low collection" icon="alert" action={<Badge tone="warning">{alerts.length}</Badge>} />
          {alerts.length === 0 ? (
            <Empty icon="checkCircle" title="All healthy" body="No schools need attention right now." />
          ) : (
            <div className="col gap12" style={{ marginTop: 12 }}>
              {alerts.map((s) => {
                const reason = s.status === 'past_due' ? 'Payment past due'
                  : s.status === 'trial' ? 'On trial — convert to paid'
                    : `Low fee collection — ${s.fees}%`
                const tone: BadgeTone = s.status === 'past_due' ? 'danger' : s.status === 'trial' ? 'info' : 'warning'
                return (
                  <div key={s.id} className="row ai-center gap12">
                    <Avatar name={s.logo} size={34} style={{ background: s.color, borderRadius: 9 }} />
                    <div style={{ flex: 1 }}>
                      <div className="t-md fw6">{s.name}</div>
                      <div className="t-xs muted3">{s.city}</div>
                    </div>
                    <Badge tone={tone}>{reason}</Badge>
                    <Btn size="sm" onClick={() => app.enterSchool(s.id)}>Open</Btn>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ============================================================
   2) Schools list (+ branded account report modal)
   ============================================================ */
function OwnerSchools() {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [plan, setPlan] = useState('all')
  const [status, setStatus] = useState('all')
  const [report, setReport] = useState<School | null>(null)
  const [upgrade, setUpgrade] = useState<School | null>(null)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return schools.filter((s) => {
      if (plan !== 'all' && s.plan !== plan) return false
      if (status !== 'all' && s.status !== status) return false
      if (needle && !(s.name.toLowerCase().includes(needle) || s.city.toLowerCase().includes(needle))) return false
      return true
    })
  }, [q, plan, status])

  const columns: Column<School>[] = [
    {
      key: 'name', label: 'School', sortValue: (s) => s.name,
      render: (s) => (
        <div className="row ai-center gap12">
          <Avatar name={s.logo} size={36} style={{ background: s.color, borderRadius: 9 }} />
          <div>
            <div className="t-md fw6">{s.name}</div>
            <div className="t-xs muted3">{s.city} · {s.tz}</div>
          </div>
        </div>
      ),
    },
    { key: 'plan', label: 'Plan', sortValue: (s) => s.plan, render: (s) => <TierPill plan={s.plan} /> },
    { key: 'students', label: 'Students', align: 'right', sortValue: (s) => s.students, render: (s) => fmtNum(s.students) },
    { key: 'staff', label: 'Staff', align: 'right', sortValue: (s) => s.staff, render: (s) => fmtNum(s.staff) },
    { key: 'attendance', label: 'Attendance', align: 'right', sortValue: (s) => s.attendance, render: (s) => s.attendance + '%' },
    { key: 'fees', label: 'Fees %', align: 'right', sortValue: (s) => s.fees, render: (s) => <span style={{ color: s.fees < 70 ? 'var(--warning)' : undefined }}>{s.fees}%</span> },
    { key: 'mrr', label: 'MRR', align: 'right', sortValue: (s) => s.mrr, render: (s) => fmtMoney(s.mrr, s.currency) },
    { key: 'status', label: 'Status', sortValue: (s) => s.status, render: (s) => <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge> },
    {
      key: 'actions', label: '', align: 'right',
      render: (s) => (
        <div className="row gap6 jc-end">
          {s.plan !== 'platinum' && (
            <Btn size="sm" variant="secondary" icon="sparkle" onClick={() => setUpgrade(s)}>Upgrade</Btn>
          )}
          <Btn size="sm" variant="primary" icon="arrowRight" onClick={() => app.enterSchool(s.id)}>Open</Btn>
          <Btn size="sm" icon="doc" onClick={() => setReport(s)}>Account report</Btn>
        </div>
      ),
    },
  ]

  return (
    <div className="col gap20">
      <PageHead
        title="Schools"
        sub={`${schools.length} tenants in your portfolio`}
        actions={<Btn variant="primary" icon="plus" onClick={() => app.go('owner.create')}>Create school</Btn>}
      />

      <Card pad={false}>
        <div className="row ai-center gap12 wrap" style={{ padding: 16 }}>
          <Search value={q} onChange={setQ} placeholder="Search by name or city…" style={{ flex: 1, minWidth: 220 }} />
          <Select
            value={plan} onChange={(e) => setPlan(e.target.value)}
            options={[{ value: 'all', label: 'All plans' }, ...TIERS.map((t) => ({ value: t, label: TIER_META[t].label }))]}
          />
          <Select
            value={status} onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'trial', label: 'Trial' },
              { value: 'past_due', label: 'Past due' },
            ]}
          />
        </div>

        <DataTable<School>
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          pageSize={10}
          initialSort={{ key: 'mrr', dir: 'desc' }}
          bulk
          bulkActions={(selected, clear) => (
            <>
              <Btn size="sm" icon="message" onClick={() => { toast.info('Message queued', `Broadcast drafted to ${selected.length} schools.`); clear() }}>Message</Btn>
              <Btn size="sm" icon="download" onClick={() => { toast.success('Export started', `${selected.length} schools queued for export.`); clear() }}>Export</Btn>
            </>
          )}
          empty={<Empty icon="building" title="No schools match" body="Try adjusting your search or filters." />}
        />
      </Card>

      <AccountReportModal school={report} onClose={() => setReport(null)} />
      <UpgradePlanModal key={upgrade?.id} school={upgrade} onClose={() => setUpgrade(null)} />
    </div>
  )
}

/* ---------- Upgrade plan modal (from Schools list) ---------- */
function UpgradePlanModal({ school, onClose }: { school: School | null; onClose: () => void }) {
  const toast = useToast()
  const curIdx = school ? TIERS.indexOf(school.plan) : 0
  const [tier, setTier] = useState<Tier>(TIERS[Math.min(curIdx + 1, TIERS.length - 1)])
  if (!school) return null
  const s = school
  const seats = s.students
  const curAnnual = seats * rateFor(seats, s.plan)
  const newAnnual = seats * rateFor(seats, tier)
  const diff = newAnnual - curAnnual

  const apply = () => {
    if (TIERS.indexOf(tier) <= curIdx) {
      toast.info('No upgrade', `${s.name} is already on ${TIER_META[s.plan].label}.`)
      return
    }
    toast.success('Plan upgraded', `${s.name} → ${TIER_META[tier].label} · ${fmtMoney(newAnnual, s.currency)}/yr (+${fmtMoney(diff, s.currency)}/yr).`)
    onClose()
  }

  return (
    <Modal
      open onClose={onClose} icon="sparkle" size="md"
      title={`Upgrade plan · ${s.name}`}
      sub={`${fmtNum(seats)} students · currently ${TIER_META[s.plan].label}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={TIERS.indexOf(tier) <= curIdx} onClick={apply}>Confirm upgrade</Btn>
        </div>
      }
    >
      <div className="col gap10">
        {TIERS.map((t) => {
          const idx = TIERS.indexOf(t)
          const isCurrent = idx === curIdx
          const isLower = idx < curIdx
          const rate = rateFor(seats, t)
          const annual = seats * rate
          const selected = t === tier && !isCurrent && !isLower
          return (
            <div key={t}
              className="sm-card pad row ai-center jc-between gap12"
              style={{
                cursor: isLower || isCurrent ? 'not-allowed' : 'pointer',
                opacity: isLower ? 0.5 : 1,
                borderColor: selected ? TIER_META[t].color : undefined,
                borderWidth: selected ? 2 : undefined,
              }}
              onClick={() => { if (!isLower && !isCurrent) setTier(t) }}
            >
              <div className="row ai-center gap10">
                <TierPill plan={t} size="md" />
                {isCurrent && <Badge tone="neutral">Current</Badge>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="fw7">{fmtMoney(annual, s.currency)}/yr</div>
                <div className="t-xs muted">{fmtNum(seats)} × {fmtMoney(rate, s.currency)}/student/yr</div>
              </div>
            </div>
          )
        })}
        <div className="sm-card pad row ai-center jc-between" style={{ background: 'var(--brand-50)' }}>
          <span className="t-sm muted">New annual value</span>
          <span className="fw7">
            {fmtMoney(newAnnual, s.currency)}/yr{' '}
            <span className="t-xs" style={{ color: 'var(--success)' }}>(+{fmtMoney(diff, s.currency)})</span>
          </span>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- Branded account report ---------- */
function AccountReportModal({ school, onClose }: { school: School | null; onClose: () => void }) {
  if (!school) return null
  const s = school
  const rate = rateFor(s.students, s.plan)
  const annual = s.students * rate
  const ref = `AR-${s.id.toUpperCase()}-${new Date().getFullYear()}`
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const metrics: { label: string; value: string }[] = [
    { label: 'Students enrolled', value: fmtNum(s.students) },
    { label: 'Staff', value: fmtNum(s.staff) },
    { label: 'Attendance', value: s.attendance + '%' },
    { label: 'Fee collection', value: s.fees + '%' },
  ]
  const details: { label: string; value: string }[] = [
    { label: 'Account manager', value: 'Anil Mehta' },
    { label: 'Billing contact', value: `accounts@${s.id}.edu` },
    { label: 'Monthly recurring revenue', value: fmtMoney(s.mrr, s.currency) },
    { label: 'Onboarded', value: 'Apr 2024' },
    { label: 'Support tier', value: s.plan === 'platinum' ? 'Dedicated' : s.plan === 'gold' ? 'Priority' : 'Standard' },
    { label: 'Time zone', value: s.tz },
  ]

  return (
    <Modal open={!!school} onClose={onClose} size="lg" title="Account report"
      footer={
        <div className="row jc-between" style={{ width: '100%' }}>
          <Btn onClick={onClose}>Close</Btn>
          <Btn variant="primary" icon="download" onClick={() => window.print()}>Print report</Btn>
        </div>
      }
    >
      <div className="col gap20" id="sm-account-report">
        {/* branded header underlined in the school's brand colour */}
        <div className="row ai-center gap16" style={{ paddingBottom: 16, borderBottom: `3px solid ${s.color}` }}>
          <Avatar name={s.logo} size={56} style={{ background: s.color, borderRadius: 14 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-lg fw7" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
            <div className="t-sm muted">{s.city} · {s.currency} · {s.tz}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-md fw6" style={{ color: s.color }}>Account Report</div>
            <div className="t-xs muted3">{ref}</div>
            <div className="t-xs muted3">{today}</div>
          </div>
        </div>

        {/* subscription */}
        <div>
          <div className="t-sm fw6 muted" style={{ marginBottom: 10 }}>Subscription</div>
          <div className="sm-grid-3">
            <ReportTile label="Plan" value={<TierPill plan={s.plan} size="md" />} />
            <ReportTile label="Status" value={<Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>} />
            <ReportTile label="Annual value" value={<span className="fw7">{fmtMoney(annual, s.currency)}</span>} sub={`${fmtNum(s.students)} × ${s.currency} ${rate}/yr`} />
          </div>
          <div className="t-xs muted3" style={{ marginTop: 8 }}>Renews 01 Apr {new Date().getFullYear() + 1} · {s.currency} {rate}/student/yr ({TIER_META[s.plan].label} band)</div>
        </div>

        {/* key metrics */}
        <div>
          <div className="t-sm fw6 muted" style={{ marginBottom: 10 }}>Key metrics</div>
          <div className="sm-kpi-grid">
            {metrics.map((m) => <ReportTile key={m.label} label={m.label} value={<span className="fw7">{m.value}</span>} />)}
          </div>
        </div>

        {/* account details */}
        <div>
          <div className="t-sm fw6 muted" style={{ marginBottom: 10 }}>Account details</div>
          <div className="col gap8">
            {details.map((d) => (
              <div key={d.label} className="row ai-center jc-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <span className="t-sm muted">{d.label}</span>
                <span className="t-sm fw6">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ReportTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="sm-card pad" style={{ background: 'var(--surface-2)' }}>
      <div className="t-xs muted3">{label}</div>
      <div style={{ marginTop: 6 }}>{value}</div>
      {sub && <div className="t-xs muted3" style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

/* ============================================================
   3) Create-school wizard (5 steps)
   ============================================================ */
const WIZARD_STEPS = ['Basics', 'Admin contact', 'Plan & tier', 'Modules', 'Review']

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York']

const MODULE_OPTIONS: { key: string; label: string; desc: string; tier: Tier }[] = [
  { key: 'sis', label: 'Student Information', desc: 'Admissions, profiles, records', tier: 'silver' },
  { key: 'attendance', label: 'Attendance', desc: 'Daily marking & reports', tier: 'silver' },
  { key: 'exams', label: 'Exams & report cards', desc: 'Marks entry, results', tier: 'silver' },
  { key: 'fees', label: 'Fees & collection', desc: 'Invoicing, receipts', tier: 'silver' },
  { key: 'communication', label: 'Communication', desc: 'SMS, push, messenger', tier: 'silver' },
  { key: 'hr_payroll', label: 'HR & payroll', desc: 'Staff salary runs', tier: 'gold' },
  { key: 'analytics', label: 'Advanced analytics', desc: 'Weak-student insights', tier: 'gold' },
  { key: 'transport_gps', label: 'Transport GPS', desc: 'Live bus tracking', tier: 'platinum' },
]

type BillingCycle = 'monthly' | 'quarterly' | 'yearly'
const CYCLE_META: Record<BillingCycle, { label: string; div: number; per: string }> = {
  monthly: { label: 'Monthly', div: 12, per: '/mo' },
  quarterly: { label: 'Quarterly', div: 4, per: '/qtr' },
  yearly: { label: 'Yearly', div: 1, per: '/yr' },
}

interface WizardData {
  name: string
  city: string
  tz: string
  adminName: string
  adminEmail: string
  adminPhone: string
  strength: number
  tier: Tier
  cycle: BillingCycle
  modules: Set<string>
}

function CreateSchoolWizard() {
  const app = useApp()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>({
    name: '', city: '', tz: 'Asia/Kolkata',
    adminName: '', adminEmail: '', adminPhone: '',
    strength: 800, tier: 'gold', cycle: 'yearly',
    modules: new Set(['sis', 'attendance', 'exams', 'fees', 'communication']),
  })

  const set = <K extends keyof WizardData>(key: K, value: WizardData[K]) =>
    setData((d) => ({ ...d, [key]: value }))

  const toggleModule = (key: string) =>
    setData((d) => {
      const next = new Set(d.modules)
      if (next.has(key)) next.delete(key); else next.add(key)
      return { ...d, modules: next }
    })

  const canNext = (() => {
    if (step === 0) return data.name.trim() !== '' && data.city.trim() !== ''
    if (step === 1) return data.adminName.trim() !== '' && data.adminEmail.trim() !== ''
    if (step === 2) return data.strength > 0
    return true
  })()

  const annual = data.strength * rateFor(data.strength, data.tier)
  const cycleMeta = CYCLE_META[data.cycle]
  const cyclePrice = Math.round(annual / cycleMeta.div)

  const create = () => {
    toast.success('School created', `${data.name} is ready — ${TIER_META[data.tier].label} plan · ${fmtMoney(cyclePrice)}${cycleMeta.per} (${cycleMeta.label.toLowerCase()}).`)
    app.go('owner.schools')
  }

  return (
    <div className="col gap20">
      <PageHead
        title="Create school"
        sub="Add a new tenant to your portfolio"
        actions={<Btn icon="arrowLeft" onClick={() => app.go('owner.schools')}>Back to schools</Btn>}
      />

      {/* stepper */}
      <Card>
        <div className="row ai-center jc-between wrap gap12">
          {WIZARD_STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'current' : 'todo'
            const bg = state === 'todo' ? 'var(--surface-3)' : 'var(--brand-600)'
            const fg = state === 'todo' ? 'var(--text-3)' : '#fff'
            return (
              <div key={label} className="row ai-center gap10" style={{ flex: 1, minWidth: 130 }}>
                <span style={{
                  width: 30, height: 30, borderRadius: 999, background: bg, color: fg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, flexShrink: 0,
                }}>
                  {state === 'done' ? <Icon name="check" size={15} stroke={3} /> : i + 1}
                </span>
                <div>
                  <div className="t-xs muted3">Step {i + 1}</div>
                  <div className="t-sm fw6" style={{ color: state === 'current' ? 'var(--text-1)' : undefined }}>{label}</div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        {step === 0 && (
          <div className="col gap16">
            <CardHead title="Basics" sub="Name, location and time zone" icon="building" />
            <Field label="School name" required>
              <Input icon="building" value={data.name} placeholder="e.g. Riverdale International School" onChange={(e) => set('name', e.target.value)} />
            </Field>
            <div className="sm-grid-2">
              <Field label="City" required>
                <Input icon="pin" value={data.city} placeholder="e.g. Bengaluru" onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="Time zone">
                <Select options={TIMEZONES} value={data.tz} onChange={(e) => set('tz', e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="col gap16">
            <CardHead title="Admin contact" sub="Primary administrator for this school" icon="user" />
            <Field label="Administrator name" required>
              <Input icon="user" value={data.adminName} placeholder="Full name" onChange={(e) => set('adminName', e.target.value)} />
            </Field>
            <div className="sm-grid-2">
              <Field label="Email" required>
                <Input icon="message" type="email" value={data.adminEmail} placeholder="admin@school.edu" onChange={(e) => set('adminEmail', e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input icon="phone" value={data.adminPhone} placeholder="+91 90000 00000" onChange={(e) => set('adminPhone', e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && <PlanStep data={data} onStrength={(v) => set('strength', v)} onTier={(t) => set('tier', t)} onCycle={(c) => set('cycle', c)} />}

        {step === 3 && (
          <div className="col gap16">
            <CardHead title="Modules & features" sub="Enable the modules this school will use" icon="layers" />
            <div className="sm-grid-2">
              {MODULE_OPTIONS.map((m) => {
                const on = data.modules.has(m.key)
                const locked = TIERS.indexOf(m.tier) > TIERS.indexOf(data.tier)
                return (
                  <div key={m.key}
                    className="sm-card pad row ai-center jc-between gap12"
                    style={{
                      cursor: locked ? 'not-allowed' : 'pointer',
                      borderColor: on && !locked ? 'var(--brand-600)' : undefined,
                      opacity: locked ? 0.55 : 1,
                    }}
                    onClick={() => { if (!locked) toggleModule(m.key) }}
                  >
                    <div>
                      <div className="t-md fw6 row ai-center gap6">
                        {m.label}
                        {m.tier !== 'silver' && <TierPill plan={m.tier} />}
                      </div>
                      <div className="t-xs muted3" style={{ marginTop: 2 }}>{locked ? `Requires ${TIER_META[m.tier].label} plan` : m.desc}</div>
                    </div>
                    <Icon name={on && !locked ? 'checkCircle' : locked ? 'lock' : 'plus'} size={18}
                      style={{ color: on && !locked ? 'var(--brand-600)' : 'var(--text-3)' }} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {step === 4 && <ReviewStep data={data} />}

        {/* nav buttons + running price summary */}
        <div className="sm-divider" style={{ margin: '20px 0 16px' }} />
        <div className="row ai-center jc-between gap12 wrap">
          <Btn icon="arrowLeft" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Btn>
          <div className="row ai-center gap8 t-sm muted" style={{ marginLeft: 'auto' }}>
            <TierPill plan={data.tier} />
            <span>{fmtNum(data.strength)} students ·</span>
            <span className="fw7" style={{ color: 'var(--text)' }}>{fmtMoney(cyclePrice)}{cycleMeta.per}</span>
            {data.cycle !== 'yearly' && <span className="t-xs muted3">({fmtMoney(annual)}/yr)</span>}
          </div>
          {step < WIZARD_STEPS.length - 1 ? (
            <Btn variant="primary" iconRight="arrowRight" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Btn>
          ) : (
            <Btn variant="primary" icon="check" onClick={create}>Create school · {fmtMoney(cyclePrice)}{cycleMeta.per}</Btn>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ---------- Wizard step 3: plan & tier driven by student strength ---------- */
function PlanStep({ data, onStrength, onTier, onCycle }: { data: WizardData; onStrength: (v: number) => void; onTier: (t: Tier) => void; onCycle: (c: BillingCycle) => void }) {
  const strength = data.strength
  const band = priceBand(strength)
  const rec = recommendedTier(strength)
  const tierIdx = TIERS.indexOf(data.tier)
  const nextTier: Tier | null = tierIdx < TIERS.length - 1 ? TIERS[tierIdx + 1] : null
  const cm = CYCLE_META[data.cycle]
  const annualSel = strength * rateFor(strength, data.tier)
  const cycleSel = Math.round(annualSel / cm.div)

  return (
    <div className="col gap16">
      <CardHead title="Plan & tier" sub="Pricing scales with expected student strength" icon="rupee" />

      <div className="sm-grid-2">
        <Field label="Expected student strength" hint="Larger schools get volume discounts on the per-student rate.">
          <Input icon="users" type="number" min={1} value={strength}
            onChange={(e) => onStrength(Math.max(0, parseInt(e.target.value || '0', 10)))} />
        </Field>
        <div className="col jc-center">
          <div className="t-xs muted3">Current pricing band</div>
          <div className="t-md fw6">
            {strength <= 500 ? '≤ 500 students' : strength <= 1500 ? '501–1,500 students' : strength <= 3000 ? '1,501–3,000 students' : '3,000+ students'}
          </div>
          <div className="t-xs muted3" style={{ marginTop: 2 }}>Silver ₹{band[0]} · Gold ₹{band[1]} · Platinum ₹{band[2]} per student/yr</div>
        </div>
      </div>

      <Field label="Billing cycle" hint="Charged per student; the cycle only changes how often you're billed.">
        <Segmented
          value={data.cycle}
          onChange={(v) => onCycle(v as BillingCycle)}
          options={(Object.keys(CYCLE_META) as BillingCycle[]).map((c) => ({ value: c, label: CYCLE_META[c].label }))}
        />
      </Field>

      <div className="sm-grid-3">
        {TIERS.map((t) => {
          const rate = rateFor(strength, t)
          const total = strength * rate
          const cyclePrice = Math.round(total / cm.div)
          const selected = data.tier === t
          const m = TIER_META[t]
          return (
            <div key={t}
              className="sm-card pad col gap10"
              style={{ cursor: 'pointer', borderColor: selected ? m.color : undefined, borderWidth: selected ? 2 : undefined }}
              onClick={() => onTier(t)}
            >
              <div className="row ai-center jc-between">
                <TierPill plan={t} size="md" />
                {rec === t && <Badge tone="success" icon="sparkle">Recommended</Badge>}
              </div>
              <div>
                <div className="row ai-end gap6">
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{fmtMoney(cyclePrice)}</div>
                  <div className="t-xs muted3" style={{ marginBottom: 2 }}>{cm.per}</div>
                </div>
                <div className="t-xs muted3" style={{ marginTop: 3 }}>
                  {data.cycle === 'yearly' ? `₹${rate}/student/yr` : `${fmtMoney(total)}/yr · ₹${rate}/student`}
                </div>
              </div>
              <div className="t-xs muted">{fmtNum(strength)} students × ₹{rate} = {fmtMoney(total)}/yr</div>
              <div className="row ai-center gap6 t-sm" style={{ color: selected ? m.color : 'var(--text-3)' }}>
                <Icon name={selected ? 'checkCircle' : 'plus'} size={15} />
                {selected ? 'Selected' : 'Choose plan'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="sm-card pad row ai-center gap10 wrap" style={{ background: 'var(--brand-50)' }}>
        <Icon name="rupee" size={18} style={{ color: 'var(--brand-600)' }} />
        <span className="t-md fw6">
          {cm.label} · {fmtMoney(cycleSel)}{cm.per}
          {data.cycle !== 'yearly' && <span className="t-sm muted"> ({fmtMoney(annualSel)}/yr)</span>}
        </span>
        {nextTier ? (
          <Btn
            size="sm" variant="secondary" icon="sparkle" style={{ marginLeft: 'auto' }}
            onClick={() => onTier(nextTier)}
          >
            Upgrade to {TIER_META[nextTier].label} (+{fmtMoney(strength * rateFor(strength, nextTier) - strength * rateFor(strength, data.tier))}/yr)
          </Btn>
        ) : (
          <Badge tone="success" icon="checkCircle" style={{ marginLeft: 'auto' }}>Top tier selected</Badge>
        )}
      </div>
    </div>
  )
}

/* ---------- Wizard step 5: review ---------- */
function ReviewStep({ data }: { data: WizardData }) {
  const rate = rateFor(data.strength, data.tier)
  const annual = data.strength * rate
  const cm = CYCLE_META[data.cycle]
  const cyclePrice = Math.round(annual / cm.div)
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'School name', value: data.name || '—' },
    { label: 'City', value: data.city || '—' },
    { label: 'Time zone', value: data.tz },
    { label: 'Administrator', value: data.adminName || '—' },
    { label: 'Admin email', value: data.adminEmail || '—' },
    { label: 'Admin phone', value: data.adminPhone || '—' },
    { label: 'Student strength', value: fmtNum(data.strength) },
    { label: 'Plan', value: <TierPill plan={data.tier} /> },
    { label: 'Billing cycle', value: cm.label },
    { label: 'Per-student rate', value: `₹${rate}/yr` },
    { label: `Billed ${cm.label.toLowerCase()}`, value: <span className="fw7">{fmtMoney(cyclePrice)}{cm.per}</span> },
    { label: 'Annual value', value: <span className="fw7">{fmtMoney(annual)}</span> },
    { label: 'Modules enabled', value: `${data.modules.size} modules` },
  ]
  return (
    <div className="col gap16">
      <CardHead title="Review & confirm" sub="Verify the details before creating the school" icon="checkCircle" />
      <div className="col gap8">
        {rows.map((r) => (
          <div key={r.label} className="row ai-center jc-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <span className="t-sm muted">{r.label}</span>
            <span className="t-sm fw6">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- export contract ---------- */
export const portfolioScreens: Record<string, ComponentType> = {
  'owner.dashboard': OwnerDashboard,
  'owner.schools': OwnerSchools,
  'owner.create': CreateSchoolWizard,
}
