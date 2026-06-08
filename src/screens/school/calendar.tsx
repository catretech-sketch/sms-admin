/* ============================================================
   SchoolMate — Academic Calendar
   Month grid + agenda of holidays, exams, fee due dates, PTMs
   and events. Frontend-only: deterministic seeded events per
   month + a local "Add event". Admin-editable, others view-only.
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can } from '@/lib/gating'
import {
  PageHead, Card, CardHead, Btn, Badge, Select, Field, Input, Textarea, Checkbox, Modal, Icon, Empty, Segmented,
} from '@/components/ui'

type EvType = 'holiday' | 'exam' | 'fee' | 'ptm' | 'event'
interface Ev { date: string; type: EvType; title: string; desc?: string }

type Channel = 'app' | 'push' | 'email'
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'app', label: 'In-app' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
]

const EVENT_META: Record<EvType, { label: string; color: string; icon: string }> = {
  holiday: { label: 'Holiday', color: '#16a34a', icon: 'sparkle' },
  exam: { label: 'Exam', color: '#dc2626', icon: 'clipboard' },
  fee: { label: 'Fee due', color: '#d97706', icon: 'rupee' },
  ptm: { label: 'PTM', color: '#0ea5e9', icon: 'users' },
  event: { label: 'Event', color: '#7c3aed', icon: 'calendar' },
}
const TYPES = Object.keys(EVENT_META) as EvType[]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

/* deterministic seeded events for a given month */
function seededEvents(y: number, m: number): Ev[] {
  const dim = daysInMonth(y, m)
  const h = hash(`${y}-${m}`)
  const pick = (salt: string, lo: number, hi: number) => lo + (hash(salt + h) % (hi - lo + 1))
  let sat = 0, count = 0
  for (let d = 1; d <= dim; d++) { if (new Date(y, m, d).getDay() === 6) { count++; if (count === 2) { sat = d; break } } }
  return [
    { date: iso(y, m, 10), type: 'fee', title: 'Term fee due' },
    { date: iso(y, m, sat || 13), type: 'ptm', title: 'Parent–teacher meeting' },
    { date: iso(y, m, pick('hol', 1, 28)), type: 'holiday', title: 'Public holiday' },
    { date: iso(y, m, pick('exam', 5, 24)), type: 'exam', title: 'Unit test · Grade X' },
    { date: iso(y, m, pick('exam2', 5, 24)), type: 'exam', title: 'Periodic test · Grade IX' },
    { date: iso(y, m, pick('ev', 1, 28)), type: 'event', title: 'Annual sports day' },
    { date: iso(y, m, pick('ev2', 1, 28)), type: 'event', title: 'Science exhibition' },
  ]
}

function CalendarScreen() {
  const app = useApp()
  const toast = useToast()
  const editable = can(app.role, 'academics', 'E')

  const today = new Date()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [enabled, setEnabled] = useState<Set<EvType>>(new Set(TYPES))
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [extra, setExtra] = useState<Ev[]>([])
  const [selDay, setSelDay] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState<{ date: string; type: EvType; title: string; desc: string; channels: Channel[] }>({
    date: iso(today.getFullYear(), today.getMonth(), today.getDate()), type: 'event', title: '', desc: '', channels: ['app'],
  })

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const events = useMemo(() => {
    const monthExtra = extra.filter((e) => { const [yy, mm] = e.date.split('-').map(Number); return yy === cursor.y && mm === cursor.m + 1 })
    return [...seededEvents(cursor.y, cursor.m), ...monthExtra].filter((e) => enabled.has(e.type))
  }, [cursor, extra, enabled])

  const byDay = useMemo(() => {
    const map: Record<number, Ev[]> = {}
    events.forEach((e) => { const d = Number(e.date.split('-')[2]); (map[d] ??= []).push(e) })
    return map
  }, [events])

  const dim = daysInMonth(cursor.y, cursor.m)
  const lead = new Date(cursor.y, cursor.m, 1).getDay()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const isToday = (d: number) => today.getFullYear() === cursor.y && today.getMonth() === cursor.m && today.getDate() === d
  const go = (delta: number) => setCursor((c) => {
    let m = c.m + delta, y = c.y
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    return { y, m }
  })
  const toggleType = (t: EvType) => setEnabled((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })
  const toggleChannel = (c: Channel) => setForm((f) => ({ ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] }))
  const addEvent = () => {
    if (!form.title.trim()) { toast.danger('Title required', 'Enter an event title.'); return }
    setExtra((x) => [...x, { date: form.date, type: form.type, title: form.title.trim(), desc: form.desc.trim() || undefined }])
    const chs = form.channels.map((c) => CHANNELS.find((x) => x.key === c)!.label)
    toast.success('Event added', `${EVENT_META[form.type].label}: ${form.title.trim()}${chs.length ? ` · notified via ${chs.join(', ')}` : ''}`)
    setAddOpen(false); setForm((f) => ({ ...f, title: '', desc: '' }))
  }

  const agenda = useMemo(() => [...events].sort((a, b) => a.date.localeCompare(b.date)), [events])
  const selEvents = selDay ? events.filter((e) => e.date === selDay) : []

  return (
    <div>
      <PageHead
        title="Calendar"
        sub={`${app.school.name} · academic year`}
        actions={editable ? <Btn variant="primary" icon="plus" onClick={() => setAddOpen(true)}>Add event</Btn> : undefined}
      />

      {/* toolbar */}
      <Card style={{ marginBottom: 16 }}>
        <div className="row ai-center jc-between gap12 wrap">
          <div className="row ai-center gap8">
            <Btn size="sm" variant="secondary" icon="arrowLeft" onClick={() => go(-1)} />
            <span className="fw7 t-lg" style={{ minWidth: 170, textAlign: 'center' }}>{monthLabel}</span>
            <Btn size="sm" variant="secondary" icon="arrowRight" onClick={() => go(1)} />
            <Btn size="sm" variant="ghost" onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}>Today</Btn>
          </div>
          <Segmented value={view} onChange={(v) => setView(v as 'month' | 'agenda')} options={[{ value: 'month', label: 'Month' }, { value: 'agenda', label: 'Agenda' }]} />
        </div>
        <div className="row ai-center gap8 wrap" style={{ marginTop: 12 }}>
          {TYPES.map((t) => {
            const on = enabled.has(t)
            const m = EVENT_META[t]
            return (
              <button key={t} onClick={() => toggleType(t)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${on ? m.color : 'var(--border)'}`,
                background: on ? `color-mix(in srgb, ${m.color} 14%, transparent)` : 'var(--surface)',
                color: on ? m.color : 'var(--text-3)', fontSize: 12.5, fontWeight: 600,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color }} />{m.label}
              </button>
            )
          })}
        </div>
      </Card>

      {view === 'month' ? (
        <Card pad={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="t-xs fw7 muted3" style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{w}</div>
            ))}
            {cells.map((d, i) => (
              <div key={i}
                onClick={() => d && setSelDay(iso(cursor.y, cursor.m, d))}
                style={{
                  minHeight: 106, padding: 6,
                  borderRight: (i % 7 !== 6) ? '1px solid var(--border)' : undefined,
                  borderBottom: '1px solid var(--border)',
                  background: d == null ? 'var(--surface-2)' : undefined,
                  cursor: d ? 'pointer' : 'default',
                }}>
                {d != null && (
                  <>
                    <span className="t-xs fw6" style={isToday(d)
                      ? { background: 'var(--brand-600)', color: '#fff', borderRadius: 999, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
                      : { color: 'var(--text-2)' }}>{d}</span>
                    <div className="col gap4" style={{ marginTop: 4 }}>
                      {(byDay[d] ?? []).slice(0, 3).map((e, j) => {
                        const m = EVENT_META[e.type]
                        return (
                          <div key={j} className="t-xs" style={{
                            display: 'flex', alignItems: 'center', gap: 4, borderRadius: 5, padding: '1px 5px', fontWeight: 600,
                            background: `color-mix(in srgb, ${m.color} 13%, transparent)`, color: m.color,
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: 999, background: m.color, flex: '0 0 auto' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                          </div>
                        )
                      })}
                      {(byDay[d]?.length ?? 0) > 3 && <span className="t-xs muted3">+{byDay[d].length - 3} more</span>}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card pad={false}>
          <CardHead title="Agenda" sub={`${agenda.length} events · ${monthLabel}`} icon="calendar" />
          {agenda.length === 0
            ? <div style={{ padding: 8 }}><Empty icon="calendar" title="No events" body="No events match the current filters this month." /></div>
            : (
              <div className="col">
                {agenda.map((e, i) => {
                  const m = EVENT_META[e.type]
                  const dt = new Date(e.date + 'T00:00:00')
                  return (
                    <div key={i} className="row ai-center gap12" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 46, textAlign: 'center', flex: '0 0 auto' }}>
                        <div className="fw7 t-lg" style={{ lineHeight: 1 }}>{dt.getDate()}</div>
                        <div className="t-xs muted3">{dt.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                      </div>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color, flex: '0 0 auto' }} />
                      <div className="flex1"><div className="t-md fw6">{e.title}</div></div>
                      <Badge tone="neutral" icon={m.icon}>{m.label}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
        </Card>
      )}

      {/* day detail */}
      <Modal open={!!selDay} onClose={() => setSelDay(null)} size="sm" icon="calendar"
        title={selDay ? new Date(selDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        footer={editable
          ? <div className="row gap8 jc-end"><Btn variant="ghost" onClick={() => setSelDay(null)}>Close</Btn><Btn variant="primary" icon="plus" onClick={() => { setForm((f) => ({ ...f, date: selDay! })); setSelDay(null); setAddOpen(true) }}>Add event</Btn></div>
          : undefined}>
        {selEvents.length === 0
          ? <Empty icon="calendar" title="No events" body="Nothing scheduled for this day." />
          : (
            <div className="col gap8">
              {selEvents.map((e, i) => {
                const m = EVENT_META[e.type]
                return (
                  <div key={i} className="row ai-center gap10" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px' }}>
                    <span className="sm-card-ic" style={{ background: `color-mix(in srgb, ${m.color} 14%, transparent)`, color: m.color, flex: '0 0 auto' }}><Icon name={m.icon} size={15} /></span>
                    <div className="flex1" style={{ minWidth: 0 }}><div className="fw6 t-sm">{e.title}</div><div className="t-xs muted3">{m.label}</div>{e.desc && <div className="t-xs muted" style={{ marginTop: 4 }}>{e.desc}</div>}</div>
                  </div>
                )
              })}
            </div>
          )}
      </Modal>

      {/* add event */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} size="sm" icon="plus" title="Add event"
        footer={<div className="row gap8 jc-end"><Btn variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn><Btn variant="primary" icon="check" onClick={addEvent}>Add event</Btn></div>}>
        <div className="col gap12">
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></Field>
          <Field label="Type"><Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EvType }))} options={TYPES.map((t) => ({ value: t, label: EVENT_META[t].label }))} /></Field>
          <Field label="Title" required><Input icon="calendar" value={form.title} placeholder="e.g. Independence Day" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Field>
          <Field label="Description"><Textarea value={form.desc} placeholder="Optional details — agenda, venue, instructions…" onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} /></Field>
          <Field label="Notify via" hint="Announce to parents & staff when this event is saved">
            <div className="row ai-center gap16 wrap">
              {CHANNELS.map((c) => (
                <Checkbox key={c.key} checked={form.channels.includes(c.key)} onChange={() => toggleChannel(c.key)} label={c.label} />
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  )
}

export const calendarScreens: Record<string, ComponentType> = { 'school.calendar': CalendarScreen }
