/* School calendar events — tenant-local until Calendar API exists. No seeded dummies. */
import { tokenStore } from './auth/tokenStore'

export type CalendarEventType = 'holiday' | 'exam' | 'fee' | 'ptm' | 'event'
export type NotifyChannel = 'app' | 'push' | 'email' | 'sms'

export interface CalendarEvent {
  id: string
  date: string
  type: CalendarEventType
  title: string
  desc?: string
  channels: NotifyChannel[]
  createdAt: string
  attachmentName?: string
}

export interface CalendarEventInput {
  date: string
  type: CalendarEventType
  title: string
  desc?: string
  channels: NotifyChannel[]
  attachmentName?: string
}

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_calendar_events:${tenant}`
}

function readAll(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is CalendarEvent => {
      if (!e || typeof e !== 'object') return false
      const row = e as Record<string, unknown>
      return typeof row.id === 'string' && typeof row.date === 'string' && typeof row.title === 'string'
    }).map((e) => ({
      ...e,
      channels: Array.isArray(e.channels) ? e.channels.filter((c): c is NotifyChannel => c === 'app' || c === 'push' || c === 'email' || c === 'sms') : [],
      desc: typeof e.desc === 'string' && e.desc.trim() ? e.desc : undefined,
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString(),
      type: (['holiday', 'exam', 'fee', 'ptm', 'event'].includes(e.type) ? e.type : 'event') as CalendarEventType,
    }))
  } catch {
    return []
  }
}

function writeAll(events: CalendarEvent[]): void {
  localStorage.setItem(storageKey(), JSON.stringify(events))
}

export function listCalendarEvents(): CalendarEvent[] {
  return readAll().slice().sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

export function addCalendarEvent(input: CalendarEventInput): CalendarEvent {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')
  const date = input.date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Valid date is required')
  const event: CalendarEvent = {
    id: `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    date,
    type: input.type,
    title,
    desc: input.desc?.trim() || undefined,
    channels: [...new Set(input.channels)],
    attachmentName: input.attachmentName?.trim() || undefined,
    createdAt: new Date().toISOString(),
  }
  const all = readAll()
  all.push(event)
  writeAll(all)
  return event
}

export function removeCalendarEvent(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id))
}
