import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

/** UI-facing chat thread (mapped from backend ChatThreadResponse). */
export interface ChatThread {
  id: string
  name: string
  role: string
  last: string
  lastAt: string | null
  time: string
  unread: number
  group: boolean
  childId: string | null
}

/** A file/image attached to a chat message (shown inline in the app). */
export interface ChatAttachment {
  id: string
  name: string
  url: string
  type: string
  size: number
}

/** UI-facing chat message (mapped from backend ChatMessageResponse). */
export interface ChatMessage {
  id: string
  threadId: string
  text: string
  at: string
  mine: boolean
  attachments?: ChatAttachment[]
}

export interface CreateThreadInput {
  name: string
  role?: string | null
  group?: boolean
  childId?: string | null
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Short relative label (now / 5m / 3h / 2d / 12 Jan) from an ISO datetime. */
export function relTime(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function toThread(wire: Record<string, unknown>): ChatThread {
  const t = snakeToCamel<Record<string, unknown>>(wire)
  const lastAt = (typeof t.lastAt === 'string' ? t.lastAt : null)
  return {
    id: String(t.id ?? ''),
    name: String(t.name ?? '—'),
    role: typeof t.role === 'string' ? t.role : '',
    last: String(t.lastMessage ?? t.last ?? ''),
    lastAt,
    time: relTime(lastAt),
    unread: typeof t.unread === 'number' ? t.unread : 0,
    group: Boolean(t.group),
    childId: t.childId ? String(t.childId) : null,
  }
}

export function toMessage(wire: Record<string, unknown>): ChatMessage {
  const m = snakeToCamel<Record<string, unknown>>(wire)
  return {
    id: String(m.id ?? ''),
    threadId: String(m.threadId ?? ''),
    text: String(m.text ?? ''),
    at: relTime(m.sentAt),
    mine: Boolean(m.isMine),
  }
}

export async function listThreads(): Promise<ChatThread[]> {
  const env = await listRequest<ListEnvelope>('/threads')
  return env.data.map(toThread)
}

export async function createThread(input: CreateThreadInput): Promise<ChatThread> {
  const name = input.name.trim()
  if (!name) throw new Error('Name is required')
  const payload = camelToSnake({
    name,
    role: input.role?.trim() || null,
    group: Boolean(input.group),
    childId: input.childId ?? null,
  })
  const wire = await request<Record<string, unknown>>('/threads', { method: 'POST', body: payload })
  return toThread(wire)
}

export async function listThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const env = await listRequest<ListEnvelope>(`/threads/${threadId}/messages`)
  return env.data.map(toMessage)
}

export async function sendMessage(threadId: string, text: string): Promise<ChatMessage> {
  const t = text.trim()
  if (!t) throw new Error('Message is required')
  const wire = await request<Record<string, unknown>>(`/threads/${threadId}/messages`, {
    method: 'POST',
    body: { text: t },
  })
  return toMessage(wire)
}
