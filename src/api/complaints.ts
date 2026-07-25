import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { Complaint, ComplaintStatus } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export interface CreateComplaintInput {
  subject: string
  from?: string | null
  category?: string | null
  priority?: Complaint['priority'] | null
  body?: string | null
}

export interface UpdateComplaintInput {
  status?: ComplaintStatus
  assignee?: string
}

export function toComplaint(wire: Record<string, unknown>): Complaint {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { category, ...rest } = c
  return {
    priority: 'medium',
    status: 'open',
    from: '',
    assignee: '',
    age: '',
    body: '',
    ...rest,
    cat: (category ?? (rest as { cat?: unknown }).cat ?? '') as string,
  } as unknown as Complaint
}

export async function listComplaints(status?: string): Promise<Complaint[]> {
  const env = await listRequest<ListEnvelope>('/complaints', {
    query: status ? { status } : undefined,
  })
  return env.data.map(toComplaint)
}

export async function createComplaint(input: CreateComplaintInput): Promise<Complaint> {
  const subject = input.subject.trim()
  if (!subject) throw new Error('Subject is required')
  const payload = camelToSnake({
    subject,
    from: input.from?.trim() || null,
    category: input.category?.trim() || null,
    priority: input.priority ?? 'medium',
    body: input.body?.trim() || null,
  })
  const wire = await request<Record<string, unknown>>('/complaints', { method: 'POST', body: payload })
  return toComplaint(wire)
}

export async function updateComplaint(id: string, input: UpdateComplaintInput): Promise<Complaint> {
  const payload = camelToSnake({
    status: input.status ?? null,
    assignee: input.assignee ?? null,
  })
  const wire = await request<Record<string, unknown>>(`/complaints/${id}`, { method: 'PATCH', body: payload })
  return toComplaint(wire)
}
