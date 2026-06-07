/* ============================================================
   SchoolMate — Communication, Operations & Live GPS tracking
   - CommunicationScreen: Messenger · Complaints · Announcements
     (multi-step compose: Compose → Audience → Channels → Review).
     NOTE: calling features are intentionally absent — message only.
   - OperationsScreen: Library · Transport · Hostel · Sports KPIs,
     with the bus fleet list + a Platinum upsell on Transport.
   - GpsScreen: full bus fleet list (all plans) + Add-vehicle modal,
     with a Platinum-gated live map below.
   Frontend-only, mock data.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import {
  PageHead, Tabs, Card, CardHead, Kpi, Btn, IconBtn, Badge, Avatar, Search,
  Select, Field, Input, Textarea, Modal, Icon, Empty, Checkbox, TierPill,
  DataTable, type Column, type BadgeTone,
} from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { buses, complaints, threads, students, teachers, staff, grades } from '@/data/mockDb'
import type { Bus, Complaint, ThreadMsg } from '@/types'

/* ---------- shared meta ---------- */
const PRIORITY_TONE: Record<Complaint['priority'], BadgeTone> = { high: 'danger', medium: 'warning', low: 'neutral' }
const STATUS_TONE: Record<Complaint['status'], BadgeTone> = { open: 'info', in_progress: 'warning', resolved: 'success' }
const STATUS_LABEL: Record<Complaint['status'], string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' }

const BUS_META: Record<Bus['status'], { tone: BadgeTone; label: string }> = {
  on_route: { tone: 'success', label: 'On route' },
  at_stop: { tone: 'info', label: 'At stop' },
  delayed: { tone: 'danger', label: 'Delayed' },
  idle: { tone: 'neutral', label: 'Idle' },
  maintenance: { tone: 'warning', label: 'Maintenance' },
}

/* ============================================================
   COMMUNICATION
   ============================================================ */
function CommunicationScreen() {
  const [tab, setTab] = useState('messenger')
  return (
    <div>
      <PageHead title="Communication" sub="Messenger · Complaints · Announcements" />
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'messenger', label: 'Messenger', icon: 'message', count: threads.reduce((n, t) => n + t.unread, 0) },
          { value: 'complaints', label: 'Complaints', icon: 'inbox' },
          { value: 'announcements', label: 'Announcements', icon: 'bell' },
        ]} />
      </div>
      {tab === 'messenger' && <MessengerTab />}
      {tab === 'complaints' && <ComplaintsTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
    </div>
  )
}

/* ---------- Messenger: thread list + conversation (message only) ---------- */
function MessengerTab() {
  const toast = useToast()
  const [activeId, setActiveId] = useState<number>(threads[0]?.id ?? 0)
  const [drafts, setDrafts] = useState<Record<number, ThreadMsg[]>>({})
  const [text, setText] = useState('')

  const thread = threads.find((t) => t.id === activeId)
  const msgs: ThreadMsg[] = thread ? [...thread.msgs, ...(drafts[activeId] || [])] : []

  const send = () => {
    const t = text.trim()
    if (!t || !thread) return
    setDrafts((d) => ({ ...d, [activeId]: [...(d[activeId] || []), { me: true, t, at: 'now' }] }))
    setText('')
    toast.success('Message sent', `Replied to ${thread.parent}`)
  }

  return (
    <Card pad={false}>
      <div className="row" style={{ alignItems: 'stretch', minHeight: 460 }}>
        {/* Thread list */}
        <div style={{ width: 300, borderRight: '1px solid var(--border)', flex: '0 0 auto' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className="fw7 t-md">Conversations</span>
          </div>
          <div className="col">
            {threads.map((t) => (
              <button key={t.id} className="row ai-center gap10"
                onClick={() => setActiveId(t.id)}
                style={{
                  padding: '12px 14px', textAlign: 'left', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)', width: '100%',
                  background: t.id === activeId ? 'var(--brand-50)' : 'transparent',
                }}>
                <Avatar name={t.parent} hue={t.hue} size={38} />
                <div className="flex1" style={{ minWidth: 0 }}>
                  <div className="row ai-center jc-between gap8">
                    <span className="fw6 t-md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.parent}</span>
                    <span className="t-xs muted3" style={{ flex: '0 0 auto' }}>{t.time}</span>
                  </div>
                  <div className="t-xs muted3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.student}</div>
                  <div className="t-xs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.last}</div>
                </div>
                {t.unread > 0 && <span className="sm-badge solid sm-badge-brand" style={{ flex: '0 0 auto' }}>{t.unread}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div className="col flex1" style={{ minWidth: 0 }}>
          {thread ? (
            <>
              <div className="row ai-center gap10" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <Avatar name={thread.parent} hue={thread.hue} size={36} />
                <div className="flex1">
                  <div className="fw6 t-md">{thread.parent}</div>
                  <div className="t-xs muted3">{thread.student} · {thread.teacher}</div>
                </div>
                {/* NOTE: no call/phone button — messaging only */}
                <Badge tone="info" soft icon="message">Message only</Badge>
              </div>
              <div className="col gap10 flex1" style={{ padding: 16, overflow: 'auto' }}>
                {msgs.map((m, i) => (
                  <div key={i} className="row" style={{ justifyContent: m.me ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '9px 13px', borderRadius: 14,
                      background: m.me ? 'var(--brand-600)' : 'var(--surface-2)',
                      color: m.me ? '#fff' : 'var(--text)',
                    }}>
                      <div className="t-md">{m.t}</div>
                      <div className="t-xs" style={{ opacity: 0.7, marginTop: 3, textAlign: 'right' }}>{m.at}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row ai-center gap8" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
                <div className="flex1">
                  <Input icon="message" placeholder="Type a message…" value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
                </div>
                <Btn variant="primary" icon="arrowRight" onClick={send} disabled={!text.trim()}>Send</Btn>
              </div>
            </>
          ) : (
            <Empty icon="message" title="Select a conversation" />
          )}
        </div>
      </div>
    </Card>
  )
}

/* ---------- Complaints: triage + resolve ---------- */
function ComplaintsTab() {
  const toast = useToast()
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  const rows: Complaint[] = complaints.map((c) => resolved.has(c.id) ? { ...c, status: 'resolved' } : c)

  const resolve = (c: Complaint) => {
    if (c.status === 'resolved') return
    setResolved((s) => new Set(s).add(c.id))
    toast.success('Complaint resolved', `${c.id} marked resolved`)
  }

  const cols: Column<Complaint>[] = [
    {
      key: 'subject', label: 'Complaint', sortValue: (r) => r.subject,
      render: (r) => (
        <div>
          <div className="fw6 t-md">{r.subject}</div>
          <div className="t-xs muted3">{r.id} · {r.from} · {r.cat}</div>
        </div>
      ),
    },
    { key: 'priority', label: 'Priority', sortValue: (r) => r.priority, render: (r) => <Badge tone={PRIORITY_TONE[r.priority]} soft dot>{r.priority[0].toUpperCase() + r.priority.slice(1)}</Badge> },
    { key: 'assignee', label: 'Assignee', sortValue: (r) => r.assignee, render: (r) => <span className="t-md">{r.assignee}</span> },
    { key: 'age', label: 'Age', align: 'right', render: (r) => <span className="t-sm muted">{r.age}</span> },
    { key: 'status', label: 'Status', sortValue: (r) => r.status, render: (r) => <Badge tone={STATUS_TONE[r.status]} soft>{STATUS_LABEL[r.status]}</Badge> },
    {
      key: 'act', label: '', align: 'right',
      render: (r) => r.status === 'resolved'
        ? <Icon name="checkCircle" size={17} style={{ color: 'var(--success)' }} />
        : <Btn size="sm" variant="secondary" icon="check" onClick={() => resolve(r)}>Resolve</Btn>,
    },
  ]

  const open = rows.filter((r) => r.status !== 'resolved').length
  return (
    <div className="col gap16">
      <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kpi icon="inbox" label="Total" value={rows.length} />
        <Kpi icon="alert" iconBg="var(--danger-bg)" iconColor="var(--danger)" label="Open" value={open} />
        <Kpi icon="clock" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="In progress" value={rows.filter((r) => r.status === 'in_progress').length} />
        <Kpi icon="checkCircle" iconBg="var(--success-bg)" iconColor="var(--success)" label="Resolved" value={rows.filter((r) => r.status === 'resolved').length} />
      </div>
      <Card pad={false}>
        <CardHead title="Complaint triage" sub="Prioritise, assign & resolve parent / staff complaints" icon="inbox" />
        <DataTable columns={cols} rows={rows} pageSize={8} rowKey={(r) => r.id} initialSort={{ key: 'priority', dir: 'asc' }} />
      </Card>
    </div>
  )
}

/* ---------- Announcements ---------- */
function AnnouncementsTab() {
  const [open, setOpen] = useState(false)
  const sent = [
    { id: 'AN-220', title: 'Annual Day rehearsal schedule', audience: 'Parents · Grade VI–XII', when: 'Today 9:10 AM', reach: 1842, ch: 'Push · SMS' },
    { id: 'AN-218', title: 'Fee reminder — Term 2 dues', audience: 'Fee defaulters', when: 'Yesterday', reach: 128, ch: 'SMS · Email' },
    { id: 'AN-214', title: 'Staff meeting — Friday 4 PM', audience: 'Teachers · Support staff', when: '2 days ago', reach: 104, ch: 'Push' },
  ]
  return (
    <div className="col gap16">
      <Card>
        <div className="row ai-center jc-between gap14 wrap">
          <div className="row ai-center gap12">
            <span className="sm-card-ic"><Icon name="bell" size={18} /></span>
            <div>
              <div className="fw7 t-lg">Broadcast announcements</div>
              <div className="t-sm muted">Compose once, target the right audience, send across push / SMS / email.</div>
            </div>
          </div>
          <Btn variant="primary" icon="plus" onClick={() => setOpen(true)}>New announcement</Btn>
        </div>
      </Card>
      <Card pad={false}>
        <CardHead title="Recent announcements" icon="list" />
        <div className="col">
          {sent.map((a) => (
            <div key={a.id} className="row ai-center jc-between gap12" style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
              <div className="row ai-center gap12" style={{ minWidth: 0 }}>
                <span className="sm-card-ic"><Icon name="bell" size={15} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="fw6 t-md">{a.title}</div>
                  <div className="t-xs muted3">{a.audience} · {a.ch}</div>
                </div>
              </div>
              <div className="row ai-center gap14" style={{ flex: '0 0 auto' }}>
                <span className="t-sm muted">{a.when}</span>
                <Badge tone="success" soft icon="users">{a.reach.toLocaleString()} reached</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <AnnouncementModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/* recipient sources */
const FEE_DEFAULTERS = students.filter((s) => s.feeStatus !== 'paid')

interface Person { id: string; name: string; sub: string; kind: 'student' | 'teacher' | 'staff' }
type AudienceKey = 'parents' | 'students' | 'teachers' | 'staff' | 'everyone' | 'grades' | 'defaulters' | 'specific'

function AnnouncementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [aud, setAud] = useState<AudienceKey>('parents')
  const [selGrades, setSelGrades] = useState<Set<string>>(new Set())
  const [people, setPeople] = useState<Person[]>([])
  const [push, setPush] = useState(true)
  const [sms, setSms] = useState(false)
  const [email, setEmail] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(0); setTitle(''); setBody(''); setAud('parents')
    setSelGrades(new Set()); setPeople([])
    setPush(true); setSms(false); setEmail(false)
  }, [open])

  const gradeCount = useMemo(
    () => students.filter((s) => selGrades.has(s.grade)).length,
    [selGrades],
  )

  const count = (k: AudienceKey): number => {
    switch (k) {
      case 'parents': return students.length
      case 'students': return students.length
      case 'teachers': return teachers.length
      case 'staff': return staff.length
      case 'everyone': return students.length * 2 + teachers.length + staff.length
      case 'grades': return gradeCount
      case 'defaulters': return FEE_DEFAULTERS.length
      case 'specific': return people.length
    }
  }
  const recipients = count(aud)

  const audOptions: { key: AudienceKey; label: string; icon: string; desc: string }[] = [
    { key: 'parents', label: 'Parents', icon: 'users', desc: 'Student guardians' },
    { key: 'students', label: 'Students', icon: 'cap', desc: 'Direct to student accounts' },
    { key: 'teachers', label: 'Teachers', icon: 'briefcase', desc: 'All teaching staff' },
    { key: 'staff', label: 'Support staff', icon: 'shield', desc: 'Transport · security · admin' },
    { key: 'everyone', label: 'Everyone', icon: 'globe', desc: 'Parents, students & all staff' },
    { key: 'grades', label: 'Specific grades', icon: 'layers', desc: 'Pick one or more grades' },
    { key: 'defaulters', label: 'Fee defaulters', icon: 'rupee', desc: 'Guardians with pending dues' },
    { key: 'specific', label: 'Specific people', icon: 'user', desc: 'Pick individuals by name' },
  ]

  const channels = [push, sms, email].filter(Boolean).length
  const smsCost = sms ? recipients * 0.2 : 0
  const emailCost = email ? recipients * 0.05 : 0
  const totalCost = smsCost + emailCost

  const canNext =
    step === 0 ? title.trim().length > 0 && body.trim().length > 0
    : step === 1 ? (aud === 'grades' ? selGrades.size > 0 : aud === 'specific' ? people.length > 0 : true)
    : step === 2 ? channels > 0
    : true

  const send = () => {
    toast.success('Announcement sent', `"${title}" delivered to ${recipients.toLocaleString()} recipient${recipients === 1 ? '' : 's'}`)
    onClose()
  }

  const STEPS = ['Compose', 'Audience', 'Channels', 'Review']

  return (
    <Modal open={open} onClose={onClose} size="lg" icon="bell" title="New announcement"
      sub={STEPS.map((s, i) => `${i === step ? '● ' : ''}${s}`).join('  →  ')}
      footer={
        <>
          {step > 0 && <Btn variant="ghost" icon="arrowLeft" onClick={() => setStep((s) => s - 1)}>Back</Btn>}
          <div className="flex1" />
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          {step < 3
            ? <Btn variant="primary" iconRight="arrowRight" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continue</Btn>
            : <Btn variant="primary" icon="check" onClick={send}>Send announcement</Btn>}
        </>
      }>
      {/* step indicator */}
      <div className="row ai-center gap8" style={{ marginBottom: 18 }}>
        {STEPS.map((s, i) => (
          <div key={s} className="row ai-center gap8 flex1">
            <span style={{
              width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flex: '0 0 auto', fontSize: 12, fontWeight: 700,
              background: i <= step ? 'var(--brand-600)' : 'var(--surface-3)',
              color: i <= step ? '#fff' : 'var(--text-3)',
            }}>{i < step ? '✓' : i + 1}</span>
            <span className="t-sm fw6" style={{ color: i === step ? 'var(--text)' : 'var(--text-3)' }}>{s}</span>
            {i < STEPS.length - 1 && <span className="flex1" style={{ height: 2, background: i < step ? 'var(--brand-600)' : 'var(--border)' }} />}
          </div>
        ))}
      </div>

      {/* Step 0 — Compose */}
      {step === 0 && (
        <div className="col gap16">
          <Field label="Title" required>
            <Input icon="bell" placeholder="e.g. Annual Day rehearsal schedule" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Message" required hint={`${body.length} characters`}>
            <Textarea rows={6} placeholder="Write your announcement…" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        </div>
      )}

      {/* Step 1 — Audience */}
      {step === 1 && (
        <div className="col gap16">
          <div className="sm-grid-2">
            {audOptions.map((o) => (
              <button key={o.key} className="row ai-center gap12" onClick={() => setAud(o.key)}
                style={{
                  padding: 13, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${aud === o.key ? 'var(--brand-600)' : 'var(--border)'}`,
                  background: aud === o.key ? 'var(--brand-50)' : 'var(--surface)',
                }}>
                <span className="sm-card-ic"><Icon name={o.icon} size={16} /></span>
                <div className="flex1" style={{ minWidth: 0 }}>
                  <div className="fw6 t-md">{o.label}</div>
                  <div className="t-xs muted3">{o.desc}</div>
                </div>
                <Badge tone={aud === o.key ? 'brand' : 'neutral'} soft>{count(o.key).toLocaleString()}</Badge>
              </button>
            ))}
          </div>

          {aud === 'grades' && (
            <Card style={{ background: 'var(--surface-2)' }}>
              <div className="t-sm fw6" style={{ marginBottom: 10 }}>Select grades</div>
              <div className="row wrap gap8">
                {grades.map((g) => {
                  const on = selGrades.has(g)
                  return (
                    <button key={g} onClick={() => setSelGrades((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n })}
                      style={{
                        padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        border: `1.5px solid ${on ? 'var(--brand-600)' : 'var(--border)'}`,
                        background: on ? 'var(--brand-600)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-2)',
                      }}>{g}</button>
                  )
                })}
              </div>
            </Card>
          )}

          {aud === 'specific' && <SpecificPeoplePicker selected={people} onChange={setPeople} />}

          <div className="row ai-center gap8" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--brand-50)' }}>
            <Icon name="users" size={16} style={{ color: 'var(--brand-600)' }} />
            <span className="t-md fw6">{recipients.toLocaleString()}</span>
            <span className="t-sm muted">recipient{recipients === 1 ? '' : 's'} will receive this announcement</span>
          </div>
        </div>
      )}

      {/* Step 2 — Channels */}
      {step === 2 && (
        <div className="col gap14">
          <div className="t-sm muted">Choose how this announcement is delivered to {recipients.toLocaleString()} recipients.</div>
          {([
            ['Push notification', 'In-app + mobile push', 'bell', push, setPush, 'Free'],
            ['SMS', '₹0.20 per recipient', 'message', sms, setSms, sms ? `₹${smsCost.toFixed(2)}` : '—'],
            ['Email', '₹0.05 per recipient', 'doc', email, setEmail, email ? `₹${emailCost.toFixed(2)}` : '—'],
          ] as [string, string, string, boolean, (v: boolean) => void, string][]).map(([label, sub, icon, on, setOn, cost]) => (
            <div key={label} className="row ai-center jc-between gap12" style={{
              padding: 13, borderRadius: 12, border: `1.5px solid ${on ? 'var(--brand-600)' : 'var(--border)'}`,
              background: on ? 'var(--brand-50)' : 'var(--surface)',
            }}>
              <div className="row ai-center gap12">
                <Checkbox checked={on} onChange={setOn} />
                <span className="sm-card-ic"><Icon name={icon} size={16} /></span>
                <div>
                  <div className="fw6 t-md">{label}</div>
                  <div className="t-xs muted3">{sub}</div>
                </div>
              </div>
              <span className="tnum fw6 t-md">{cost}</span>
            </div>
          ))}
          <div className="row ai-center jc-between" style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)' }}>
            <span className="t-md fw6">Estimated cost</span>
            <span className="tnum fw7 t-lg" style={{ color: totalCost > 0 ? 'var(--text)' : 'var(--success)' }}>
              {totalCost > 0 ? `₹${totalCost.toFixed(2)}` : 'Free'}
            </span>
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 3 && (
        <div className="col gap14">
          <Card style={{ background: 'var(--surface-2)' }}>
            <div className="t-xs muted3" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Announcement</div>
            <div className="fw7 t-lg" style={{ margin: '6px 0' }}>{title || 'Untitled'}</div>
            <div className="t-md muted" style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
          </Card>
          <div className="sm-grid-2">
            <ReviewRow label="Audience" value={audOptions.find((o) => o.key === aud)?.label ?? ''} />
            <ReviewRow label="Recipients" value={recipients.toLocaleString()} />
            <ReviewRow label="Channels" value={[push && 'Push', sms && 'SMS', email && 'Email'].filter(Boolean).join(' · ') || 'None'} />
            <ReviewRow label="Estimated cost" value={totalCost > 0 ? `₹${totalCost.toFixed(2)}` : 'Free'} />
          </div>
          {aud === 'grades' && selGrades.size > 0 && <div className="t-sm muted">Grades: {[...selGrades].join(', ')}</div>}
          {aud === 'specific' && people.length > 0 && <div className="t-sm muted">People: {people.map((p) => p.name).join(', ')}</div>}
        </div>
      )}
    </Modal>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row ai-center jc-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="t-sm muted">{label}</span>
      <span className="t-md fw6">{value}</span>
    </div>
  )
}

function SpecificPeoplePicker({ selected, onChange }: { selected: Person[]; onChange: (p: Person[]) => void }) {
  const [tab, setTab] = useState<'student' | 'teacher' | 'staff'>('student')
  const [q, setQ] = useState('')

  const pool: Person[] = useMemo(() => {
    if (tab === 'student') return students.map((s) => ({ id: s.id, name: s.name, sub: s.cls, kind: 'student' as const }))
    if (tab === 'teacher') return teachers.map((t) => ({ id: t.id, name: t.name, sub: t.dept, kind: 'teacher' as const }))
    return staff.map((s) => ({ id: s.id, name: s.name, sub: s.role, kind: 'staff' as const }))
  }, [tab])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (term ? pool.filter((p) => p.name.toLowerCase().includes(term)) : pool).slice(0, 24)
  }, [pool, q])

  const has = (id: string) => selected.some((p) => p.id === id)
  const toggle = (p: Person) => {
    onChange(has(p.id) ? selected.filter((x) => x.id !== p.id) : [...selected, p])
  }

  return (
    <Card style={{ background: 'var(--surface-2)' }}>
      <div className="row ai-center jc-between gap10 wrap" style={{ marginBottom: 12 }}>
        <Tabs value={tab} onChange={(v) => setTab(v as typeof tab)} tabs={[
          { value: 'student', label: 'Students' },
          { value: 'teacher', label: 'Teachers' },
          { value: 'staff', label: 'Staff' },
        ]} />
        <Search value={q} onChange={setQ} placeholder="Search by name…" style={{ minWidth: 180 }} />
      </div>

      {selected.length > 0 && (
        <div className="row wrap gap8" style={{ marginBottom: 12 }}>
          {selected.map((p) => (
            <span key={p.id} className="row ai-center gap6" style={{
              padding: '4px 6px 4px 10px', borderRadius: 99, background: 'var(--brand-50)', border: '1px solid var(--brand-200, var(--border))',
            }}>
              <span className="t-sm fw6">{p.name}</span>
              <IconBtn icon="x" size={12} onClick={() => toggle(p)} aria-label={`Remove ${p.name}`} />
            </span>
          ))}
        </div>
      )}

      <div className="col" style={{ maxHeight: 240, overflow: 'auto' }}>
        {filtered.map((p) => (
          <button key={p.id} className="row ai-center gap10" onClick={() => toggle(p)}
            style={{ padding: '8px 6px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            <Checkbox checked={has(p.id)} onChange={() => toggle(p)} />
            <div className="flex1">
              <div className="fw6 t-md">{p.name}</div>
              <div className="t-xs muted3">{p.id} · {p.sub}</div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="t-sm muted" style={{ padding: 12 }}>No matches.</div>}
      </div>
    </Card>
  )
}

/* ============================================================
   BUS FLEET (shared by Operations · Transport and GPS)
   ============================================================ */
function BusFleet() {
  const toast = useToast()
  const [tick, setTick] = useState(0)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 2500)
    return () => clearInterval(iv)
  }, [])

  const rows = buses.map((b) => ({
    ...b,
    liveSpeed: b.status === 'on_route' || b.status === 'delayed'
      ? Math.max(0, b.speed + ((tick + b.label.length) % 5 - 2) * 3)
      : b.speed,
  }))
  type Row = typeof rows[number]
  const active = rows.filter((b) => b.status === 'on_route' || b.status === 'at_stop' || b.status === 'delayed').length

  const cols: Column<Row>[] = [
    {
      key: 'label', label: 'Bus', sortValue: (r) => r.label,
      render: (r) => (
        <div className="row ai-center gap10">
          <span style={{ width: 34, height: 34, borderRadius: 9, background: r.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <Icon name="bus" size={16} />
          </span>
          <div><div className="fw6">{r.label}</div><div className="t-xs muted3 mono">{r.no}</div></div>
        </div>
      ),
    },
    {
      key: 'route', label: 'Route', sortValue: (r) => r.route,
      render: (r) => <div><div className="t-md">{r.route}</div><div className="t-xs muted3">{r.id} · {r.stops} stops</div></div>,
    },
    {
      key: 'driver', label: 'Driver / conductor',
      render: (r) => r.driver === '—' ? <span className="muted3">—</span> : <div><div className="t-md">{r.driver}</div><div className="t-xs muted3">{r.conductor}</div></div>,
    },
    {
      key: 'students', label: 'Occupancy', align: 'right', sortValue: (r) => r.students,
      render: (r) => (
        <div className="row ai-center gap8 jc-end">
          <span className="sm-meter"><span style={{ width: (r.students / r.capacity * 100) + '%', background: r.students / r.capacity > 0.9 ? 'var(--warning)' : 'var(--success)' }} /></span>
          <span className="tnum t-sm">{r.students}/{r.capacity}</span>
        </div>
      ),
    },
    {
      key: 'liveSpeed', label: 'Speed', align: 'right',
      render: (r) => r.status === 'on_route' || r.status === 'delayed'
        ? <span className="row ai-center gap5 jc-end"><span className="sm-dot-live" style={{ width: 6, height: 6 }} /><span className="tnum fw6">{r.liveSpeed} km/h</span></span>
        : <span className="muted3">—</span>,
    },
    { key: 'eta', label: 'ETA', render: (r) => r.eta === '—' ? <span className="muted3">—</span> : <Badge tone="neutral" icon="clock">{r.eta} AM</Badge> },
    {
      key: 'fuel', label: 'Fuel', align: 'right',
      render: (r) => <span className="tnum t-sm" style={{ color: r.fuel < 30 ? 'var(--danger)' : r.fuel < 50 ? 'var(--warning)' : 'var(--text-2)' }}>{r.fuel}%</span>,
    },
    { key: 'status', label: 'Live status', sortValue: (r) => r.status, render: (r) => <Badge tone={BUS_META[r.status].tone} soft dot>{BUS_META[r.status].label}</Badge> },
  ]

  return (
    <div className="sm-table-wrap">
      <div className="row ai-center jc-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div className="row ai-center gap10">
          <span className="sm-dot-live" /><span className="fw7 t-lg">Fleet &amp; live status</span>
          <Badge tone="success" soft>{active} active now</Badge>
        </div>
        <Btn size="sm" variant="secondary" icon="plus" onClick={() => setAddOpen(true)}>Add vehicle</Btn>
      </div>
      <DataTable columns={cols} rows={rows} pageSize={8} rowKey={(r) => r.id} initialSort={{ key: 'status', dir: 'asc' }} />
      <AddVehicleModal open={addOpen} onClose={() => setAddOpen(false)}
        onSave={(n) => { setAddOpen(false); toast.success('Vehicle added', `${n} registered to the fleet`) }} />
    </div>
  )
}

function AddVehicleModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const blank = { label: '', no: '', route: '', capacity: '42', driver: '', conductor: '', stops: '' }
  const [f, setF] = useState(blank)
  const set = (k: keyof typeof f, v: string) => setF((d) => ({ ...d, [k]: v }))
  useEffect(() => { if (open) setF(blank) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const drivers = staff.filter((s) => s.role === 'Bus Driver')
  const conductors = staff.filter((s) => s.role === 'Bus Conductor')

  return (
    <Modal open={open} onClose={onClose} size="md" icon="bus" title="Add vehicle" sub="Register a bus to the transport fleet"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={!f.label || !f.no} onClick={() => onSave(f.label || 'Bus')}>Add vehicle</Btn>
        </>
      }>
      <div className="col gap16">
        <div className="sm-grid-2">
          <Field label="Bus name / number" required><Input icon="bus" placeholder="e.g. Bus 24" value={f.label} onChange={(e) => set('label', e.target.value)} /></Field>
          <Field label="Registration no" required><Input placeholder="e.g. KA-01-F-0000" value={f.no} onChange={(e) => set('no', e.target.value.toUpperCase())} /></Field>
        </div>
        <Field label="Route">
          <Select value={f.route} onChange={(e) => set('route', e.target.value)}
            options={[{ value: '', label: 'Assign route…' }, 'Indiranagar loop', 'Whitefield express', 'Koramangala', 'HSR Layout', 'Marathahalli', 'Jayanagar', 'Electronic City']} />
        </Field>
        <div className="sm-grid-2">
          <Field label="Seating capacity"><Input type="number" value={f.capacity} onChange={(e) => set('capacity', e.target.value)} /></Field>
          <Field label="No. of stops"><Input type="number" placeholder="e.g. 10" value={f.stops} onChange={(e) => set('stops', e.target.value)} /></Field>
        </div>
        <div className="sm-grid-2">
          <Field label="Driver">
            <Select value={f.driver} onChange={(e) => set('driver', e.target.value)}
              options={[{ value: '', label: 'Assign driver…' }, ...drivers.slice(0, 8).map((d) => ({ value: d.id, label: d.name }))]} />
          </Field>
          <Field label="Conductor">
            <Select value={f.conductor} onChange={(e) => set('conductor', e.target.value)}
              options={[{ value: '', label: 'Assign conductor…' }, ...conductors.slice(0, 8).map((d) => ({ value: d.id, label: d.name }))]} />
          </Field>
        </div>
        <div className="sm-card" style={{ background: 'var(--surface-2)', padding: 13, display: 'flex', gap: 10 }}>
          <Icon name="pin" size={15} style={{ color: 'var(--platinum)', marginTop: 1 }} />
          <div className="t-sm muted">A GPS device can be paired after the vehicle is created — live tracking requires the <span className="fw6" style={{ color: 'var(--text)' }}>Platinum</span> plan.</div>
        </div>
      </div>
    </Modal>
  )
}

/* ============================================================
   OPERATIONS
   ============================================================ */
function OperationsScreen() {
  const app = useApp()
  const [tab, setTab] = useState('library')
  return (
    <div>
      <PageHead title="Operations" sub="Library · Transport · Hostel · Sports" />
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'library', label: 'Library', icon: 'book' },
          { value: 'transport', label: 'Transport', icon: 'bus' },
          { value: 'hostel', label: 'Hostel', icon: 'home' },
          { value: 'sports', label: 'Sports', icon: 'shield' },
        ]} />
      </div>

      {tab === 'library' && (
        <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <Kpi icon="book" label="Catalogue" value="12,480" />
          <Kpi icon="users" iconBg="var(--info-bg)" iconColor="var(--info)" label="Members" value="2,332" />
          <Kpi icon="clock" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Issued" value="486" />
          <Kpi icon="rupee" iconBg="var(--danger-bg)" iconColor="var(--danger)" label="Fines due" value="₹ 8,420" />
        </div>
      )}

      {tab === 'transport' && (
        <div className="col gap16">
          <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <Kpi icon="bus" label="Vehicles" value={buses.length} />
            <Kpi icon="pin" iconBg="var(--info-bg)" iconColor="var(--info)" label="Routes" value="18" />
            <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Students" value="1,284" />
            <Kpi icon="clock" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Stops" value="142" />
          </div>
          <BusFleet />
          <Card style={{ background: 'linear-gradient(100deg,var(--platinum-bg),transparent)', borderColor: 'var(--platinum)' }}>
            <div className="row ai-center jc-between gap14 wrap">
              <div className="row ai-center gap12">
                <span className="sm-gate-lock" style={{ width: 44, height: 44, margin: 0, background: 'var(--platinum)', color: '#fff' }}><Icon name="bus" size={20} /></span>
                <div>
                  <div className="row ai-center gap8"><span className="fw7 t-lg">Live GPS bus tracking</span><TierPill plan="platinum" /></div>
                  <div className="t-sm muted">See every bus on a live map and share ETAs with parents. Unlock with Platinum.</div>
                </div>
              </div>
              <div className="row gap10">
                <Btn variant="secondary" onClick={() => app.go('school.gps')}>Open live map</Btn>
                <Btn variant="platinum" icon="sparkle" onClick={() => app.upgrade('platinum')}>Upgrade</Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'hostel' && (
        <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <Kpi icon="home" label="Blocks" value="4" />
          <Kpi icon="grid" iconBg="var(--info-bg)" iconColor="var(--info)" label="Rooms" value="186" />
          <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Residents" value="412" />
          <Kpi icon="checkCircle" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Occupancy" value="88%" />
        </div>
      )}

      {tab === 'sports' && (
        <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <Kpi icon="shield" label="Teams" value="22" />
          <Kpi icon="calendar" iconBg="var(--info-bg)" iconColor="var(--info)" label="Events" value="14" />
          <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Athletes" value="640" />
          <Kpi icon="sparkle" iconBg="var(--gold-bg)" iconColor="var(--gold)" label="Medals '26" value="38" />
        </div>
      )}
    </div>
  )
}

/* ============================================================
   LIVE GPS BUS TRACKING
   List is open on all plans; the live map is Platinum-gated.
   ============================================================ */
function GpsScreen() {
  const app = useApp()
  return (
    <div>
      <PageHead title="Live bus tracking"
        sub="GPS fleet monitoring · live speed & ETA"
        actions={app.plan !== 'platinum' ? <Btn variant="platinum" icon="sparkle" onClick={() => app.upgrade('platinum')}>Upgrade to Platinum</Btn> : <Badge tone="success" soft dot>Live</Badge>} />
      <div className="col gap16">
        <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <Kpi icon="bus" label="Vehicles" value={buses.length} />
          <Kpi icon="zap" iconBg="var(--success-bg)" iconColor="var(--success)" label="On route" value={buses.filter((b) => b.status === 'on_route').length} />
          <Kpi icon="alert" iconBg="var(--danger-bg)" iconColor="var(--danger)" label="Delayed" value={buses.filter((b) => b.status === 'delayed').length} />
          <Kpi icon="users" iconBg="var(--info-bg)" iconColor="var(--info)" label="Students riding" value={buses.reduce((n, b) => n + b.students, 0)} />
        </div>

        <Card pad={false}><BusFleet /></Card>

        <TierGate feature="transport.gps" title="Live GPS bus tracking"
          blurb="Track every bus on a live map with real-time positions, speed and parent ETA sharing. Available on the Platinum plan.">
          <Card>
            <CardHead title="Live map" sub="Real-time vehicle positions" icon="pin"
              action={<Badge tone="success" soft dot>Streaming</Badge>} />
            <div style={{
              position: 'relative', height: 360, borderRadius: 14, overflow: 'hidden',
              background: 'repeating-linear-gradient(0deg, var(--surface-2) 0 39px, var(--border) 39px 40px), repeating-linear-gradient(90deg, var(--surface-2) 0 39px, var(--border) 39px 40px)',
            }}>
              {buses.filter((b) => b.status !== 'maintenance').map((b, i) => (
                <div key={b.id} className="row ai-center gap6" style={{
                  position: 'absolute',
                  left: `${10 + (i * 13) % 78}%`, top: `${14 + (i * 21) % 70}%`,
                }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: b.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                    <Icon name="bus" size={15} />
                  </span>
                  <span className="t-xs fw6" style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>{b.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </TierGate>
      </div>
    </div>
  )
}

/* ---------- exports ---------- */
import type { ComponentType } from 'react'
export const opsScreens: Record<string, ComponentType> = {
  'school.comm': CommunicationScreen,
  'school.ops': OperationsScreen,
  'school.gps': GpsScreen,
}
