/* School calendar events — production API (GET/POST/DELETE /v1/calendar). */
import { request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
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

const TYPES: CalendarEventType[] = ['holiday', 'exam', 'fee', 'ptm', 'event']
const CHANNELS: NotifyChannel[] = ['app', 'push', 'email', 'sms']

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_calendar_events:${tenant}`
}

function parseChannels(raw: unknown): NotifyChannel[] {
  if (Array.isArray(raw)) {
    return raw.filter((c): c is NotifyChannel => CHANNELS.includes(c as NotifyChannel))
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseChannels(JSON.parse(raw) as unknown)
    } catch {
      return []
    }
  }
  return []
}

function toEvent(row: Record<string, unknown>): CalendarEvent {
  const c = snakeToCamel<Record<string, unknown>>(row)
  const dateRaw = c.date != null ? String(c.date) : ''
  const date = dateRaw.slice(0, 10)
  const typeRaw = String(c.type ?? 'event').toLowerCase()
  const type = (TYPES.includes(typeRaw as CalendarEventType) ? typeRaw : 'event') as CalendarEventType
  return {
    id: String(c.id ?? ''),
    date,
    type,
    title: String(c.title ?? '').trim(),
    desc: c.description != null && String(c.description).trim()
      ? String(c.description).trim()
      : (c.desc != null && String(c.desc).trim() ? String(c.desc).trim() : undefined),
    channels: parseChannels(c.channelsJson ?? c.channels),
    createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
    attachmentName: c.attachmentName ? String(c.attachmentName) : undefined,
  }
}

function clearLegacyLocal(): void {
  try {
    localStorage.removeItem(storageKey())
  } catch {
    /* ignore */
  }
}

async function createCalendarEventApi(input: CalendarEventInput): Promise<CalendarEvent> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')
  const date = input.date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Valid date is required')
  const channels = [...new Set(input.channels)]
  const wire = await request<Record<string, unknown>>('/calendar', {
    method: 'POST',
    body: camelToSnake({
      title,
      date,
      type: input.type,
      description: input.desc?.trim() || null,
      channelsJson: JSON.stringify(channels),
    }),
  })
  const created = toEvent(wire)
  return {
    ...created,
    channels: created.channels.length ? created.channels : channels,
    attachmentName: input.attachmentName?.trim() || created.attachmentName,
  }
}

export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  const rows = await request<Record<string, unknown>[]>('/calendar')
  clearLegacyLocal()
  const mapped = (rows ?? []).map((r) => toEvent(r)).filter((e) => e.id && e.title)
  return mapped.slice().sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

export async function addCalendarEvent(input: CalendarEventInput): Promise<CalendarEvent> {
  return createCalendarEventApi(input)
}

export async function removeCalendarEvent(id: string): Promise<void> {
  if (!id) throw new Error('Event id is required')
  await request<void>(`/calendar/${id}`, { method: 'DELETE' })
}
