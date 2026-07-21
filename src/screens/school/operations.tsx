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
import { useEffect, useMemo, useRef, useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useApp, useToast } from '@/lib/hooks'
import {
  PageHead, Tabs, Card, CardHead, Kpi, Btn, IconBtn, Badge, Avatar, Search,
  Select, Field, Input, Textarea, Modal, Icon, Empty, Checkbox, TierPill,
  Segmented, DataTable, type Column, type BadgeTone,
} from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { BusMap } from '@/components/maps/BusMap'
import { useComplaints, useCreateComplaint, useUpdateComplaint } from '@/api/hooks/useComplaints'
import { useThreads, useThreadMessages, useCreateThread, useSendMessage } from '@/api/hooks/useThreads'
import { useMergedClassNames } from '@/api/hooks/useClasses'
import { useAnnouncements, useCreateAnnouncement } from '@/api/hooks/useAnnouncements'
import { useStudents } from '@/api/hooks/useStudents'
import { useTeachers } from '@/api/hooks/useTeachers'
import { useStaff } from '@/api/hooks/useStaff'
import { collectAudienceContacts } from '@/lib/collectAudienceEmails'
import { gradeRank } from '@/lib/defaultClasses'
import {
  useTransportSummary, useTransportFleet,
  useBusStudents, useAssignStudentToBus, useUnassignStudentFromBus,
  useCreateBus, useTransportRoutes, useCreateRoute, useRouteStops,
  useHostelSummary, useHostelBlocks, useHostelRooms,
  useCreateHostelBlock, useCreateHostelRoom, useCreateHostelResident,
  useSportsSummary, useSportsTeams, useSportsEvents, useSportsMedals,
  useCreateSportsTeam, useCreateSportsEvent, useCreateSportsMedal,
} from '@/api/hooks/useOperations'
import type { FleetBus, TransportRoute, RouteStop, SportsMedal } from '@/api/operations'
import type { Bus, Complaint } from '@/types'
import type { ChatMessage, ChatAttachment } from '@/api/threads'
import type { Announcement } from '@/api/announcements'

/* ---------- shared meta ---------- */
const PRIORITY_TONE: Record<Complaint['priority'], BadgeTone> = { high: 'danger', medium: 'warning', low: 'neutral' }
const STATUS_TONE: Record<Complaint['status'], BadgeTone> = { open: 'info', in_progress: 'warning', resolved: 'success' }
const STATUS_LABEL: Record<Complaint['status'], string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' }

/* Strip the data-URL prefix so we can POST raw base64 for email attachments. */
function fileToBase64(file: File): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const comma = raw.indexOf(',')
      resolve({
        base64: comma >= 0 ? raw.slice(comma + 1) : raw,
        contentType: file.type || 'application/octet-stream',
      })
    }
    reader.onerror = () => reject(new Error('Could not read attachment'))
    reader.readAsDataURL(file)
  })
}

/* Messenger contact categories — group the people picker by who they are. */
type ContactKind = 'parent' | 'teacher' | 'staff'
const CONTACT_GROUPS: { kind: ContactKind; label: string; icon: string }[] = [
  { kind: 'parent', label: 'Parents', icon: 'users' },
  { kind: 'teacher', label: 'Teachers', icon: 'cap' },
  { kind: 'staff', label: 'Staff', icon: 'shield' },
]

const BUS_META: Record<Bus['status'], { tone: BadgeTone; label: string }> = {
  on_route: { tone: 'success', label: 'On route' },
  at_stop: { tone: 'info', label: 'At stop' },
  delayed: { tone: 'danger', label: 'Delayed' },
  idle: { tone: 'neutral', label: 'Idle' },
  maintenance: { tone: 'warning', label: 'Maintenance' },
}

/** Stable colour per vehicle from its number plate (backend has no colour column). */
function busHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

/** Human "time since last GPS ping". */
function relTime(iso?: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

/* ============================================================
   COMMUNICATION
   ============================================================ */
function CommunicationScreen() {
  const [tab, setTab] = useState('messenger')
  const { data: threadsData } = useThreads()
  const { data: complaintsData } = useComplaints()
  const unread = (threadsData ?? []).reduce((n, t) => n + t.unread, 0)
  const openComplaints = (complaintsData ?? []).filter((c) => c.status !== 'resolved').length
  return (
    <div>
      <PageHead title="Communication" sub="Messenger · Complaints · Announcements" />
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'messenger', label: 'Messenger', icon: 'message', count: unread },
          { value: 'complaints', label: 'Complaints', icon: 'inbox', count: openComplaints },
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
function hueFor(seed: string): number {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

function MessengerTab() {
  const toast = useToast()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ChatAttachment[]>([])
  const [localMsgs, setLocalMsgs] = useState<Record<string, ChatMessage[]>>({})
  const [newOpen, setNewOpen] = useState(false)
  const [newMode, setNewMode] = useState<'people' | 'class'>('people')
  const [groupClass, setGroupClass] = useState<string | null>(null)
  const [contactQ, setContactQ] = useState('')
  const [catFilter, setCatFilter] = useState<'all' | ContactKind>('all')

  const { data: threadsData, isLoading } = useThreads()
  const createThread = useCreateThread()
  const sendMessageMut = useSendMessage()
  const classNames = useMergedClassNames()
  const { data: teachersData } = useTeachers()
  const { data: staffData } = useStaff()
  const { data: studentsData } = useStudents()
  const allThreads = threadsData ?? []

  const filteredClasses = useMemo(() => {
    const term = contactQ.trim().toLowerCase()
    return term ? classNames.filter((c) => c.toLowerCase().includes(term)) : classNames
  }, [classNames, contactQ])

  /* Students of the drilled-in class (for 1:1 parent chat within a class). */
  const classStudents = useMemo(() => {
    if (!groupClass) return []
    const term = contactQ.trim().toLowerCase()
    const list = (studentsData ?? []).filter((s) => (s.cls ?? '').trim() === groupClass)
    return term ? list.filter((s) => s.name.toLowerCase().includes(term)) : list
  }, [groupClass, studentsData, contactQ])

  /* Keep a valid active thread when the list loads / changes. */
  useEffect(() => {
    if (!allThreads.length) { if (activeId !== null) setActiveId(null); return }
    if (!activeId || !allThreads.some((t) => t.id === activeId)) setActiveId(allThreads[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadsData])

  const thread = allThreads.find((t) => t.id === activeId) ?? null
  const { data: messagesData, isLoading: msgsLoading } = useThreadMessages(activeId)
  /* Server messages + this session's locally-attached messages (files/images). */
  const msgs = useMemo(
    () => [...(messagesData ?? []), ...(activeId ? localMsgs[activeId] ?? [] : [])],
    [messagesData, localMsgs, activeId],
  )

  /* Drop half-composed attachments when switching conversations. */
  useEffect(() => { setPending([]) }, [activeId])

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const next: ChatAttachment[] = Array.from(files).map((f, i) => ({
      id: `att-${Date.now()}-${i}`,
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type || 'application/octet-stream',
      size: f.size,
    }))
    setPending((p) => [...p, ...next])
  }
  const removePending = (id: string) => setPending((p) => p.filter((a) => a.id !== id))

  /* everyone you can message: live teachers, staff and parents */
  const contacts = useMemo(() => [
    ...(teachersData ?? []).map((t) => ({ id: 't:' + t.id, name: t.name, hue: t.avatarHue ?? 0, kind: 'teacher' as ContactKind, role: ['Teacher', t.dept].filter(Boolean).join(' · ') })),
    ...(staffData ?? []).map((s) => ({ id: 's:' + s.id, name: s.name, hue: s.avatarHue ?? 0, kind: 'staff' as ContactKind, role: [s.role, s.dept].filter(Boolean).join(' · ') })),
    ...(studentsData ?? []).slice(0, 120).map((s) => ({ id: 'p:' + s.id, name: `${s.name} (parent)`, hue: s.avatarHue ?? 0, kind: 'parent' as ContactKind, role: ['Parent', s.cls].filter(Boolean).join(' · ') })),
  ], [teachersData, staffData, studentsData])
  const filteredContacts = useMemo(() => {
    const term = contactQ.trim().toLowerCase()
    return term ? contacts.filter((c) => c.name.toLowerCase().includes(term) || c.role.toLowerCase().includes(term)) : contacts
  }, [contacts, contactQ])

  const openNewChat = () => { setNewMode('people'); setGroupClass(null); setContactQ(''); setCatFilter('all'); setNewOpen(true) }

  const startChat = (c: { name: string; role: string }) => {
    createThread.mutate(
      { name: c.name, role: c.role },
      {
        onSuccess: (t) => {
          setActiveId(t.id); setNewOpen(false); setContactQ('')
          toast.success('Chat started', `You can now message ${c.name}.`)
        },
        onError: (err) => toast.danger('Could not start chat', err instanceof Error ? err.message : 'Please try again.'),
      },
    )
  }

  const startGroup = (cls: string) => {
    /* Reuse an existing class room if one already exists. */
    const existing = allThreads.find((t) => t.group && t.name === cls)
    if (existing) {
      setActiveId(existing.id); setNewOpen(false); setContactQ('')
      toast.info('Class room opened', `${cls} group already exists.`)
      return
    }
    createThread.mutate(
      { name: cls, role: 'Class group', group: true },
      {
        onSuccess: (t) => {
          setActiveId(t.id); setNewOpen(false); setContactQ('')
          toast.success('Class room created', `Group chat for ${cls} is ready.`)
        },
        onError: (err) => toast.danger('Could not create room', err instanceof Error ? err.message : 'Please try again.'),
      },
    )
  }

  const send = () => {
    if (!thread) return
    const t = text.trim()
    const target = thread
    /* With attachments we render locally (mock backend stores text only). */
    if (pending.length) {
      const msg: ChatMessage = {
        id: `local-${Date.now()}`,
        threadId: target.id,
        text: t,
        at: 'now',
        mine: true,
        attachments: pending,
      }
      setLocalMsgs((m) => ({ ...m, [target.id]: [...(m[target.id] ?? []), msg] }))
      setPending([])
      setText('')
      return
    }
    if (!t) return
    setText('')
    sendMessageMut.mutate(
      { threadId: target.id, text: t },
      {
        onError: (err) => {
          setText(t)
          toast.danger('Message not sent', err instanceof Error ? err.message : 'Please try again.')
        },
      },
    )
  }

  return (
    <Card pad={false}>
      <div className="row" style={{ alignItems: 'stretch', minHeight: 460 }}>
        {/* Thread list */}
        <div style={{ width: 300, borderRight: '1px solid var(--border)', flex: '0 0 auto' }}>
          <div className="row ai-center jc-between" style={{ padding: '10px 12px 10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span className="fw7 t-md">Conversations</span>
            <Btn size="sm" variant="secondary" icon="plus" onClick={openNewChat}>New chat</Btn>
          </div>
          <div className="col" style={{ overflowY: 'auto', maxHeight: 520 }}>
            {allThreads.map((t) => (
              <button key={t.id} className="row ai-center gap10"
                onClick={() => setActiveId(t.id)}
                style={{
                  padding: '12px 14px', textAlign: 'left', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)', width: '100%',
                  background: t.id === activeId ? 'var(--brand-50)' : 'transparent',
                }}>
                <Avatar name={t.name} hue={hueFor(t.id || t.name)} size={38} />
                <div className="flex1" style={{ minWidth: 0 }}>
                  <div className="row ai-center jc-between gap8">
                    <span className="fw6 t-md row ai-center gap6" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.group && <Icon name="users" size={13} style={{ color: 'var(--brand-600)', flex: '0 0 auto' }} />}
                      {t.name}
                    </span>
                    <span className="t-xs muted3" style={{ flex: '0 0 auto' }}>{t.time}</span>
                  </div>
                  {t.role && <div className="t-xs muted3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.role}</div>}
                  <div className="t-xs muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.last}</div>
                </div>
                {t.unread > 0 && <span className="sm-badge solid sm-badge-brand" style={{ flex: '0 0 auto' }}>{t.unread}</span>}
              </button>
            ))}
            {allThreads.length === 0 && (
              <div style={{ padding: 16 }}>
                <Empty icon="message" title={isLoading ? 'Loading…' : 'No conversations'} body={isLoading ? undefined : 'Start a new chat with a teacher, staff member or parent.'} />
              </div>
            )}
          </div>
        </div>

        {/* Conversation */}
        <div className="col flex1" style={{ minWidth: 0 }}>
          {thread ? (
            <>
              <div className="row ai-center gap10" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <Avatar name={thread.name} hue={hueFor(thread.id || thread.name)} size={36} />
                <div className="flex1">
                  <div className="fw6 t-md row ai-center gap6">
                    {thread.group && <Icon name="users" size={14} style={{ color: 'var(--brand-600)' }} />}
                    {thread.name}
                  </div>
                  <div className="t-xs muted3">{thread.role || 'Conversation'}</div>
                </div>
                {/* NOTE: no call/phone button — messaging only */}
                {thread.group && <Badge tone="brand" soft icon="users">Class group</Badge>}
                <Badge tone="info" soft icon="message">Message only</Badge>
              </div>
              <div className="col gap10 flex1" style={{ padding: 16, overflow: 'auto' }}>
                {msgsLoading && msgs.length === 0 && <div className="t-sm muted" style={{ textAlign: 'center' }}>Loading messages…</div>}
                {!msgsLoading && msgs.length === 0 && <Empty icon="message" title="No messages yet" body="Say hello to start the conversation." />}
                {msgs.map((m) => (
                  <div key={m.id} className="row" style={{ justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '9px 13px', borderRadius: 14,
                      background: m.mine ? 'var(--brand-600)' : 'var(--surface-2)',
                      color: m.mine ? '#fff' : 'var(--text)',
                    }}>
                      {m.text && <div className="t-md">{m.text}</div>}
                      {m.attachments?.map((a) => (
                        a.type.startsWith('image/') ? (
                          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: m.text ? 6 : 0 }}>
                            <img src={a.url} alt={a.name} style={{ maxWidth: 220, maxHeight: 180, borderRadius: 10, display: 'block' }} />
                          </a>
                        ) : (
                          <a key={a.id} href={a.url} download={a.name} className="row ai-center gap8"
                            style={{
                              marginTop: m.text ? 6 : 0, padding: '7px 10px', borderRadius: 10, textDecoration: 'none',
                              background: m.mine ? 'rgba(255,255,255,0.18)' : 'var(--surface)',
                              color: m.mine ? '#fff' : 'var(--text)', border: m.mine ? 'none' : '1px solid var(--border)',
                            }}>
                            <Icon name="doc" size={16} />
                            <span className="t-sm fw6" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            <Icon name="download" size={14} style={{ opacity: 0.8 }} />
                          </a>
                        )
                      ))}
                      <div className="t-xs" style={{ opacity: 0.7, marginTop: 3, textAlign: 'right' }}>{m.at}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="col" style={{ borderTop: '1px solid var(--border)' }}>
                {pending.length > 0 && (
                  <div className="row wrap gap8" style={{ padding: '10px 12px 0' }}>
                    {pending.map((a) => (
                      <div key={a.id} className="row ai-center gap6"
                        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 6px 4px 8px', background: 'var(--surface-2)' }}>
                        {a.type.startsWith('image/')
                          ? <img src={a.url} alt={a.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
                          : <Icon name="doc" size={16} style={{ color: 'var(--text-2)' }} />}
                        <span className="t-xs fw6" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        <button type="button" onClick={() => removePending(a.id)} title="Remove"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}>
                          <Icon name="x" size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="row ai-center gap8" style={{ padding: 12 }}>
                  <input
                    ref={fileRef} type="file" multiple hidden
                    onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                  />
                  <IconBtn icon="upload" title="Attach files or images" onClick={() => fileRef.current?.click()} />
                  <div className="flex1">
                    <Input icon="message" placeholder="Type a message…" value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
                  </div>
                  <Btn variant="primary" icon="arrowRight" onClick={send} disabled={(!text.trim() && pending.length === 0) || sendMessageMut.isPending}>Send</Btn>
                </div>
              </div>
            </>
          ) : (
            <Empty icon="message" title="Select a conversation" />
          )}
        </div>
      </div>

      {/* New chat — 1:1 with a person or a class group room */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} size="sm" icon="message"
        title="New chat" sub="Message a person, or open a class group room"
        footer={<div className="row jc-end"><Btn variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Btn></div>}>
        <div style={{ marginBottom: 12 }}>
          <Segmented
            value={newMode}
            onChange={(v) => { setNewMode(v as 'people' | 'class'); setGroupClass(null); setContactQ(''); setCatFilter('all') }}
            options={[
              { value: 'people', label: 'People' },
              { value: 'class', label: 'Class group' },
            ]}
          />
        </div>
        <Search
          value={contactQ}
          onChange={setContactQ}
          placeholder={newMode === 'people' ? 'Search people…' : groupClass ? `Search students in ${groupClass}…` : 'Search classes…'}
        />
        {newMode === 'people' ? (
          <>
            <div style={{ marginTop: 12 }}>
              <Segmented
                value={catFilter}
                onChange={(v) => setCatFilter(v as 'all' | ContactKind)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'parent', label: 'Parents' },
                  { value: 'teacher', label: 'Teachers' },
                  { value: 'staff', label: 'Staff' },
                ]}
              />
            </div>
            <div className="col gap6" style={{ marginTop: 12, maxHeight: 340, overflowY: 'auto' }}>
              {CONTACT_GROUPS.filter((g) => catFilter === 'all' || catFilter === g.kind).map((g) => {
                const items = filteredContacts.filter((c) => c.kind === g.kind)
                if (!items.length) return null
                return (
                  <div key={g.kind} className="col gap6">
                    <div className="row ai-center gap6" style={{ padding: '8px 2px 2px' }}>
                      <Icon name={g.icon} size={13} style={{ color: 'var(--text-3)', flex: '0 0 auto' }} />
                      <span className="t-xs fw7 muted3" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>{g.label}</span>
                      <Badge tone="neutral" soft>{items.length}</Badge>
                    </div>
                    {items.map((c) => (
                      <button key={c.id} onClick={() => startChat(c)} disabled={createThread.isPending} className="row ai-center gap10"
                        style={{ width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', background: 'var(--surface)', cursor: 'pointer' }}>
                        <Avatar name={c.name} hue={c.hue} size={34} />
                        <div className="flex1" style={{ minWidth: 0 }}>
                          <div className="fw6 t-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                          <div className="t-xs muted3">{c.role}</div>
                        </div>
                        <Icon name="arrowRight" size={15} style={{ color: 'var(--text-3)', flex: '0 0 auto' }} />
                      </button>
                    ))}
                  </div>
                )
              })}
              {filteredContacts.filter((c) => catFilter === 'all' || catFilter === c.kind).length === 0 && (
                <div style={{ padding: 8 }}><Empty icon="search" title="No people match" /></div>
              )}
            </div>
          </>
        ) : groupClass ? (
          <div className="col gap6" style={{ marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
            {/* Drilled into a class: whole-class group OR one student's parent */}
            <button onClick={() => { setGroupClass(null); setContactQ('') }} className="row ai-center gap8"
              style={{ width: 'fit-content', border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 0', color: 'var(--brand-600)' }}>
              <Icon name="arrowLeft" size={14} /> <span className="t-sm fw6">All classes</span>
            </button>
            <button onClick={() => startGroup(groupClass)} disabled={createThread.isPending} className="row ai-center gap10"
              style={{ width: '100%', textAlign: 'left', border: '1.5px solid var(--brand-600)', borderRadius: 10, padding: '8px 11px', background: 'var(--brand-50)', cursor: 'pointer' }}>
              <span className="sm-card-ic"><Icon name="users" size={16} /></span>
              <div className="flex1" style={{ minWidth: 0 }}>
                <div className="fw6 t-sm">Message whole class</div>
                <div className="t-xs muted3">{groupClass} group · all parents</div>
              </div>
              <Icon name="arrowRight" size={15} style={{ color: 'var(--brand-600)', flex: '0 0 auto' }} />
            </button>
            <div className="t-xs muted3" style={{ padding: '4px 2px' }}>Or message one student’s parent</div>
            {classStudents.map((s) => (
              <button
                key={s.id}
                onClick={() => startChat({ name: `${s.name} (parent)`, role: `Parent · ${groupClass}` })}
                disabled={createThread.isPending}
                className="row ai-center gap10"
                style={{ width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', background: 'var(--surface)', cursor: 'pointer' }}
              >
                <Avatar name={s.name} hue={s.avatarHue ?? 0} size={34} />
                <div className="flex1" style={{ minWidth: 0 }}>
                  <div className="fw6 t-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div className="t-xs muted3">Parent · {groupClass}</div>
                </div>
                <Icon name="arrowRight" size={15} style={{ color: 'var(--text-3)', flex: '0 0 auto' }} />
              </button>
            ))}
            {classStudents.length === 0 && (
              <div style={{ padding: 8 }}>
                <Empty icon="users" title="No students in this class" body="Add students to this class in SIS, or message the whole class group." />
              </div>
            )}
          </div>
        ) : (
          <div className="col gap6" style={{ marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
            {filteredClasses.map((cls) => {
              const exists = allThreads.some((t) => t.group && t.name === cls)
              return (
                <button key={cls} onClick={() => { setGroupClass(cls); setContactQ('') }} className="row ai-center gap10"
                  style={{ width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', background: 'var(--surface)', cursor: 'pointer' }}>
                  <span className="sm-card-ic"><Icon name="users" size={16} /></span>
                  <div className="flex1" style={{ minWidth: 0 }}>
                    <div className="fw6 t-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls}</div>
                    <div className="t-xs muted3">Whole class group · or pick a student</div>
                  </div>
                  {exists && <Badge tone="success" soft>Room</Badge>}
                  <Icon name="arrowRight" size={15} style={{ color: 'var(--text-3)', flex: '0 0 auto' }} />
                </button>
              )
            })}
            {filteredClasses.length === 0 && <div style={{ padding: 8 }}><Empty icon="search" title="No classes match" body="Add classes under Academics to create class rooms." /></div>}
          </div>
        )}
      </Modal>
    </Card>
  )
}

/* ---------- Complaints: triage + resolve ---------- */
function ComplaintsTab() {
  const toast = useToast()
  const [newOpen, setNewOpen] = useState(false)

  const { data: complaintsData, isLoading } = useComplaints()
  const updateComplaint = useUpdateComplaint()
  const rows: Complaint[] = complaintsData ?? []

  const resolve = (c: Complaint) => {
    if (c.status === 'resolved') return
    updateComplaint.mutate(
      { id: c.id, input: { status: 'resolved' } },
      {
        onSuccess: () => toast.success('Complaint resolved', `${c.subject} marked resolved`),
        onError: (err) => toast.danger('Could not resolve', err instanceof Error ? err.message : 'Please try again.'),
      },
    )
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
        : (
          <Btn
            size="sm" variant="secondary" icon="check"
            disabled={updateComplaint.isPending}
            onClick={() => resolve(r)}
          >
            Resolve
          </Btn>
        ),
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
        <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <CardHead title="Complaint triage" sub="Prioritise, assign & resolve parent / staff complaints" icon="inbox" />
          <Btn variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New complaint</Btn>
        </div>
        {rows.length === 0 && !isLoading
          ? <Empty icon="inbox" title="No complaints" body="Logged complaints from parents and staff will appear here." />
          : <DataTable columns={cols} rows={rows} pageSize={8} rowKey={(r) => r.id} initialSort={{ key: 'priority', dir: 'asc' }} />}
      </Card>
      <NewComplaintModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

function NewComplaintModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const createComplaint = useCreateComplaint()
  const [subject, setSubject] = useState('')
  const [from, setFrom] = useState('')
  const [cat, setCat] = useState('General')
  const [priority, setPriority] = useState<Complaint['priority']>('medium')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!open) return
    setSubject(''); setFrom(''); setCat('General'); setPriority('medium'); setBody('')
  }, [open])

  const submit = () => {
    if (!subject.trim()) { toast.danger('Subject required', 'Enter a short complaint subject.'); return }
    createComplaint.mutate(
      { subject, from, category: cat, priority, body },
      {
        onSuccess: () => { toast.success('Complaint logged', `${subject} added to triage.`); onClose() },
        onError: (err) => toast.danger('Could not log complaint', err instanceof Error ? err.message : 'Please try again.'),
      },
    )
  }

  return (
    <Modal
      open={open} onClose={onClose} icon="inbox"
      title="Log a complaint" sub="Capture a parent or staff complaint for triage"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={createComplaint.isPending} onClick={submit}>
            {createComplaint.isPending ? 'Logging…' : 'Log complaint'}
          </Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Subject" required>
          <Input icon="inbox" value={subject} placeholder="e.g. Bus arriving late" onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <div className="sm-grid-2 gap16">
          <Field label="From">
            <Input value={from} placeholder="Parent / staff name" onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Category">
            <Select
              options={['General', 'Transport', 'Academics', 'Fees', 'Facilities', 'Safety']}
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Priority">
          <Select
            options={[{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]}
            value={priority}
            onChange={(e) => setPriority(e.target.value as Complaint['priority'])}
          />
        </Field>
        <Field label="Details">
          <Textarea value={body} rows={4} placeholder="Describe the complaint…" onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ---------- Announcements ---------- */
const AUDIENCE_KEYS: AudienceKey[] = ['parents', 'students', 'teachers', 'staff', 'everyone', 'grades', 'defaulters', 'specific']
const asAudienceKey = (v: string): AudienceKey =>
  (AUDIENCE_KEYS as string[]).includes(v) ? (v as AudienceKey) : 'parents'

/* Pretty sender role for the "sent by" line in the app + mail. */
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', admin: 'Administrator', principal: 'Principal',
  vice_principal: 'Vice Principal', teacher: 'Teacher', staff: 'Staff',
}
const roleLabel = (r?: string): string =>
  !r ? '' : ROLE_LABEL[r] ?? r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/* "Priya Nair · Principal" / "Principal" / "" depending on what the backend returned. */
const senderLine = (a: { from?: string; role?: string }): string =>
  [a.from, roleLabel(a.role)].filter(Boolean).join(' · ')

function AnnouncementsTab() {
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<AnnouncementPrefill | null>(null)
  const [viewing, setViewing] = useState<Announcement | null>(null)
  const { data: sentData } = useAnnouncements()
  const sent = sentData ?? []

  const compose = () => { setPrefill(null); setOpen(true) }
  const resend = (a: Announcement) => {
    setPrefill({ title: a.title, body: a.body ?? '', audience: asAudienceKey(a.audience) })
    setOpen(true)
  }

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
          <Btn variant="primary" icon="plus" onClick={compose}>New announcement</Btn>
        </div>
      </Card>
      <Card pad={false}>
        <CardHead title="Recent announcements" icon="list" />
        <div className="col">
          {sent.length === 0 && (
            <div style={{ padding: 8 }}><Empty icon="bell" title="No announcements yet" body="Create your first announcement to reach parents, students and staff." /></div>
          )}
          {sent.map((a) => (
            <div key={a.id} className="row ai-center jc-between gap12 wrap" style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
              <div className="row ai-center gap12" style={{ minWidth: 0, flex: 1 }}>
                <span className="sm-card-ic"><Icon name="bell" size={15} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="fw6 t-md">{a.title}</div>
                  <div className="t-xs muted3">
                    {a.audience} · {a.ch}{senderLine(a) ? ` · Sent by ${senderLine(a)}` : ''}
                  </div>
                </div>
              </div>
              <div className="row ai-center gap10" style={{ flex: '0 0 auto' }}>
                <span className="t-sm muted">{a.when}</span>
                <Badge tone="success" soft icon="users">{a.reach.toLocaleString()} reached</Badge>
                <Btn variant="ghost" size="sm" icon="eye" onClick={() => setViewing(a)}>Open</Btn>
                <Btn variant="secondary" size="sm" icon="refresh" onClick={() => resend(a)}>Resend</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <AnnouncementModal open={open} initial={prefill} onClose={() => setOpen(false)} />
      <AnnouncementDetailModal
        announcement={viewing}
        onClose={() => setViewing(null)}
        onResend={(a) => { setViewing(null); resend(a) }}
      />
    </div>
  )
}

function AnnouncementDetailModal({ announcement, onClose, onResend }: {
  announcement: Announcement | null
  onClose: () => void
  onResend: (a: Announcement) => void
}) {
  const a = announcement
  return (
    <Modal
      open={!!a} onClose={onClose} icon="bell"
      title={a?.title || 'Announcement'} sub={a ? `${a.audience} · ${a.ch}` : undefined}
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          {a && <Btn variant="primary" icon="refresh" onClick={() => onResend(a)}>Resend</Btn>}
        </div>
      }
    >
      {a && (
        <div className="col gap14">
          <Card style={{ background: 'var(--surface-2)' }}>
            <div className="t-xs muted3" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Message</div>
            <div className="t-md" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{a.body || <span className="muted">No message body.</span>}</div>
          </Card>
          <div className="sm-grid-2">
            <ReviewRow label="Sent by" value={senderLine(a) || '—'} />
            <ReviewRow label="Audience" value={a.audience} />
            <ReviewRow label="Channels" value={a.ch} />
            <ReviewRow label="Reach" value={`${a.reach.toLocaleString()} recipients`} />
            <ReviewRow label="Sent" value={a.when} />
          </div>
        </div>
      )}
    </Modal>
  )
}

interface AnnouncementPrefill { title: string; body: string; audience: AudienceKey }
interface Person { id: string; name: string; sub: string; kind: 'student' | 'teacher' | 'staff' }
type AudienceKey = 'parents' | 'students' | 'teachers' | 'staff' | 'everyone' | 'grades' | 'defaulters' | 'specific'

function AnnouncementModal({ open, initial, onClose }: { open: boolean; initial?: AnnouncementPrefill | null; onClose: () => void }) {
  const app = useApp()
  const toast = useToast()
  const createAnnouncement = useCreateAnnouncement()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: studentsData } = useStudents()
  const { data: teachersData } = useTeachers()
  const { data: staffData } = useStaff()
  const studentsList = useMemo(() => studentsData ?? [], [studentsData])
  const teacherCount = (teachersData ?? []).length
  const staffCount = (staffData ?? []).length
  const feeDefaulters = useMemo(() => studentsList.filter((s) => s.feeStatus !== 'paid'), [studentsList])
  const gradeList = useMemo(
    () => [...new Set(studentsList.map((s) => s.grade).filter(Boolean))]
      .sort((a, b) => gradeRank(a) - gradeRank(b)),
    [studentsList],
  )

  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [aud, setAud] = useState<AudienceKey>('parents')
  const [selGrades, setSelGrades] = useState<Set<string>>(new Set())
  const [people, setPeople] = useState<Person[]>([])
  const [push, setPush] = useState(true)
  const [sms, setSms] = useState(true)
  const [email, setEmail] = useState(true)
  const [attachment, setAttachment] = useState<File | null>(null)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setTitle(initial?.title ?? '')
    setBody(initial?.body ?? '')
    setAud(initial?.audience ?? 'parents')
    setSelGrades(new Set()); setPeople([])
    setPush(true); setSms(true); setEmail(true)
    setAttachment(null)
  }, [open, initial])

  const gradeCount = useMemo(
    () => studentsList.filter((s) => selGrades.has(s.grade)).length,
    [selGrades, studentsList],
  )

  const count = (k: AudienceKey): number => {
    switch (k) {
      case 'parents': return studentsList.length
      case 'students': return studentsList.length
      case 'teachers': return teacherCount
      case 'staff': return staffCount
      case 'everyone': return studentsList.length * 2 + teacherCount + staffCount
      case 'grades': return gradeCount
      case 'defaulters': return feeDefaulters.length
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

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      toast.danger('Missing content', 'Title and message body are required.')
      return
    }
    if (!email && !push && !sms) {
      toast.danger('Pick a channel', 'Enable Email, SMS, and/or App (push).')
      return
    }
    const channelList = [
      email ? 'email' : '',
      sms ? 'sms' : '',
      push ? 'app' : '',
    ].filter(Boolean)
    const channelTag = channelList.join('+').slice(0, 20)
    let attachmentBase64: string | undefined
    let attachmentFileName: string | undefined
    let attachmentContentType: string | undefined
    if (attachment) {
      try {
        const encoded = await fileToBase64(attachment)
        attachmentBase64 = encoded.base64
        attachmentFileName = attachment.name
        attachmentContentType = encoded.contentType
      } catch {
        toast.danger('Attachment failed', 'Could not read the attached file. Remove it and try again.')
        return
      }
    }
    const contacts = await collectAudienceContacts(aud)
    if (email && !contacts.emails.length && sms && !contacts.phones.length && !push) {
      toast.danger(
        'No contacts found',
        'Add parent/teacher email or mobile on student & teacher records, then try again.',
      )
      return
    }
    if (email && !contacts.emails.length && !sms && !push) {
      toast.danger('No emails found', 'Add emails on the selected audience, then try again.')
      return
    }
    if (sms && !contacts.phones.length && !email && !push) {
      toast.danger('No mobile numbers found', 'Add guardian/teacher phones, then try again.')
      return
    }
    createAnnouncement.mutate({
      title: title.trim(),
      body: body.trim(),
      type: channelTag || 'general',
      audience: aud,
      emails: contacts.emails,
      phones: contacts.phones,
      channels: channelList,
      schoolName: app.school.name,
      eventDate: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
      eventKind: 'Announcement',
      attachmentBase64,
      attachmentFileName,
      attachmentContentType,
    }, {
      onSuccess: (created) => {
        const n = created.reach ?? 0
        const bits = [
          email ? `${contacts.emails.length} email${attachment ? ' + file' : ''}` : '',
          sms ? `${contacts.phones.length} SMS` : '',
          push ? 'app' : '',
        ].filter(Boolean)
        if (n === 0 && !push) {
          toast.danger('Saved, but nothing queued', 'No email/SMS contacts for this audience.')
        } else {
          toast.success(
            'Announcement sent',
            `"${title.trim()}" → ${bits.join(' · ')} (reach ${n}).`,
          )
        }
        onClose()
      },
      onError: (err) => { toast.danger('Could not send', err instanceof Error ? err.message : 'Please try again.') },
    })
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
          <Field label="Attachment" hint="Optional — a PDF/image sent along with the branded email notice.">
            <input
              ref={fileRef} type="file" hidden
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
              onChange={(e) => { setAttachment(e.target.files?.[0] ?? null); e.target.value = '' }}
            />
            {attachment ? (
              <div className="row ai-center gap8" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', background: 'var(--surface-2)' }}>
                <Icon name="doc" size={16} style={{ color: 'var(--text-2)' }} />
                <span className="fw6 t-sm flex1" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
                <span className="t-xs muted3">{(attachment.size / 1024).toFixed(0)} KB</span>
                <IconBtn icon="x" size={15} title="Remove attachment" onClick={() => setAttachment(null)} />
              </div>
            ) : (
              <Btn variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>Attach a file</Btn>
            )}
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
                {gradeList.length === 0 && <div className="t-sm muted">No grades with students yet.</div>}
                {gradeList.map((g) => {
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
            <div className="row ai-center jc-between">
              <div className="t-xs muted3" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Announcement</div>
              <span className="t-xs muted3">{app.school.name} · SchoolMate</span>
            </div>
            <div className="fw7 t-lg" style={{ margin: '6px 0' }}>{title || 'Untitled'}</div>
            <div className="t-md muted" style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
          </Card>
          <div className="sm-grid-2">
            <ReviewRow label="Audience" value={audOptions.find((o) => o.key === aud)?.label ?? ''} />
            <ReviewRow label="Recipients" value={recipients.toLocaleString()} />
            <ReviewRow label="Channels" value={[push && 'Push', sms && 'SMS', email && 'Email'].filter(Boolean).join(' · ') || 'None'} />
            <ReviewRow label="Estimated cost" value={totalCost > 0 ? `₹${totalCost.toFixed(2)}` : 'Free'} />
            <ReviewRow label="Sent by" value={roleLabel(app.role) || 'You'} />
            <ReviewRow label="From" value={`${app.school.name} · SchoolMate`} />
            <ReviewRow label="Attachments" value={email ? (attachment ? `Notice PDF + ${attachment.name}` : 'Notice PDF') : (attachment ? attachment.name : 'None')} />
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
  const { data: studentsData } = useStudents()
  const { data: teachersData } = useTeachers()
  const { data: staffData } = useStaff()

  const pool: Person[] = useMemo(() => {
    if (tab === 'student') return (studentsData ?? []).map((s) => ({ id: s.id, name: s.name, sub: s.cls ?? '', kind: 'student' as const }))
    if (tab === 'teacher') return (teachersData ?? []).map((t) => ({ id: t.id, name: t.name, sub: t.dept ?? '', kind: 'teacher' as const }))
    return (staffData ?? []).map((s) => ({ id: s.id, name: s.name, sub: s.role ?? '', kind: 'staff' as const }))
  }, [tab, studentsData, teachersData, staffData])

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
/** Live fleet board. Self-fetches when no `fleet` prop is supplied; otherwise
 *  renders the fleet passed by the parent screen (shared query). */
function BusFleet({ fleet: fleetProp, loading: loadingProp, error: errorProp }: {
  fleet?: FleetBus[]
  loading?: boolean
  error?: boolean
} = {}) {
  const self = useTransportFleet(fleetProp === undefined)
  const fleet = fleetProp ?? self.data ?? []
  const loading = loadingProp ?? self.isLoading
  const error = errorProp ?? self.isError
  const [ridersFor, setRidersFor] = useState<FleetBus | null>(null)

  const active = fleet.filter((b) => b.status === 'on_route' || b.status === 'at_stop' || b.status === 'delayed').length

  const cols: Column<FleetBus>[] = [
    {
      key: 'busNo', label: 'Bus', sortValue: (r) => r.busNo,
      render: (r) => (
        <div className="row ai-center gap10">
          <span style={{ width: 34, height: 34, borderRadius: 9, background: `hsl(${busHue(r.busNo)} 58% 45%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <Icon name="bus" size={16} />
          </span>
          <div><div className="fw6">{r.busNo}</div>{r.routeName ? <div className="t-xs muted3">{r.routeName}</div> : null}</div>
        </div>
      ),
    },
    {
      key: 'route', label: 'Route', sortValue: (r) => r.routeName ?? '',
      render: (r) => <div><div className="t-md">{r.routeName || '—'}</div><div className="t-xs muted3">{r.stopCount} stops</div></div>,
    },
    {
      key: 'driver', label: 'Driver',
      render: (r) => r.driver ? <div><div className="t-md">{r.driver}</div>{r.driverPhone ? <div className="t-xs muted3">{r.driverPhone}</div> : null}</div> : <span className="muted3">—</span>,
    },
    {
      key: 'studentsRiding', label: 'Riding', align: 'right', sortValue: (r) => r.studentsRiding,
      render: (r) => r.studentsRiding > 0 ? <span className="tnum t-sm">{r.studentsRiding}</span> : <span className="muted3">—</span>,
    },
    {
      key: 'speedKmh', label: 'Speed', align: 'right',
      render: (r) => (r.status === 'on_route' || r.status === 'delayed') && r.speedKmh != null
        ? <span className="row ai-center gap5 jc-end"><span className="sm-dot-live" style={{ width: 6, height: 6 }} /><span className="tnum fw6">{Math.round(r.speedKmh)} km/h</span></span>
        : <span className="muted3">—</span>,
    },
    { key: 'nextStopName', label: 'Next stop', render: (r) => r.nextStopName ? <Badge tone="neutral" icon="pin">{r.nextStopName}</Badge> : <span className="muted3">—</span> },
    { key: 'lastPingAt', label: 'Updated', align: 'right', sortValue: (r) => r.lastPingAt ?? '', render: (r) => <span className="t-xs muted3">{relTime(r.lastPingAt)}</span> },
    { key: 'status', label: 'Live status', sortValue: (r) => r.status, render: (r) => <Badge tone={BUS_META[r.status].tone} soft dot>{BUS_META[r.status].label}</Badge> },
    {
      key: 'riders', label: '', align: 'right',
      render: (r) => (
        <IconBtn icon="users" title="Manage riders" onClick={() => setRidersFor(r)} />
      ),
    },
  ]

  return (
    <div className="sm-table-wrap">
      <div className="row ai-center jc-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div className="row ai-center gap10">
          <span className="sm-dot-live" /><span className="fw7 t-lg">Fleet &amp; live status</span>
          <Badge tone="success" soft>{active} active now</Badge>
        </div>
      </div>
      {loading && fleet.length === 0 ? (
        <div style={{ padding: 24 }}><Empty icon="bus" title="Loading fleet…" /></div>
      ) : error && fleet.length === 0 ? (
        <div style={{ padding: 24 }}><Empty icon="alert" title="Couldn’t load the fleet" body="Check your connection and try again." /></div>
      ) : fleet.length === 0 ? (
        <div style={{ padding: 24 }}><Empty icon="bus" title="No vehicles yet" body="Register buses and start a trip from the driver app to see them live here." /></div>
      ) : (
        <DataTable columns={cols} rows={fleet} pageSize={8} rowKey={(r) => r.busId} initialSort={{ key: 'status', dir: 'asc' }} />
      )}
      {ridersFor && (
        <BusRidersModal bus={ridersFor} onClose={() => setRidersFor(null)} />
      )}
    </div>
  )
}

/* ---------- Transport: assign students (riders) to a bus ---------- */
function BusRidersModal({ bus, onClose }: { bus: FleetBus; onClose: () => void }) {
  const toast = useToast()
  const ridersQ = useBusStudents(bus.busId)
  const { data: studentsData } = useStudents()
  const stopsQ = useRouteStops(bus.routeId ?? null)
  const assign = useAssignStudentToBus()
  const unassign = useUnassignStudentFromBus()
  const [pick, setPick] = useState('')
  const [pickStop, setPickStop] = useState('')

  const riders = ridersQ.data ?? []
  const stops: RouteStop[] = stopsQ.data ?? []
  const assignedIds = useMemo(() => new Set(riders.map((r) => r.studentId)), [riders])
  const available = useMemo(
    () => (studentsData ?? []).filter((s) => !assignedIds.has(s.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [studentsData, assignedIds],
  )
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.')

  useEffect(() => { setPickStop('') }, [pick])

  const add = () => {
    if (!pick) return
    assign.mutate({ busId: bus.busId, studentId: pick, stopId: pickStop || null }, {
      onSuccess: () => { toast.success('Rider added', 'Student assigned to this bus.'); setPick(''); setPickStop('') },
      onError: (e) => toast.danger('Could not assign', errMsg(e)),
    })
  }
  const remove = (studentId: string, name: string) => {
    unassign.mutate({ busId: bus.busId, studentId }, {
      onSuccess: () => toast.success('Rider removed', `${name} unassigned.`),
      onError: (e) => toast.danger('Could not remove', errMsg(e)),
    })
  }

  return (
    <Modal open onClose={onClose} size="sm" icon="bus" title={`Riders · Bus ${bus.busNo}`}
      sub={bus.routeName ? `Route: ${bus.routeName}` : 'Assign students who ride this bus'}
      footer={<div className="row jc-end"><Btn variant="ghost" onClick={onClose}>Done</Btn></div>}>
      <div className="col gap16">
        <div className="col gap10">
          <Field label="Add a student">
            <Select value={pick} onChange={(e) => setPick(e.target.value)}
              options={[
                { value: '', label: available.length ? 'Select a student…' : 'All students assigned' },
                ...available.map((s) => ({ value: s.id, label: `${s.name}${s.cls ? ` · ${s.cls}` : ''}` })),
              ]} />
          </Field>
          {stops.length > 0 && (
            <Field label="Boarding / alighting stop" hint="The stop this student uses">
              <Select value={pickStop} onChange={(e) => setPickStop(e.target.value)}
                options={[
                  { value: '', label: 'No specific stop' },
                  ...stops
                    .slice()
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((s) => ({ value: s.id, label: `${s.sequence}. ${s.name}` })),
                ]} />
            </Field>
          )}
          <Btn variant="primary" icon="plus" disabled={!pick || assign.isPending} onClick={add}>
            {assign.isPending ? 'Adding…' : 'Add'}
          </Btn>
        </div>

        {ridersQ.isLoading ? (
          <Empty icon="users" title="Loading riders…" />
        ) : riders.length === 0 ? (
          <Empty icon="users" title="No riders yet" body="Assign students above to build this bus's roster." />
        ) : (
          <div className="col gap8">
            <div className="t-xs muted3">{riders.length} rider{riders.length === 1 ? '' : 's'}</div>
            {riders.map((r) => (
              <div key={r.studentId} className="row ai-center jc-between gap10"
                style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div className="row ai-center gap10">
                  <Avatar name={r.studentName} />
                  <div>
                    <div className="fw6">{r.studentName}</div>
                    <div className="t-xs muted3">{r.admissionNo}{r.stopName ? ` · Stop: ${r.stopName}` : ''}</div>
                  </div>
                </div>
                <IconBtn icon="trash" title="Remove rider" disabled={unassign.isPending}
                  onClick={() => remove(r.studentId, r.studentName)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ============================================================
   OPERATIONS
   ============================================================ */
/** Render a KPI value from a query: loading → "…", error/empty → "—", else formatted. */
function kpiVal<T>(q: UseQueryResult<T>, fmt: (d: T) => string): string {
  if (q.isLoading) return '…'
  if (q.isError || q.data == null) return '—'
  return fmt(q.data)
}

function TransportTab() {
  const app = useApp()
  const s = useTransportSummary()
  const [manage, setManage] = useState(false)
  return (
    <div className="col gap16">
      <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kpi icon="bus" label="Vehicles" value={kpiVal(s, (d) => d.vehicles.toLocaleString())} />
        <Kpi icon="pin" iconBg="var(--info-bg)" iconColor="var(--info)" label="Routes" value={kpiVal(s, (d) => d.routes.toLocaleString())} />
        <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Students" value={kpiVal(s, (d) => d.students.toLocaleString())} />
        <Kpi icon="clock" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Stops" value={kpiVal(s, (d) => d.stops.toLocaleString())} />
      </div>
      <Card pad={false}>
        <div className="row ai-center jc-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <CardHead title="Fleet & routes" sub="Registered buses and route assignments" icon="bus" />
          <Btn variant="primary" icon="plus" onClick={() => setManage(true)}>Add</Btn>
        </div>
        <BusFleet />
      </Card>
      {app.plan === 'platinum' ? (
        <Card style={{ background: 'linear-gradient(100deg,var(--success-bg),transparent)', borderColor: 'var(--success)' }}>
          <div className="row ai-center jc-between gap14 wrap">
            <div className="row ai-center gap12">
              <span className="sm-gate-lock" style={{ width: 44, height: 44, margin: 0, background: 'var(--success)', color: '#fff' }}><Icon name="pin" size={20} /></span>
              <div>
                <div className="row ai-center gap8"><span className="fw7 t-lg">Live GPS bus tracking</span><Badge tone="success" soft dot>Live</Badge></div>
                <div className="t-sm muted">Track every bus on a live map with real-time positions and share ETAs with parents.</div>
              </div>
            </div>
            <div className="row gap10">
              <Btn variant="primary" icon="pin" onClick={() => app.go('school.gps')}>Open live map</Btn>
            </div>
          </div>
        </Card>
      ) : (
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
      )}
      <TransportManageModal open={manage} onClose={() => setManage(false)} />
    </div>
  )
}

function HostelTab() {
  const s = useHostelSummary()
  const blocks = useHostelBlocks()
  const rooms = useHostelRooms()
  const [manage, setManage] = useState(false)
  const blockList = blocks.data ?? []
  const roomList = rooms.data ?? []
  return (
    <div className="col gap16">
      <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kpi icon="home" label="Blocks" value={kpiVal(s, (d) => d.blocks.toLocaleString())} />
        <Kpi icon="grid" iconBg="var(--info-bg)" iconColor="var(--info)" label="Rooms" value={kpiVal(s, (d) => d.rooms.toLocaleString())} />
        <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Residents" value={kpiVal(s, (d) => d.residents.toLocaleString())} />
        <Kpi icon="checkCircle" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Occupancy" value={kpiVal(s, (d) => d.occupancyPct + '%')} />
      </div>
      <Card pad={false}>
        <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <CardHead title="Blocks & rooms" sub="Hostel blocks, room capacity and occupancy" icon="home" />
          <Btn variant="primary" icon="plus" onClick={() => setManage(true)}>Add</Btn>
        </div>
        {blockList.length === 0
          ? <div style={{ padding: 8 }}><Empty icon="home" title={blocks.isLoading ? 'Loading…' : 'No hostel blocks yet'} body={blocks.isLoading ? undefined : 'Add a block, then rooms and residents to track occupancy.'} /></div>
          : (
            <div className="col">
              {blockList.map((b) => {
                const rs = roomList.filter((r) => r.blockId === b.id)
                const beds = rs.reduce((n, r) => n + r.capacity, 0)
                const res = rs.reduce((n, r) => n + r.residents, 0)
                return (
                  <div key={b.id} className="row ai-center jc-between gap12" style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div className="row ai-center gap12" style={{ minWidth: 0 }}>
                      <span className="sm-card-ic"><Icon name="home" size={15} /></span>
                      <div style={{ minWidth: 0 }}>
                        <div className="fw6 t-md">{b.name}</div>
                        <div className="t-xs muted3">{b.warden ? `Warden · ${b.warden}` : 'No warden assigned'} · {rs.length} room{rs.length === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                    <Badge tone={beds > 0 && res >= beds ? 'warning' : 'success'} soft icon="users">{res}/{beds} beds</Badge>
                  </div>
                )
              })}
            </div>
          )}
      </Card>
      <HostelManageModal open={manage} onClose={() => setManage(false)} blocks={blockList} rooms={roomList} />
    </div>
  )
}

const MEDAL_ICON_COLOR: Record<string, string> = {
  gold: 'var(--gold)',
  silver: '#9ca3af',
  bronze: '#b45309',
}
const MEDAL_TONE: Record<string, BadgeTone> = { gold: 'warning', silver: 'neutral', bronze: 'neutral' }

function medalLabel(m: SportsMedal): string {
  return m.title || `${m.kind[0].toUpperCase()}${m.kind.slice(1)} medal`
}

function SportsTab() {
  const s = useSportsSummary()
  const teams = useSportsTeams()
  const events = useSportsEvents()
  const medals = useSportsMedals()
  const [manage, setManage] = useState(false)
  const teamList = teams.data ?? []
  const eventList = events.data ?? []
  const medalList = medals.data ?? []
  const year = new Date().getFullYear().toString().slice(-2)
  return (
    <div className="col gap16">
      <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kpi icon="shield" label="Teams" value={kpiVal(s, (d) => d.teams.toLocaleString())} />
        <Kpi icon="calendar" iconBg="var(--info-bg)" iconColor="var(--info)" label="Events" value={kpiVal(s, (d) => d.events.toLocaleString())} />
        <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Athletes" value={kpiVal(s, (d) => d.athletes.toLocaleString())} />
        <Kpi icon="sparkle" iconBg="var(--gold-bg)" iconColor="var(--gold)" label={`Medals '${year}`} value={kpiVal(s, (d) => d.medals.toLocaleString())} />
      </div>

      {/* Teams & events */}
      <Card pad={false}>
        <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <CardHead title="Teams & events" sub="Squads, coaches and the fixtures calendar" icon="shield" />
          <Btn variant="primary" icon="plus" onClick={() => setManage(true)}>Add</Btn>
        </div>
        {teamList.length === 0 && eventList.length === 0
          ? <div style={{ padding: 8 }}><Empty icon="shield" title={teams.isLoading ? 'Loading…' : 'No teams or events yet'} body={teams.isLoading ? undefined : 'Add teams, fixtures and medals to build the sports dashboard.'} /></div>
          : (
            <div className="col">
              {teamList.map((t) => (
                <div key={t.id} className="row ai-center jc-between gap12" style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="row ai-center gap12" style={{ minWidth: 0 }}>
                    <span className="sm-card-ic"><Icon name="shield" size={15} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="fw6 t-md">{t.name}</div>
                      <div className="t-xs muted3">{t.sport}{t.coach ? ` · ${t.coach}` : ''}</div>
                    </div>
                  </div>
                  <Badge tone="neutral" soft icon="users">{t.athletes} athletes</Badge>
                </div>
              ))}
              {eventList.map((e) => (
                <div key={e.id} className="row ai-center jc-between gap12" style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="row ai-center gap12" style={{ minWidth: 0 }}>
                    <span className="sm-card-ic"><Icon name="calendar" size={15} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="fw6 t-md">{e.name}</div>
                      <div className="t-xs muted3">{e.venue || 'Venue TBD'}</div>
                    </div>
                  </div>
                  <Badge tone="info" soft icon="calendar">{new Date(e.eventDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Badge>
                </div>
              ))}
            </div>
          )}
      </Card>

      {/* Medals */}
      <Card pad={false}>
        <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <CardHead title="Medals" sub="Gold, silver and bronze awards" icon="sparkle" />
          <Btn variant="primary" icon="plus" onClick={() => setManage(true)}>Add</Btn>
        </div>
        {medalList.length === 0
          ? <div style={{ padding: 8 }}><Empty icon="sparkle" title={medals.isLoading ? 'Loading…' : 'No medals recorded'} body={medals.isLoading ? undefined : 'Record gold, silver and bronze medals won at competitions.'} /></div>
          : (
            <div className="col">
              {medalList.map((m) => (
                <div key={m.id} className="row ai-center jc-between gap12" style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="row ai-center gap12" style={{ minWidth: 0 }}>
                    <span className="sm-card-ic"><Icon name="sparkle" size={15} style={{ color: MEDAL_ICON_COLOR[m.kind] ?? 'var(--gold)' }} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="fw6 t-md">{medalLabel(m)}</div>
                      <div className="t-xs muted3">{m.kind[0].toUpperCase()}{m.kind.slice(1)}{m.year ? ` · ${m.year}` : ''}</div>
                    </div>
                  </div>
                  <Badge tone={MEDAL_TONE[m.kind] ?? 'neutral'} soft>{m.kind}</Badge>
                </div>
              ))}
            </div>
          )}
      </Card>

      <SportsManageModal open={manage} onClose={() => setManage(false)} teams={teamList} />
    </div>
  )
}

function OperationsScreen() {
  const [tab, setTab] = useState('transport')
  return (
    <div>
      <PageHead title="Operations" sub="Transport · Hostel · Sports" />
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'transport', label: 'Transport', icon: 'bus' },
          { value: 'hostel', label: 'Hostel', icon: 'home' },
          { value: 'sports', label: 'Sports', icon: 'shield' },
        ]} />
      </div>

      {tab === 'transport' && <TransportTab />}
      {tab === 'hostel' && <HostelTab />}
      {tab === 'sports' && <SportsTab />}
    </div>
  )
}

/* ---------- Transport: add bus / route ---------- */
function TransportManageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [mode, setMode] = useState<'bus' | 'route'>('bus')
  const createBusMut = useCreateBus()
  const createRouteMut = useCreateRoute()
  const routesQ = useTransportRoutes()
  const routeList: TransportRoute[] = routesQ.data ?? []

  const [busNo, setBusNo] = useState('')
  const [routeName, setRouteName] = useState('')
  const [driver, setDriver] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [newRouteName, setNewRouteName] = useState('')
  const [stops, setStops] = useState('5')

  useEffect(() => {
    if (!open) return
    setMode('bus')
    setBusNo(''); setRouteName(''); setDriver(''); setDriverPhone('')
    setNewRouteName(''); setStops('5')
  }, [open])

  const busy = createBusMut.isPending || createRouteMut.isPending
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.')

  const submit = () => {
    if (mode === 'bus') {
      createBusMut.mutate({ busNo, routeName: routeName || null, driver: driver || null, driverPhone: driverPhone || null }, {
        onSuccess: (b) => { toast.success('Bus added', `Bus ${b.busNo} registered.`); onClose() },
        onError: (e) => toast.danger('Could not add bus', errMsg(e)),
      })
    } else {
      createRouteMut.mutate({ name: newRouteName, stops: Number(stops) || 1 }, {
        onSuccess: (r) => { toast.success('Route added', `${r.name} created with ${r.stops} stops.`); onClose() },
        onError: (e) => toast.danger('Could not add route', errMsg(e)),
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" icon="bus" title="Add to transport"
      sub="Register a bus or create a new route"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      }>
      <div style={{ marginBottom: 14 }}>
        <Segmented value={mode} onChange={(v) => setMode(v as typeof mode)}
          options={[{ value: 'bus', label: 'Bus' }, { value: 'route', label: 'Route' }]} />
      </div>
      {mode === 'bus' && (
        <div className="col gap16">
          <div className="sm-grid-2 gap16">
            <Field label="Bus number" required><Input icon="bus" placeholder="e.g. MH12AB1234" value={busNo} onChange={(e) => setBusNo(e.target.value)} /></Field>
            <Field label="Route" hint="Assign to an existing route">
              <Select value={routeName} onChange={(e) => setRouteName(e.target.value)}
                options={[{ value: '', label: routeList.length ? 'No route (assign later)' : 'No routes yet' }, ...routeList.map((r) => ({ value: r.name, label: r.name }))]} />
            </Field>
          </div>
          <div className="sm-grid-2 gap16">
            <Field label="Driver"><Input placeholder="Driver name (optional)" value={driver} onChange={(e) => setDriver(e.target.value)} /></Field>
            <Field label="Driver phone"><Input type="tel" placeholder="+91 9999999999" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} /></Field>
          </div>
        </div>
      )}
      {mode === 'route' && (
        <div className="col gap16">
          <Field label="Route name" required><Input icon="pin" placeholder="e.g. North Campus Loop" value={newRouteName} onChange={(e) => setNewRouteName(e.target.value)} /></Field>
          <Field label="Stops" hint="Number of stops on this route"><Input type="number" min={1} value={stops} onChange={(e) => setStops(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  )
}

/* ---------- Hostel: add block / room / resident ---------- */
function HostelManageModal({ open, onClose, blocks, rooms }: {
  open: boolean; onClose: () => void
  blocks: { id: string; name: string }[]
  rooms: { id: string; roomNo: string; blockName: string | null }[]
}) {
  const toast = useToast()
  const [mode, setMode] = useState<'block' | 'room' | 'resident'>('block')
  const createBlock = useCreateHostelBlock()
  const createRoom = useCreateHostelRoom()
  const createResident = useCreateHostelResident()

  const [blockName, setBlockName] = useState('')
  const [warden, setWarden] = useState('')
  const [roomBlockId, setRoomBlockId] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [residentRoomId, setResidentRoomId] = useState('')
  const [residentName, setResidentName] = useState('')

  useEffect(() => {
    if (!open) return
    setMode('block')
    setBlockName(''); setWarden('')
    setRoomBlockId(blocks[0]?.id ?? ''); setRoomNo(''); setCapacity('4')
    setResidentRoomId(rooms[0]?.id ?? ''); setResidentName('')
  }, [open, blocks, rooms])

  const busy = createBlock.isPending || createRoom.isPending || createResident.isPending
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.')

  const submit = () => {
    if (mode === 'block') {
      createBlock.mutate({ name: blockName, warden }, {
        onSuccess: (b) => { toast.success('Block added', `${b.name} created.`); onClose() },
        onError: (e) => toast.danger('Could not add block', errMsg(e)),
      })
    } else if (mode === 'room') {
      createRoom.mutate({ blockId: roomBlockId, roomNo, capacity: Number(capacity) || 1 }, {
        onSuccess: (r) => { toast.success('Room added', `Room ${r.roomNo} created.`); onClose() },
        onError: (e) => toast.danger('Could not add room', errMsg(e)),
      })
    } else {
      createResident.mutate({ roomId: residentRoomId, studentName: residentName }, {
        onSuccess: (r) => { toast.success('Resident added', `${r.studentName} checked in.`); onClose() },
        onError: (e) => toast.danger('Could not add resident', errMsg(e)),
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" icon="home" title="Add to hostel"
      sub="Create a block, a room, or check in a resident"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      }>
      <div style={{ marginBottom: 14 }}>
        <Segmented value={mode} onChange={(v) => setMode(v as typeof mode)}
          options={[{ value: 'block', label: 'Block' }, { value: 'room', label: 'Room' }, { value: 'resident', label: 'Resident' }]} />
      </div>
      {mode === 'block' && (
        <div className="col gap16">
          <Field label="Block name" required><Input icon="home" placeholder="e.g. A Block" value={blockName} onChange={(e) => setBlockName(e.target.value)} /></Field>
          <Field label="Warden"><Input placeholder="Warden name (optional)" value={warden} onChange={(e) => setWarden(e.target.value)} /></Field>
        </div>
      )}
      {mode === 'room' && (
        blocks.length === 0
          ? <Empty icon="home" title="Add a block first" body="Rooms belong to a block — create one on the Block tab." />
          : (
            <div className="col gap16">
              <Field label="Block" required>
                <Select value={roomBlockId} onChange={(e) => setRoomBlockId(e.target.value)}
                  options={blocks.map((b) => ({ value: b.id, label: b.name }))} />
              </Field>
              <div className="sm-grid-2 gap16">
                <Field label="Room number" required><Input placeholder="e.g. A-101" value={roomNo} onChange={(e) => setRoomNo(e.target.value)} /></Field>
                <Field label="Capacity (beds)"><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
              </div>
            </div>
          )
      )}
      {mode === 'resident' && (
        rooms.length === 0
          ? <Empty icon="grid" title="Add a room first" body="Residents check into a room — create one on the Room tab." />
          : (
            <div className="col gap16">
              <Field label="Room" required>
                <Select value={residentRoomId} onChange={(e) => setResidentRoomId(e.target.value)}
                  options={rooms.map((r) => ({ value: r.id, label: r.blockName ? `${r.blockName} · ${r.roomNo}` : r.roomNo }))} />
              </Field>
              <Field label="Resident name" required><Input icon="user" placeholder="Student name" value={residentName} onChange={(e) => setResidentName(e.target.value)} /></Field>
            </div>
          )
      )}
    </Modal>
  )
}

/* ---------- Sports: add team / event / medal ---------- */
function SportsManageModal({ open, onClose, teams }: {
  open: boolean; onClose: () => void
  teams: { id: string; name: string }[]
}) {
  const toast = useToast()
  const [mode, setMode] = useState<'team' | 'event' | 'medal'>('team')
  const createTeam = useCreateSportsTeam()
  const createEvent = useCreateSportsEvent()
  const createMedal = useCreateSportsMedal()

  const [teamName, setTeamName] = useState('')
  const [sport, setSport] = useState('')
  const [coach, setCoach] = useState('')
  const [athletes, setAthletes] = useState('12')
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [venue, setVenue] = useState('')
  const [medalKind, setMedalKind] = useState('gold')
  const [medalTitle, setMedalTitle] = useState('')
  const [medalYear, setMedalYear] = useState(String(new Date().getFullYear()))

  useEffect(() => {
    if (!open) return
    setMode('team')
    setTeamName(''); setSport(''); setCoach(''); setAthletes('12')
    setEventName(''); setEventDate(''); setVenue('')
    setMedalKind('gold'); setMedalTitle(''); setMedalYear(String(new Date().getFullYear()))
  }, [open])

  const busy = createTeam.isPending || createEvent.isPending || createMedal.isPending
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.')

  const submit = () => {
    if (mode === 'team') {
      createTeam.mutate({ name: teamName, sport, coach, athletes: Number(athletes) || 0 }, {
        onSuccess: (t) => { toast.success('Team added', `${t.name} created.`); onClose() },
        onError: (e) => toast.danger('Could not add team', errMsg(e)),
      })
    } else if (mode === 'event') {
      createEvent.mutate({ name: eventName, eventDate, venue }, {
        onSuccess: (ev) => { toast.success('Event added', `${ev.name} scheduled.`); onClose() },
        onError: (e) => toast.danger('Could not add event', errMsg(e)),
      })
    } else {
      createMedal.mutate({ kind: medalKind, title: medalTitle, year: Number(medalYear) || new Date().getFullYear() }, {
        onSuccess: () => { toast.success('Medal recorded', `${medalKind[0].toUpperCase() + medalKind.slice(1)} medal added.`); onClose() },
        onError: (e) => toast.danger('Could not record medal', errMsg(e)),
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" icon="shield" title="Add to sports"
      sub="Create a team, schedule an event, or record a medal"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      }>
      <div style={{ marginBottom: 14 }}>
        <Segmented value={mode} onChange={(v) => setMode(v as typeof mode)}
          options={[{ value: 'team', label: 'Team' }, { value: 'event', label: 'Event' }, { value: 'medal', label: 'Medal' }]} />
      </div>
      {mode === 'team' && (
        <div className="col gap16">
          <div className="sm-grid-2 gap16">
            <Field label="Team name" required><Input icon="shield" placeholder="e.g. Senior Football" value={teamName} onChange={(e) => setTeamName(e.target.value)} /></Field>
            <Field label="Sport" required><Input placeholder="e.g. Football" value={sport} onChange={(e) => setSport(e.target.value)} /></Field>
          </div>
          <div className="sm-grid-2 gap16">
            <Field label="Coach"><Input placeholder="Coach name (optional)" value={coach} onChange={(e) => setCoach(e.target.value)} /></Field>
            <Field label="Athletes"><Input type="number" min={0} value={athletes} onChange={(e) => setAthletes(e.target.value)} /></Field>
          </div>
        </div>
      )}
      {mode === 'event' && (
        <div className="col gap16">
          <Field label="Event name" required><Input icon="calendar" placeholder="e.g. Annual Sports Day" value={eventName} onChange={(e) => setEventName(e.target.value)} /></Field>
          <div className="sm-grid-2 gap16">
            <Field label="Date" required><Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></Field>
            <Field label="Venue"><Input placeholder="e.g. Main Ground" value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>
          </div>
        </div>
      )}
      {mode === 'medal' && (
        <div className="col gap16">
          <div className="sm-grid-2 gap16">
            <Field label="Medal" required>
              <Select value={medalKind} onChange={(e) => setMedalKind(e.target.value)}
                options={[{ value: 'gold', label: 'Gold' }, { value: 'silver', label: 'Silver' }, { value: 'bronze', label: 'Bronze' }]} />
            </Field>
            <Field label="Year"><Input type="number" min={2000} max={2100} value={medalYear} onChange={(e) => setMedalYear(e.target.value)} /></Field>
          </div>
          <Field label="Won for" hint="Event or discipline this medal was awarded for">
            <Input placeholder="e.g. 100m Sprint" value={medalTitle} onChange={(e) => setMedalTitle(e.target.value)} />
          </Field>
          {teams.length === 0 && <div className="t-xs muted3">Tip: add teams and events too so the dashboard is complete.</div>}
        </div>
      )}
    </Modal>
  )
}

/* ============================================================
   LIVE GPS BUS TRACKING
   List is open on all plans; the live map is Platinum-gated.
   ============================================================ */
function GpsScreen() {
  const app = useApp()
  const fleetQ = useTransportFleet()
  const fleet = fleetQ.data ?? []

  const onRoute = fleet.filter((b) => b.status === 'on_route').length
  const delayed = fleet.filter((b) => b.status === 'delayed').length
  const riding = fleet.reduce((n, b) => n + b.studentsRiding, 0)
  const located = fleet.filter((b) => b.lat != null && b.lng != null)

  return (
    <div>
      <PageHead title="Live bus tracking"
        sub="GPS fleet monitoring · live speed & next stop"
        actions={app.plan !== 'platinum' ? <Btn variant="platinum" icon="sparkle" onClick={() => app.upgrade('platinum')}>Upgrade to Platinum</Btn> : <Badge tone="success" soft dot>Live</Badge>} />
      <div className="col gap16">
        <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <Kpi icon="bus" label="Vehicles" value={fleet.length} />
          <Kpi icon="zap" iconBg="var(--success-bg)" iconColor="var(--success)" label="On route" value={onRoute} />
          <Kpi icon="alert" iconBg="var(--danger-bg)" iconColor="var(--danger)" label="Delayed" value={delayed} />
          <Kpi icon="users" iconBg="var(--info-bg)" iconColor="var(--info)" label="Students riding" value={riding} />
        </div>

        <Card pad={false}><BusFleet fleet={fleet} loading={fleetQ.isLoading} error={fleetQ.isError} /></Card>

        <TierGate feature="transport.gps" title="Live GPS bus tracking"
          blurb="Track every bus on a live map with real-time positions, speed and parent ETA sharing. Available on the Platinum plan.">
          <Card>
            <CardHead title="Live map" sub="Real-time vehicle positions" icon="pin"
              action={located.length > 0 ? <Badge tone="success" soft dot>{located.length} live</Badge> : <Badge tone="neutral" soft>No live GPS</Badge>} />
            <BusMap buses={fleet} />
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
