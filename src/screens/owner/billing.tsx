/* ============================================================
   SchoolMate — Owner console: Cross-school reports +
   Subscriptions & billing (with interactive plan calculator).
   Frontend-only, deterministic mock data. Sits above all
   schools (SaaS account level), so no single-school context.
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useToast } from '@/lib/hooks'
import {
  PageHead, Tabs, Card, CardHead, Kpi, Btn, Badge, TierPill, Segmented, Select, Field, Input,
  Modal, Icon, HBars, LineChart, Legend, Donut, DataTable, type Column, type BadgeTone,
} from '@/components/ui'
import { schools, TIERS, TIER_META } from '@/data/mockDb'
import { fmtMoney, fmtNum } from '@/lib/format'
import type { School, Tier } from '@/types'

/* ============================================================
   Shared pricing — volume-discounted ₹/student/yr, by strength
   band and tier. Identical bands to the create-school wizard.
   ============================================================ */
const RATE_TABLE: Record<Tier, [number, number, number, number]> = {
  silver: [120, 96, 78, 64],
  gold: [300, 240, 190, 160],
  platinum: [520, 430, 340, 290],
}
function strengthBand(n: number): 0 | 1 | 2 | 3 {
  return n <= 500 ? 0 : n <= 1500 ? 1 : n <= 3000 ? 2 : 3
}
function bandLabel(n: number): string {
  return n <= 500 ? '≤ 500 students' : n <= 1500 ? '501 – 1,500 students' : n <= 3000 ? '1,501 – 3,000 students' : '3,000+ students'
}
function rateFor(n: number, tier: Tier): number {
  return RATE_TABLE[tier][strengthBand(n)]
}
function recommendedTier(n: number): Tier {
  return n <= 500 ? 'silver' : n <= 1500 ? 'gold' : 'platinum'
}
const TIER_FEATURES: Record<Tier, string[]> = {
  silver: ['Core SIS & academics', 'Attendance, exams & fees', 'Parent communication'],
  gold: ['Everything in Silver', 'HR & Payroll', 'Advanced reporting & analytics'],
  platinum: ['Everything in Gold', 'GPS transport & geofence', 'Dedicated success manager'],
}

/* compact ₹ for charts/KPIs */
function compactMoney(n: number): string {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L'
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k'
  return '₹' + n
}

const statusTone: Record<School['status'], BadgeTone> = { active: 'success', trial: 'info', past_due: 'danger' }
const statusLabel: Record<School['status'], string> = { active: 'Active', trial: 'Trial', past_due: 'Past due' }

/* ============================================================
   OwnerReports — Cross-school comparison
   (no scatter, no league table — removed per design decision)
   ============================================================ */
type Metric = 'attendance' | 'fees' | 'enrolment' | 'revenue'

interface MetricMeta {
  label: string
  short: string
  sum: boolean
  base: (s: School) => number
  fmt: (v: number) => string
}
const METRIC_META: Record<Metric, MetricMeta> = {
  attendance: { label: 'Attendance', short: 'attendance', sum: false, base: (s) => s.attendance, fmt: (v) => v.toFixed(1) + '%' },
  fees: { label: 'Fee collection', short: 'fee collection', sum: false, base: (s) => s.fees, fmt: (v) => v.toFixed(1) + '%' },
  enrolment: { label: 'Enrolment', short: 'students', sum: true, base: (s) => s.students, fmt: (v) => fmtNum(Math.round(v)) },
  revenue: { label: 'Revenue (MRR)', short: 'MRR', sum: true, base: (s) => s.mrr, fmt: (v) => compactMoney(Math.round(v)) },
}
const YEARS = ['2024', '2025', '2026']
const YEAR_FACTOR: Record<string, number> = { '2024': 0.9, '2025': 0.95, '2026': 1 }

function OwnerReports() {
  const toast = useToast()
  const [metric, setMetric] = useState<Metric>('attendance')
  const [year, setYear] = useState('2026')

  const meta = METRIC_META[metric]
  const factor = YEAR_FACTOR[year]

  const ranked = useMemo(() => {
    return schools
      .map((s) => {
        const raw = meta.base(s) * factor
        const value = meta.sum ? Math.round(raw) : +raw.toFixed(1)
        return { school: s, value }
      })
      .sort((a, b) => b.value - a.value)
  }, [meta, factor])

  const summary = useMemo(() => {
    const values = ranked.map((r) => r.value)
    const total = values.reduce((a, v) => a + v, 0)
    const agg = meta.sum ? total : total / (values.length || 1)
    return { agg, top: ranked[0], low: ranked[ranked.length - 1], count: ranked.length }
  }, [ranked, meta])

  const bars = ranked.map((r) => ({ value: r.value, label: r.school.name, color: r.school.color }))

  return (
    <div>
      <PageHead
        title="Cross-school reports"
        sub={`Comparing ${schools.length} schools · ${meta.label} · FY ${year}`}
        actions={
          <Btn variant="primary" icon="download" onClick={() => toast.success('Exported .xlsx', `${meta.label} comparison · FY ${year} · ${schools.length} schools.`)}>
            Export Excel
          </Btn>
        }
      />

      {/* Controls */}
      <Card className="row ai-center jc-between gap12 wrap" style={{ marginBottom: 16 }}>
        <Segmented
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          options={(Object.keys(METRIC_META) as Metric[]).map((m) => ({ value: m, label: METRIC_META[m].label }))}
        />
        <Field label="">
          <Select
            options={YEARS.map((y) => ({ value: y, label: `FY ${y}` }))}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </Field>
      </Card>

      {/* KPI summary */}
      <div className="sm-kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi
          icon="trend" iconBg="var(--brand-50)" iconColor="var(--brand-600)"
          label={meta.sum ? `Total ${meta.short}` : `Average ${meta.short}`}
          value={meta.fmt(summary.agg)} foot={`Across ${summary.count} schools`}
        />
        <Kpi
          icon="sparkle" iconBg="var(--success-bg)" iconColor="var(--success)"
          label="Top school" value={meta.fmt(summary.top.value)} foot={summary.top.school.name}
        />
        <Kpi
          icon="alert" iconBg="var(--warning-bg)" iconColor="var(--warning)"
          label="Lowest" value={meta.fmt(summary.low.value)} foot={summary.low.school.name}
        />
        <Kpi
          icon="building" iconBg="var(--info-bg)" iconColor="var(--info)"
          label="Schools compared" value={fmtNum(summary.count)} foot={`Financial year ${year}`}
        />
      </div>

      {/* Ranked comparison */}
      <Card>
        <CardHead title={`${meta.label} by school`} sub={`Ranked across all schools · FY ${year}`} icon="grid" />
        <div style={{ marginTop: 16 }}>
          <HBars data={bars} labelWidth={200} valueFmt={(v) => meta.fmt(v)} />
        </div>
      </Card>
    </div>
  )
}

/* ============================================================
   Change-plan modal — per-student pricing for THIS school
   ============================================================ */
function ChangePlanModal({ school, onClose }: { school: School; onClose: () => void }) {
  const toast = useToast()
  const [tier, setTier] = useState<Tier>(school.plan)
  const seats = school.students

  const apply = () => {
    if (tier === school.plan) { toast.info('No change', `${school.name} is already on ${TIER_META[tier].label}.`); return }
    const annual = rateFor(seats, tier) * seats
    toast.success('Plan changed', `${school.name} → ${TIER_META[tier].label} · ${fmtMoney(annual)}/yr (${fmtNum(seats)} students).`)
    onClose()
  }

  return (
    <Modal
      open onClose={onClose} icon="layers" size="md"
      title={`Change plan · ${school.name}`}
      sub={`${fmtNum(seats)} students · ${bandLabel(seats)}`}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" onClick={apply}>Apply plan</Btn>
        </div>
      }
    >
      <div className="col gap10">
        {TIERS.map((t) => {
          const rate = rateFor(seats, t)
          const annual = rate * seats
          const selected = t === tier
          const current = t === school.plan
          return (
            <button
              key={t}
              onClick={() => setTier(t)}
              className="row ai-center jc-between gap12"
              style={{
                textAlign: 'left', width: '100%', padding: '14px 16px', cursor: 'pointer',
                border: `1.5px solid ${selected ? TIER_META[t].color : 'var(--border)'}`,
                borderRadius: 12, background: selected ? TIER_META[t].bg : 'var(--surface)',
              }}
            >
              <div className="row ai-center gap12">
                <TierPill plan={t} size="md" />
                {current && <Badge tone="neutral">Current</Badge>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="fw7">{fmtMoney(annual)}/yr</div>
                <div className="t-xs muted">{fmtNum(seats)} × {fmtMoney(rate)}/student/yr</div>
              </div>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

/* ============================================================
   Subscriptions tab
   ============================================================ */
const RENEW_DATES = ['14 Apr 2027', '02 Jun 2026', '21 Sep 2026', '08 Jan 2027', '30 Jun 2026', '11 Nov 2026', '17 Mar 2027']
function renewDate(i: number): string { return RENEW_DATES[i % RENEW_DATES.length] }

function SubscriptionsTab() {
  const [planFor, setPlanFor] = useState<School | null>(null)

  const columns: Column<School>[] = [
    {
      key: 'name', label: 'School', sortValue: (s) => s.name,
      render: (s) => (
        <div className="row ai-center gap10">
          <span className="sm-avatar" style={{ width: 34, height: 34, background: s.color, fontSize: 13, borderRadius: 10 }}>{s.logo}</span>
          <div>
            <div className="fw6">{s.name}</div>
            <div className="t-xs muted">{s.city}</div>
          </div>
        </div>
      ),
    },
    { key: 'plan', label: 'Plan', sortValue: (s) => s.plan, render: (s) => <TierPill plan={s.plan} /> },
    { key: 'students', label: 'Seats', align: 'right', sortValue: (s) => s.students, render: (s) => fmtNum(s.students) },
    {
      key: 'rate', label: 'Per student', align: 'right', sortValue: (s) => rateFor(s.students, s.plan),
      render: (s) => <span className="t-sm">{fmtMoney(rateFor(s.students, s.plan))}<span className="muted">/yr</span></span>,
    },
    {
      key: 'annual', label: 'Annual value', align: 'right', sortValue: (s) => rateFor(s.students, s.plan) * s.students,
      render: (s) => <span className="fw6">{fmtMoney(rateFor(s.students, s.plan) * s.students)}</span>,
    },
    { key: 'mrr', label: 'MRR', align: 'right', sortValue: (s) => s.mrr, render: (s) => fmtMoney(s.mrr) },
    {
      key: 'status', label: 'Status', align: 'center', sortValue: (s) => s.status,
      render: (s) => <Badge tone={statusTone[s.status]} dot>{statusLabel[s.status]}</Badge>,
    },
    {
      key: 'renews', label: 'Renews', align: 'right',
      render: (s) => <span className="t-sm muted">{renewDate(schools.indexOf(s))}</span>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (s) => <Btn size="sm" variant="secondary" icon="layers" onClick={() => setPlanFor(s)}>Change plan</Btn>,
    },
  ]

  return (
    <Card pad={false}>
      <DataTable<School>
        columns={columns}
        rows={schools}
        pageSize={10}
        rowKey={(s) => s.id}
        initialSort={{ key: 'mrr', dir: 'desc' }}
      />
      {planFor && <ChangePlanModal key={planFor.id} school={planFor} onClose={() => setPlanFor(null)} />}
    </Card>
  )
}

/* ============================================================
   Invoices tab
   ============================================================ */
type InvStatus = 'paid' | 'issued' | 'overdue'
interface Invoice { id: string; school: School; amount: number; issued: string; due: string; status: InvStatus }
const invTone: Record<InvStatus, BadgeTone> = { paid: 'success', issued: 'info', overdue: 'danger' }
const invLabel: Record<InvStatus, string> = { paid: 'Paid', issued: 'Issued', overdue: 'Overdue' }

function buildInvoices(): Invoice[] {
  const paying = schools.filter((s) => s.mrr > 0)
  const out: Invoice[] = []
  paying.forEach((s, i) => {
    out.push({ id: `INV-26${String(500 + i * 2).padStart(4, '0')}`, school: s, amount: s.mrr, issued: '01 May 2026', due: '15 May 2026', status: s.status === 'past_due' ? 'overdue' : 'paid' })
    out.push({ id: `INV-26${String(501 + i * 2).padStart(4, '0')}`, school: s, amount: s.mrr, issued: '01 Jun 2026', due: '15 Jun 2026', status: s.status === 'past_due' ? 'overdue' : 'issued' })
  })
  return out
}

function InvoicesTab() {
  const toast = useToast()
  const invoices = useMemo(buildInvoices, [])

  const columns: Column<Invoice>[] = [
    { key: 'id', label: 'Invoice', sortValue: (r) => r.id, render: (r) => <span className="fw6">{r.id}</span> },
    {
      key: 'school', label: 'School', sortValue: (r) => r.school.name,
      render: (r) => (
        <div className="row ai-center gap10">
          <span className="sm-avatar" style={{ width: 30, height: 30, background: r.school.color, fontSize: 12, borderRadius: 9 }}>{r.school.logo}</span>
          <span className="fw6">{r.school.name}</span>
        </div>
      ),
    },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <span className="fw6">{fmtMoney(r.amount)}</span> },
    { key: 'issued', label: 'Issued', align: 'right', render: (r) => <span className="t-sm muted">{r.issued}</span> },
    { key: 'due', label: 'Due', align: 'right', render: (r) => <span className="t-sm muted">{r.due}</span> },
    {
      key: 'status', label: 'Status', align: 'center', sortValue: (r) => r.status,
      render: (r) => <Badge tone={invTone[r.status]} dot>{invLabel[r.status]}</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <div className="row gap6 jc-end">
          <Btn size="sm" variant="ghost" icon="download" onClick={() => toast.info('Invoice downloaded', `${r.id} · ${fmtMoney(r.amount)} (PDF).`)}>PDF</Btn>
          {r.status !== 'paid' && (
            <Btn size="sm" variant="secondary" icon="bell" onClick={() => toast.success('Reminder sent', `${r.school.name} notified about ${r.id}.`)}>Remind</Btn>
          )}
        </div>
      ),
    },
  ]

  return (
    <Card pad={false}>
      <DataTable<Invoice>
        columns={columns}
        rows={invoices}
        pageSize={10}
        rowKey={(r) => r.id}
        initialSort={{ key: 'status', dir: 'asc' }}
      />
    </Card>
  )
}

/* ============================================================
   Revenue tab
   ============================================================ */
function RevenueTab() {
  const totalMrr = useMemo(() => schools.reduce((a, s) => a + s.mrr, 0), [])

  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const growth = months.map((_m, i) => Math.round(totalMrr * (0.72 + (0.28 * i) / (months.length - 1))))

  const byPlan = useMemo(() =>
    TIERS.map((t) => ({
      tier: t,
      value: schools.filter((s) => s.plan === t).reduce((a, s) => a + s.mrr, 0),
      color: TIER_META[t].color,
    })), [])

  return (
    <div className="sm-grid-2">
      <Card>
        <CardHead title="MRR growth" sub="Trailing 12 months" icon="trend" />
        <div style={{ marginTop: 12 }}>
          <LineChart
            series={[{ data: growth, color: 'var(--brand-600)', label: 'MRR' }]}
            labels={months}
            yFmt={(v) => compactMoney(v)}
          />
        </div>
      </Card>
      <Card>
        <CardHead title="Revenue by plan" sub="Share of MRR" icon="layers" />
        <div className="row ai-center gap20 wrap" style={{ marginTop: 12 }}>
          <Donut
            segments={byPlan.map((p) => ({ value: p.value, color: p.color, label: TIER_META[p.tier].label }))}
            size={150} thickness={20}
            center={<div style={{ textAlign: 'center' }}><div className="fw7" style={{ fontSize: 18 }}>{compactMoney(totalMrr)}</div><div className="t-xs muted">MRR</div></div>}
          />
          <div className="col gap10">
            {byPlan.map((p) => (
              <div key={p.tier} className="row ai-center jc-between gap16">
                <Legend items={[{ color: p.color, label: TIER_META[p.tier].label }]} />
                <span className="fw6">{fmtMoney(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ============================================================
   Plans & pricing tab — interactive plan calculator
   ============================================================ */
function PlanCalculator() {
  const toast = useToast()
  const [strength, setStrength] = useState(800)
  const [billing, setBilling] = useState<'annual' | 'monthly'>('annual')
  const rec = recommendedTier(strength)
  const clamp = (n: number) => Math.max(50, Math.min(5000, Math.round(n || 0)))

  return (
    <div className="col gap16">
      <Card>
        <CardHead title="Pricing calculator" sub="Enter a school's strength to see plans & pricing" icon="rupee" />
        <div className="row ai-end jc-between gap16 wrap" style={{ marginTop: 14 }}>
          <Field label="Student strength" hint={bandLabel(strength)}>
            <Input
              icon="users" type="number" inputMode="numeric" value={strength} style={{ width: 160 }}
              onChange={(e) => setStrength(clamp(Number(e.target.value)))}
            />
          </Field>
          <div style={{ flex: 1, minWidth: 220 }}>
            <input
              type="range" min={50} max={5000} step={50} value={strength}
              onChange={(e) => setStrength(clamp(Number(e.target.value)))}
              style={{ width: '100%' }}
              aria-label="Student strength"
            />
            <div className="row ai-center jc-between t-xs muted"><span>50</span><span>5,000</span></div>
          </div>
          <Segmented
            value={billing}
            onChange={(v) => setBilling(v as 'annual' | 'monthly')}
            options={[{ value: 'annual', label: 'Annual' }, { value: 'monthly', label: 'Monthly' }]}
          />
        </div>
      </Card>

      <div className="sm-grid-3">
        {TIERS.map((t) => {
          const rate = rateFor(strength, t)
          const annual = rate * strength
          const monthly = Math.round(annual / 12)
          const price = billing === 'annual' ? annual : monthly
          const isRec = t === rec
          return (
            <Card key={t} style={isRec ? { borderColor: TIER_META[t].color, borderWidth: 1.5 } : undefined}>
              <div className="row ai-center jc-between">
                <TierPill plan={t} size="md" />
                {isRec && <Badge tone="success" icon="sparkle">Recommended</Badge>}
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="row ai-end gap6">
                  <div className="fw7" style={{ fontSize: 26, fontFamily: 'var(--font-display)' }}>{fmtMoney(price)}</div>
                  <div className="t-xs muted" style={{ marginBottom: 4 }}>{billing === 'annual' ? '/year' : '/month'}</div>
                </div>
                <div className="t-xs muted">
                  {billing === 'annual'
                    ? `≈ ${fmtMoney(monthly)}/mo`
                    : `${fmtMoney(annual)}/yr billed annually`}
                </div>
              </div>
              <div className="t-sm muted" style={{ marginTop: 8 }}>
                {fmtNum(strength)} × {fmtMoney(rate)}/student/yr = {fmtMoney(annual)}/yr
              </div>
              <div className="col gap6" style={{ marginTop: 14 }}>
                {TIER_FEATURES[t].map((f) => (
                  <div key={f} className="row ai-center gap8 t-sm">
                    <Icon name="check" size={14} stroke={3} />{f}
                  </div>
                ))}
              </div>
              <Btn
                variant={isRec ? 'primary' : 'secondary'} icon="sparkle" style={{ width: '100%', marginTop: 16 }}
                onClick={() => toast.success('Trial started', `14-day ${TIER_META[t].label} trial · ${fmtNum(strength)} students · no card required.`)}
              >
                Start 14-day trial
              </Btn>
              <div className="t-xs muted3 ta-center" style={{ marginTop: 8, textAlign: 'center' }}>Free for 14 days · no card required</div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================
   OwnerBilling — Subscriptions & billing
   ============================================================ */
function OwnerBilling() {
  const [tab, setTab] = useState('subs')

  const kpis = useMemo(() => {
    const mrr = schools.reduce((a, s) => a + s.mrr, 0)
    const paying = schools.filter((s) => s.mrr > 0).length
    const overdue = schools.filter((s) => s.status === 'past_due').reduce((a, s) => a + s.mrr, 0)
    return { mrr, arr: mrr * 12, paying, overdue }
  }, [])

  return (
    <div>
      <PageHead title="Subscriptions & billing" sub={`${schools.length} tenants · per-student pricing`} />

      <div className="sm-kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi icon="rupee" iconBg="var(--brand-50)" iconColor="var(--brand-600)" label="MRR" value={fmtMoney(kpis.mrr)} foot="Monthly recurring revenue" />
        <Kpi icon="trend" iconBg="var(--success-bg)" iconColor="var(--success)" label="ARR" value={fmtMoney(kpis.arr)} foot="Annual run-rate (MRR × 12)" />
        <Kpi icon="building" iconBg="var(--info-bg)" iconColor="var(--info)" label="Paying tenants" value={fmtNum(kpis.paying)} foot={`of ${schools.length} schools`} />
        <Kpi icon="alert" iconBg="var(--danger-bg)" iconColor="var(--danger)" label="Overdue amount" value={fmtMoney(kpis.overdue)} foot="Past-due accounts" />
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'subs', label: 'Subscriptions', icon: 'list' },
          { value: 'invoices', label: 'Invoices', icon: 'doc' },
          { value: 'revenue', label: 'Revenue', icon: 'trend' },
          { value: 'plans', label: 'Plans & pricing', icon: 'layers' },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        {tab === 'subs' && <SubscriptionsTab />}
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'revenue' && <RevenueTab />}
        {tab === 'plans' && <PlanCalculator />}
      </div>
    </div>
  )
}

/* ---------- export contract ---------- */
export const billingScreens: Record<string, ComponentType> = {
  'owner.reports': OwnerReports,
  'owner.billing': OwnerBilling,
}
