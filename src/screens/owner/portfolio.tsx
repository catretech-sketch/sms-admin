/* ============================================================
   SchoolMate — Owner console: Portfolio overview, Schools list
   (+ branded account report) and the 5-step Create-school wizard.
   ============================================================ */
import { useMemo, useState, useEffect, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import {
  PageHead, Card, CardHead, Kpi, Btn, Badge, TierPill, Avatar, Search, Select, Segmented,
  Field, Input, Modal, Icon, Empty, Donut, HBars, Legend, DataTable, Spinner,
  type Column, type BadgeTone,
} from '@/components/ui'
import { TIERS, TIER_META } from '@/data/mockDb'
import { fmtMoney, fmtNum } from '@/lib/format'
import type { School, Tier } from '@/types'
import { usePortfolioSchools, useOwnerPlans, useCreateSchool, useOwnerFeeSummary } from '@/api/hooks/useOwner'
import { clientToSchool, slugify } from '@/api/ownerMap'
import { ApiError } from '@/api/client'

const FEE_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6']

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
  const { data: clients = [], isLoading, isError } = usePortfolioSchools(app.isPlatform)
  const feeQ = useOwnerFeeSummary(true)
  const schools = useMemo(() => clients.map(clientToSchool), [clients])

  const totals = useMemo(() => {
    const students = schools.reduce((a, s) => a + s.students, 0)
    const staff = schools.reduce((a, s) => a + s.staff, 0)
    return { students, staff }
  }, [schools])

  const planCounts = useMemo(() => {
    const c: Record<Tier, number> = { silver: 0, gold: 0, platinum: 0 }
    schools.forEach((s) => { c[s.plan]++ })
    return c
  }, [schools])

  const feeTotals = feeQ.data?.totals
  const feeSchools = feeQ.data?.schools ?? []
  const feeCollected = Number(feeTotals?.collected ?? 0)
  const feeOutstanding = Number(feeTotals?.outstanding ?? 0)
  const feeRate = feeCollected + feeOutstanding > 0
    ? Math.round((feeCollected / (feeCollected + feeOutstanding)) * 1000) / 10
    : 0
  const schoolsWithCash = feeSchools.filter((s) => Number(s.collected) > 0).length

  const feeDonut = useMemo(
    () => feeSchools
      .filter((s) => Number(s.collected) > 0)
      .map((s, i) => ({ value: Number(s.collected), color: FEE_COLORS[i % FEE_COLORS.length], label: s.name })),
    [feeSchools],
  )
  const feeBars = useMemo(
    () => [...feeSchools]
      .sort((a, b) => Number(b.collected) - Number(a.collected))
      .map((s, i) => ({ value: Number(s.collected), label: s.name, color: FEE_COLORS[i % FEE_COLORS.length] })),
    [feeSchools],
  )
  const outstandingBars = useMemo(
    () => [...feeSchools]
      .filter((s) => Number(s.outstanding) > 0)
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding))
      .map((s, i) => ({ value: Number(s.outstanding), label: s.name, color: FEE_COLORS[i % FEE_COLORS.length] })),
    [feeSchools],
  )

  const alerts = schools.filter((s) => {
    const row = feeSchools.find((f) => f.tenant_id === s.id)
    const collected = Number(row?.collected ?? 0)
    const outstanding = Number(row?.outstanding ?? 0)
    if (outstanding > 0 && collected + outstanding > 0) {
      return collected / (collected + outstanding) < 0.5
    }
    return outstanding > 0 && collected === 0
  })

  if (isLoading) {
    return <div className="col ai-center jc-center gap12" style={{ minHeight: 280 }}><Spinner size={28} /><div className="t-sm muted">Loading portfolio…</div></div>
  }
  if (isError) {
    return <Empty icon="alert" title="Could not load portfolio" body="Check your connection and try again." />
  }

  return (
    <div className="col gap20">
      <PageHead
        title="Portfolio overview"
        sub={app.isPlatform ? 'All schools on the platform' : 'School fee revenue across your schools'}
        actions={
          <div className="row gap8">
            <Btn icon="rupee" onClick={() => app.go('owner.revenue')}>Fee collection</Btn>
            <Btn icon="building" onClick={() => app.go('owner.schools')}>All schools</Btn>
            <Btn variant="primary" icon="plus" onClick={() => app.go('owner.create')}>Create school</Btn>
          </div>
        }
      />

      <div className="sm-kpi-grid">
        <Kpi
          icon="building" iconBg="var(--brand-50)" iconColor="var(--brand-600)"
          label="Total schools" value={fmtNum(schools.length)}
          foot={`${planCounts.platinum} Platinum · ${planCounts.gold} Gold · ${planCounts.silver} Silver`}
        />
        <Kpi
          icon="users" iconBg="var(--info-bg)" iconColor="var(--info)"
          label="Total students" value={fmtNum(totals.students)}
          foot={`${fmtNum(totals.staff)} staff across portfolio`}
        />
        <Kpi
          icon="rupee" iconBg="var(--success-bg)" iconColor="var(--success)"
          label="School fee revenue" value={feeQ.isLoading ? '…' : fmtMoney(feeCollected)}
          foot={feeQ.isError ? 'Could not load fees' : `${fmtNum(schoolsWithCash)} schools with cash this period`}
        />
        <Kpi
          icon="alert" iconBg="var(--warning-bg)" iconColor="var(--warning)"
          label="Fees outstanding" value={feeQ.isLoading ? '…' : fmtMoney(feeOutstanding)}
          foot={feeQ.isError ? '—' : `${feeRate}% collection rate`}
        />
      </div>

      <div className="sm-grid-2">
        <Card>
          <CardHead title="School revenue by school" sub="Student fees collected this period" icon="trend"
            action={<Btn size="sm" onClick={() => app.go('owner.revenue')}>Details</Btn>} />
          <div style={{ marginTop: 12 }}>
            {feeQ.isLoading ? (
              <div className="col ai-center gap8" style={{ minHeight: 160 }}><Spinner size={24} /></div>
            ) : feeBars.length === 0 ? (
              <Empty icon="rupee" title="No fee cash yet" body="Payments posted in your schools show up here." />
            ) : (
              <HBars data={feeBars} labelWidth={160} valueFmt={(v) => fmtCompact(v)} />
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Fee collected share" sub="Pie by school (cash this period)" icon="layers"
            action={<Btn size="sm" onClick={() => app.go('owner.revenue')}>Fee collection</Btn>} />
          <div className="row ai-center jc-between gap16 wrap" style={{ marginTop: 12 }}>
            {feeQ.isLoading ? (
              <div className="col ai-center gap8" style={{ minHeight: 148 }}><Spinner size={24} /></div>
            ) : feeDonut.length === 0 ? (
              <Empty icon="rupee" title="No collection to chart" body="When schools take fee payments, the pie appears here." />
            ) : (
              <>
                <Donut
                  segments={feeDonut}
                  size={148} thickness={18}
                  center={
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{fmtCompact(feeCollected)}</div>
                      <div className="t-xs muted3" style={{ marginTop: 2 }}>collected</div>
                    </div>
                  }
                />
                <div className="col gap12" style={{ flex: 1, minWidth: 160 }}>
                  <Legend items={feeDonut.map((d) => ({ color: d.color, label: d.label }))} />
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="sm-grid-2">
        <Card>
          <CardHead title="Outstanding by school" sub="Open student fee invoices" icon="alert"
            action={<Btn size="sm" onClick={() => app.go('owner.revenue')}>Fee collection</Btn>} />
          <div style={{ marginTop: 12 }}>
            {feeQ.isLoading ? (
              <div className="col ai-center gap8" style={{ minHeight: 160 }}><Spinner size={24} /></div>
            ) : outstandingBars.length === 0 ? (
              <Empty icon="checkCircle" title="Nothing outstanding" body="No open fee invoices across your schools." />
            ) : (
              <HBars data={outstandingBars} labelWidth={160} valueFmt={(v) => fmtCompact(v)} />
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Attention needed" sub="Low school fee collection" icon="alert" action={<Badge tone="warning">{alerts.length}</Badge>} />
          {alerts.length === 0 ? (
            <Empty icon="checkCircle" title="All healthy" body="No schools need fee-collection attention right now." />
          ) : (
            <div className="col gap12" style={{ marginTop: 12 }}>
              {alerts.map((s) => {
                const row = feeSchools.find((f) => f.tenant_id === s.id)
                const collected = Number(row?.collected ?? 0)
                const outstanding = Number(row?.outstanding ?? 0)
                const rate = collected + outstanding > 0 ? Math.round((collected / (collected + outstanding)) * 100) : 0
                return (
                  <div key={s.id} className="row ai-center gap12">
                    <Avatar name={s.logo} size={34} style={{ background: s.color, borderRadius: 9 }} />
                    <div style={{ flex: 1 }}>
                      <div className="t-md fw6">{s.name}</div>
                      <div className="t-xs muted3">{fmtMoney(outstanding)} outstanding</div>
                    </div>
                    <Badge tone="warning">Low fee collection — {rate}%</Badge>
                    <Btn size="sm" onClick={() => void app.enterSchool(s.id, s)}>Open</Btn>
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
  const { data: clients = [], isLoading, isError } = usePortfolioSchools(app.isPlatform)
  const schoolsList = useMemo(() => clients.map(clientToSchool), [clients])
  const [q, setQ] = useState('')
  const [plan, setPlan] = useState('all')
  const [status, setStatus] = useState('all')
  const [report, setReport] = useState<School | null>(null)
  const [upgrade, setUpgrade] = useState<School | null>(null)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return schoolsList.filter((s) => {
      if (plan !== 'all' && s.plan !== plan) return false
      if (status !== 'all' && s.status !== status) return false
      if (needle && !(s.name.toLowerCase().includes(needle) || s.city.toLowerCase().includes(needle))) return false
      return true
    })
  }, [schoolsList, q, plan, status])

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
    { key: 'fees', label: 'Health', align: 'right', sortValue: (s) => s.fees, render: (s) => <span style={{ color: s.fees < 70 ? 'var(--warning)' : undefined }}>{s.fees}</span> },
    { key: 'mrr', label: 'MRR', align: 'right', sortValue: (s) => s.mrr, render: (s) => fmtMoney(s.mrr, s.currency) },
    { key: 'status', label: 'Status', sortValue: (s) => s.status, render: (s) => <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge> },
    {
      key: 'actions', label: '', align: 'right',
      render: (s) => (
        <div className="row gap6 jc-end">
          {app.isPlatform && s.plan !== 'platinum' && (
            <Btn size="sm" variant="secondary" icon="sparkle" onClick={() => setUpgrade(s)}>Upgrade</Btn>
          )}
          <Btn size="sm" variant="primary" icon="arrowRight" onClick={() => void app.enterSchool(s.id, s)}>Open</Btn>
          <Btn size="sm" icon="doc" onClick={() => setReport(s)}>Account report</Btn>
        </div>
      ),
    },
  ]

  if (isLoading) {
    return <div className="col ai-center jc-center gap12" style={{ minHeight: 280 }}><Spinner size={28} /><div className="t-sm muted">Loading schools…</div></div>
  }
  if (isError) {
    return <Empty icon="alert" title="Could not load schools" body="Check your connection and try again." />
  }

  return (
    <div className="col gap20">
      <PageHead
        title="Schools"
        sub={`${schoolsList.length} ${schoolsList.length === 1 ? 'school' : 'schools'} in your portfolio`}
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
          empty={<Empty icon="building" title="No schools match" body="Try adjusting your search or create a school." />}
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
const WIZARD_STEPS = ['Basics', 'Admin contact', 'Select plan', 'Modules', 'Review']

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
  planId: string
  cycle: BillingCycle
  modules: Set<string>
}

function planTier(plan: { tier: string } | undefined): Tier {
  const t = (plan?.tier ?? 'gold').toLowerCase()
  return (TIERS as readonly string[]).includes(t) ? (t as Tier) : 'gold'
}

function estimatePlanAmount(plan: import('@/api/ownerTypes').Plan, strength: number): number {
  if (plan.pricing === 'per_student') {
    const rate = Number(plan.per_student) || 0
    const min = Number(plan.min_students) || 0
    const seats = Math.max(strength, min, 1)
    return rate * seats
  }
  return Number(plan.price) || 0
}

function CreateSchoolWizard() {
  const app = useApp()
  const toast = useToast()
  const plansQuery = useOwnerPlans(app.isPlatform)
  const createMut = useCreateSchool(app.isPlatform)
  const publishedPlans = plansQuery.data ?? []
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>({
    name: '', city: '', tz: 'Asia/Kolkata',
    adminName: app.user?.name ?? '', adminEmail: app.user?.email ?? '', adminPhone: '',
    strength: 800, tier: 'gold', planId: '', cycle: 'yearly',
    modules: new Set(['sis', 'attendance', 'exams', 'fees', 'communication']),
  })

  // Default to the first published plan once catalog loads.
  useEffect(() => {
    if (data.planId || publishedPlans.length === 0) return
    const first = publishedPlans[0]
    setData((d) => ({ ...d, planId: first.id, tier: planTier(first) }))
  }, [publishedPlans, data.planId])

  const selectedPlan = publishedPlans.find((p) => p.id === data.planId) ?? publishedPlans[0]

  const set = <K extends keyof WizardData>(key: K, value: WizardData[K]) =>
    setData((d) => ({ ...d, [key]: value }))

  const selectPlan = (planId: string) => {
    const plan = publishedPlans.find((p) => p.id === planId)
    setData((d) => ({
      ...d,
      planId,
      tier: planTier(plan),
    }))
  }

  const toggleModule = (key: string) =>
    setData((d) => {
      const next = new Set(d.modules)
      if (next.has(key)) next.delete(key); else next.add(key)
      return { ...d, modules: next }
    })

  const canNext = (() => {
    if (step === 0) return data.name.trim() !== '' && data.city.trim() !== ''
    if (step === 1) return app.isPlatform
      ? data.adminName.trim() !== '' && data.adminEmail.trim() !== ''
      : true
    if (step === 2) return data.strength > 0 && !!data.planId && publishedPlans.length > 0
    return true
  })()

  const annual = selectedPlan
    ? estimatePlanAmount(selectedPlan, data.strength)
    : data.strength * rateFor(data.strength, data.tier)
  const cycleMeta = CYCLE_META[data.cycle]
  const cyclePrice = Math.round(annual / cycleMeta.div)

  const create = async () => {
    const planId = data.planId || selectedPlan?.id
    if (!planId) {
      toast.danger('No plan available', 'Catre admin must publish a plan before you can create a school.')
      return
    }
    try {
      const slug = slugify(data.name)
      if (app.isPlatform) {
        await createMut.mutateAsync({
          name: data.name.trim(),
          slug,
          country: data.city.trim(),
          admin_name: data.adminName.trim(),
          admin_email: data.adminEmail.trim(),
          admin_phone: data.adminPhone.trim() || undefined,
          plan_id: planId,
          trial_days: 14,
        })
      } else {
        await createMut.mutateAsync({
          name: data.name.trim(),
          slug,
          country: data.city.trim(),
          plan_id: planId,
          admin_name: data.adminName.trim() || app.user?.name,
          admin_phone: data.adminPhone.trim() || undefined,
          trial_days: 14,
        })
      }
      const planLabel = selectedPlan?.name ?? TIER_META[data.tier].label
      toast.success('School created', `${data.name} is on trial with ${planLabel}. Catre admin can activate the client to make the plan active.`)
      app.go('owner.schools')
    } catch (e) {
      toast.danger('Could not create school', e instanceof ApiError ? e.message : 'Try again.')
    }
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

        {step === 2 && (
          <PlanStep
            data={data}
            plans={publishedPlans}
            loading={plansQuery.isLoading}
            error={plansQuery.isError}
            selectedPlan={selectedPlan}
            onStrength={(v) => set('strength', v)}
            onSelectPlan={selectPlan}
            onCycle={(c) => set('cycle', c)}
          />
        )}

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

        {step === 4 && <ReviewStep data={data} plan={selectedPlan} />}

        {/* nav buttons + running price summary */}
        <div className="sm-divider" style={{ margin: '20px 0 16px' }} />
        <div className="row ai-center jc-between gap12 wrap">
          <Btn icon="arrowLeft" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Btn>
          <div className="row ai-center gap8 t-sm muted" style={{ marginLeft: 'auto' }}>
            <TierPill plan={data.tier} />
            <span className="t-xs">{selectedPlan?.name ?? 'No plan'}</span>
            <span>{fmtNum(data.strength)} students ·</span>
            <span className="fw7" style={{ color: 'var(--text)' }}>{fmtMoney(cyclePrice)}{cycleMeta.per}</span>
          </div>
          {step < WIZARD_STEPS.length - 1 ? (
            <Btn variant="primary" iconRight="arrowRight" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Btn>
          ) : (
            <Btn variant="primary" icon="check" disabled={createMut.isPending || !data.planId} onClick={() => void create()}>
              {createMut.isPending ? 'Creating…' : <>Create school · {fmtMoney(cyclePrice)}{cycleMeta.per}</>}
            </Btn>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ---------- Wizard step 3: pick a published Catre plan ---------- */
function PlanStep({
  data, plans, loading, error, selectedPlan, onStrength, onSelectPlan, onCycle,
}: {
  data: WizardData
  plans: import('@/api/ownerTypes').Plan[]
  loading: boolean
  error?: boolean
  selectedPlan: import('@/api/ownerTypes').Plan | undefined
  onStrength: (v: number) => void
  onSelectPlan: (planId: string) => void
  onCycle: (c: BillingCycle) => void
}) {
  const strength = data.strength
  const cm = CYCLE_META[data.cycle]
  const amount = selectedPlan ? estimatePlanAmount(selectedPlan, strength) : 0
  const cycleSel = Math.round(amount / cm.div)

  if (loading) {
    return (
      <div className="col ai-center jc-center gap12" style={{ minHeight: 200 }}>
        <Spinner size={28} />
        <div className="t-sm muted">Loading published plans…</div>
      </div>
    )
  }

  if (error) {
    return (
      <Empty
        icon="alert"
        title="Could not load plans"
        body="Check your connection, then reopen Create school. School owners need GET /me/plans."
      />
    )
  }

  if (plans.length === 0) {
    return (
      <Empty
        icon="layers"
        title="No published plans"
        body="Ask Catre admin to publish a plan (visibility public/published). Only those plans appear here."
      />
    )
  }

  return (
    <div className="col gap16">
      <CardHead
        title="Select published plan"
        sub="Plans published by Catre admin. School starts on trial; plan becomes active when Catre activates the client."
        icon="rupee"
      />

      <div className="sm-grid-2">
        <Field label="Expected student strength" hint="Used for per-student plan estimates.">
          <Input icon="users" type="number" min={1} value={strength}
            onChange={(e) => onStrength(Math.max(0, parseInt(e.target.value || '0', 10)))} />
        </Field>
        <Field label="Billing cycle" hint="Display only — billing starts when Catre activates the client.">
          <Segmented
            value={data.cycle}
            onChange={(v) => onCycle(v as BillingCycle)}
            options={(Object.keys(CYCLE_META) as BillingCycle[]).map((c) => ({ value: c, label: CYCLE_META[c].label }))}
          />
        </Field>
      </div>

      <div className="sm-grid-3">
        {plans.map((p) => {
          const tier = planTier(p)
          const m = TIER_META[tier]
          const total = estimatePlanAmount(p, strength)
          const cyclePrice = Math.round(total / cm.div)
          const selected = data.planId === p.id
          const accent = p.color || m.color
          const rateLabel = p.pricing === 'per_student'
            ? `₹${Number(p.per_student) || 0}/student`
            : `${fmtMoney(Number(p.price) || 0)} flat`
          return (
            <div key={p.id}
              className="sm-card pad col gap10"
              style={{ cursor: 'pointer', borderColor: selected ? accent : undefined, borderWidth: selected ? 2 : undefined }}
              onClick={() => onSelectPlan(p.id)}
            >
              <div className="row ai-center jc-between gap8 wrap">
                <div className="t-md fw7">{p.name}</div>
                <TierPill plan={tier} size="md" />
              </div>
              {p.description && <div className="t-xs muted3">{p.description}</div>}
              <div>
                <div className="row ai-end gap6">
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{fmtMoney(cyclePrice)}</div>
                  <div className="t-xs muted3" style={{ marginBottom: 2 }}>{cm.per}</div>
                </div>
                <div className="t-xs muted3" style={{ marginTop: 3 }}>
                  {rateLabel} · {p.period || 'monthly'} · published
                </div>
              </div>
              <div className="row ai-center gap6 t-sm" style={{ color: selected ? accent : 'var(--text-3)' }}>
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
          {selectedPlan?.name ?? 'Plan'} · {cm.label} · {fmtMoney(cycleSel)}{cm.per}
        </span>
        <Badge tone="info" style={{ marginLeft: 'auto' }}>Active after Catre activates client</Badge>
      </div>
    </div>
  )
}

/* ---------- Wizard step 5: review ---------- */
function ReviewStep({ data, plan }: { data: WizardData; plan: import('@/api/ownerTypes').Plan | undefined }) {
  const amount = plan ? estimatePlanAmount(plan, data.strength) : data.strength * rateFor(data.strength, data.tier)
  const cm = CYCLE_META[data.cycle]
  const cyclePrice = Math.round(amount / cm.div)
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'School name', value: data.name || '—' },
    { label: 'City', value: data.city || '—' },
    { label: 'Time zone', value: data.tz },
    { label: 'Administrator', value: data.adminName || '—' },
    { label: 'Admin email', value: data.adminEmail || '—' },
    { label: 'Admin phone', value: data.adminPhone || '—' },
    { label: 'Student strength', value: fmtNum(data.strength) },
    { label: 'Published plan', value: plan?.name ?? '—' },
    { label: 'Tier', value: <TierPill plan={data.tier} /> },
    { label: 'Billing cycle', value: cm.label },
    { label: `Estimate (${cm.label.toLowerCase()})`, value: <span className="fw7">{fmtMoney(cyclePrice)}{cm.per}</span> },
    { label: 'Status after create', value: 'Trial — plan activates when Catre admin activates the client' },
    { label: 'Modules enabled', value: `${data.modules.size} modules` },
  ]
  return (
    <div className="col gap16">
      <CardHead title="Review & confirm" sub="Verify the details before creating the school" icon="checkCircle" />
      <div className="col gap8">
        {rows.map((r) => (
          <div key={r.label} className="row ai-center jc-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <span className="t-sm muted">{r.label}</span>
            <span className="t-sm fw6" style={{ textAlign: 'right', maxWidth: '60%' }}>{r.value}</span>
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
