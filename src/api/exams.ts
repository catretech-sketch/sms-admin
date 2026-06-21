import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { Exam } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export function toExam(wire: Record<string, unknown>): Exam {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { marksEnteredPct, ...rest } = c
  return { ...rest, marksEntered: marksEnteredPct } as unknown as Exam
}

/** Map a full or partial Exam to a snake_case body (handles `marksEntered` rename only if present). */
export function fromExam(e: Partial<Exam>): Record<string, unknown> {
  const snake = camelToSnake(e) as Record<string, unknown>
  if ('marks_entered' in snake) {
    const { marks_entered, ...rest } = snake
    return { ...rest, marks_entered_pct: marks_entered }
  }
  return snake
}

export async function listExams(): Promise<Exam[]> {
  const env = await listRequest<ListEnvelope>('/exams')
  return env.data.map(toExam)
}

export async function createExam(e: Exam): Promise<Exam> {
  const wire = await request<Record<string, unknown>>('/exams', { method: 'POST', body: fromExam(e) })
  return toExam(wire)
}

export async function updateExam(id: string, patch: Partial<Exam>): Promise<Exam> {
  const wire = await request<Record<string, unknown>>(`/exams/${id}`, { method: 'PUT', body: fromExam(patch) })
  return toExam(wire)
}
