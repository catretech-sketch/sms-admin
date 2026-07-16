import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { Exam } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export function toExam(wire: Record<string, unknown>): Exam {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const fromRaw = c.fromDate ?? c.from
  const toRaw = c.toDate ?? c.to
  return {
    id: String(c.id ?? ''),
    name: String(c.name ?? ''),
    type: String(c.type ?? ''),
    grades: String(c.grades ?? ''),
    from: typeof fromRaw === 'string' ? fromRaw.slice(0, 10) : '',
    to: typeof toRaw === 'string' ? toRaw.slice(0, 10) : '',
    subjects: Number(c.subjectCount ?? c.subjects ?? 0),
    status: (c.status ?? 'draft') as Exam['status'],
    marksEntered: Number(c.marksEnteredPct ?? c.marksEntered ?? 0),
    published: Boolean(c.published),
  }
}

/** Map a full or partial Exam to a snake_case body for the API. */
export function fromExam(e: Partial<Exam>): Record<string, unknown> {
  const { subjects, from, to, marksEntered, ...rest } = e
  const body = camelToSnake(rest) as Record<string, unknown>
  if (subjects !== undefined) body.subject_count = subjects
  if (from !== undefined) body.from_date = from
  if (to !== undefined) body.to_date = to
  if (marksEntered !== undefined) body.marks_entered_pct = marksEntered
  delete body.subjects
  delete body.from
  delete body.to
  delete body.marks_entered
  return body
}

export async function listExams(): Promise<Exam[]> {
  const env = await listRequest<ListEnvelope>('/exams')
  return env.data.map(toExam)
}

export async function createExam(e: Exam): Promise<Exam> {
  const body = fromExam({
    name: e.name,
    type: e.type,
    grades: e.grades,
    from: e.from,
    to: e.to,
    subjects: e.subjects,
  })
  const wire = await request<Record<string, unknown>>('/exams', { method: 'POST', body })
  return toExam(wire)
}

export async function updateExam(id: string, patch: Partial<Exam>): Promise<Exam> {
  const wire = await request<Record<string, unknown>>(`/exams/${id}`, { method: 'PATCH', body: fromExam(patch) })
  return toExam(wire)
}
