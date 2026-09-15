import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

export type IssueCategory = 'vehicle' | 'student' | 'route' | 'safety' | 'other'
export type IssuePriority = 'normal' | 'high' | 'emergency'
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface IssueNote {
  id: string
  authorUserId: string
  authorName?: string
  note: string
  createdAt: string
}

export interface Issue {
  id: string
  tenantId: string
  reporterUserId: string
  reporterName?: string
  category: IssueCategory
  title: string
  description: string
  priority: IssuePriority
  status: IssueStatus
  vehicleId?: string
  routeId?: string
  tripId?: string
  photoBase64?: string
  notes?: IssueNote[]
  createdAt: string
  updatedAt: string
}

export interface UpdateIssueInput {
  status?: IssueStatus
  note?: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

const ISSUE_CATEGORIES: IssueCategory[] = ['vehicle', 'student', 'route', 'safety', 'other']
const ISSUE_PRIORITIES: IssuePriority[] = ['normal', 'high', 'emergency']
const ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed']

function toIssueCategory(v: unknown): IssueCategory {
  return (ISSUE_CATEGORIES as string[]).includes(v as string) ? (v as IssueCategory) : 'other'
}
function toIssuePriority(v: unknown): IssuePriority {
  return (ISSUE_PRIORITIES as string[]).includes(v as string) ? (v as IssuePriority) : 'normal'
}
function toIssueStatus(v: unknown): IssueStatus {
  return (ISSUE_STATUSES as string[]).includes(v as string) ? (v as IssueStatus) : 'open'
}

export function toIssueNote(wire: Record<string, unknown>): IssueNote {
  const n = snakeToCamel<Record<string, unknown>>(wire)
  return {
    id: String(n.id ?? ''),
    authorUserId: String(n.authorUserId ?? ''),
    authorName: typeof n.authorName === 'string' ? n.authorName : undefined,
    note: String(n.note ?? ''),
    createdAt: String(n.createdAt ?? ''),
  }
}

export function toIssue(wire: Record<string, unknown>): Issue {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const notesWire = Array.isArray(c.notes) ? (c.notes as Record<string, unknown>[]) : undefined
  return {
    id: String(c.id ?? ''),
    tenantId: String(c.tenantId ?? ''),
    reporterUserId: String(c.reporterUserId ?? ''),
    reporterName: typeof c.reporterName === 'string' ? c.reporterName : undefined,
    category: toIssueCategory(c.category),
    title: String(c.title ?? ''),
    description: String(c.description ?? ''),
    priority: toIssuePriority(c.priority),
    status: toIssueStatus(c.status),
    vehicleId: typeof c.vehicleId === 'string' ? c.vehicleId : undefined,
    routeId: typeof c.routeId === 'string' ? c.routeId : undefined,
    tripId: typeof c.tripId === 'string' ? c.tripId : undefined,
    photoBase64: typeof c.photoBase64 === 'string' ? c.photoBase64 : undefined,
    notes: notesWire?.map(toIssueNote),
    createdAt: String(c.createdAt ?? ''),
    updatedAt: String(c.updatedAt ?? ''),
  }
}

export async function listIssues(status?: IssueStatus): Promise<Issue[]> {
  const env = await listRequest<ListEnvelope>('/staff/issues', {
    query: status ? { status } : undefined,
  })
  return env.data.map(toIssue)
}

export async function getIssue(id: string): Promise<Issue> {
  const wire = await request<Record<string, unknown>>(`/staff/issues/${id}`)
  return toIssue(wire)
}

export async function updateIssue(id: string, input: UpdateIssueInput): Promise<Issue> {
  if (input.status === undefined && input.note === undefined) {
    throw new Error('Provide a status or a note to update')
  }
  const payload = camelToSnake({
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  })
  const wire = await request<Record<string, unknown>>(`/issues/${id}`, { method: 'PATCH', body: payload })
  return toIssue(wire)
}
