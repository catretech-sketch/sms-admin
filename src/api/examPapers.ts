import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

export interface ExamPaper {
  id: string
  examId: string | null
  classId: string | null
  name: string | null
  subject: string
  subjectId: string | null
  date: string
  start: string
  duration: number
  maxMarks: number
  room: string
  inv1: string
  inv2: string
  status: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

function isoDate(v: unknown): string {
  if (typeof v !== 'string' || !v) return ''
  return v.slice(0, 10)
}

function timeHm(v: unknown): string {
  if (typeof v !== 'string' || !v) return '09:30'
  const m = /^(\d{1,2}):(\d{2})/.exec(v)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : v
}

export function toExamPaper(wire: Record<string, unknown>): ExamPaper {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  return {
    id: String(c.id ?? ''),
    examId: c.examId ? String(c.examId) : null,
    classId: c.classId ? String(c.classId) : null,
    name: typeof c.name === 'string' ? c.name : null,
    subject: String(c.subject ?? c.name ?? ''),
    subjectId: c.subjectId ? String(c.subjectId) : null,
    date: isoDate(c.date),
    start: timeHm(c.startTime),
    duration: Number(c.durationMin ?? 180) || 180,
    maxMarks: Number(c.maxMarks ?? 100) || 100,
    room: String(c.room ?? ''),
    inv1: String(c.invigilator1 ?? ''),
    inv2: String(c.invigilator2 ?? ''),
    status: String(c.status ?? 'scheduled'),
  }
}

export interface CreateExamPaperInput {
  examId: string
  classId?: string | null
  name?: string | null
  subject: string
  date?: string
  start?: string
  duration?: number
  maxMarks?: number
  room?: string
  inv1?: string
  inv2?: string
}

export interface UpdateExamPaperInput {
  classId?: string | null
  name?: string | null
  subject?: string
  date?: string
  start?: string
  duration?: number
  maxMarks?: number
  room?: string
  inv1?: string
  inv2?: string
  status?: string
}

function paperBody(input: CreateExamPaperInput | UpdateExamPaperInput, examId?: string): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  if (examId) raw.examId = examId
  if ('classId' in input && input.classId) raw.classId = input.classId
  if (input.name !== undefined) raw.name = input.name
  if (input.subject !== undefined) raw.subject = input.subject
  if (input.date !== undefined) raw.date = input.date
  if (input.start !== undefined) raw.startTime = input.start
  if (input.duration !== undefined) raw.durationMin = input.duration
  if (input.maxMarks !== undefined) raw.maxMarks = input.maxMarks
  if (input.room !== undefined) raw.room = input.room
  if (input.inv1 !== undefined) raw.invigilator1 = input.inv1
  if (input.inv2 !== undefined) raw.invigilator2 = input.inv2
  if ('status' in input && input.status !== undefined) raw.status = input.status
  return camelToSnake(raw) as Record<string, unknown>
}

export async function listExamPapers(examId?: string): Promise<ExamPaper[]> {
  const env = await listRequest<ListEnvelope>('/exam-papers', {
    query: examId ? { exam_id: examId } : undefined,
  })
  return env.data.map(toExamPaper)
}

export async function createExamPaper(input: CreateExamPaperInput): Promise<ExamPaper> {
  const wire = await request<Record<string, unknown>>('/exam-papers', {
    method: 'POST',
    body: paperBody(input, input.examId),
  })
  return toExamPaper(wire)
}

export async function updateExamPaper(id: string, input: UpdateExamPaperInput): Promise<ExamPaper> {
  const wire = await request<Record<string, unknown>>(`/exam-papers/${id}`, {
    method: 'PATCH',
    body: paperBody(input),
  })
  return toExamPaper(wire)
}

export async function deleteExamPaper(id: string): Promise<void> {
  await request(`/exam-papers/${id}`, { method: 'DELETE' })
}

/** UI datesheet row — maps to/from API exam papers. */
export function paperToSlot(p: ExamPaper): import('@/types').PaperSlot {
  return {
    id: p.id,
    classId: p.classId,
    subject: p.subject,
    date: p.date,
    start: p.start,
    duration: p.duration,
    room: p.room,
    inv1: p.inv1,
    inv2: p.inv2,
  }
}

export function slotToCreateInput(examId: string, s: import('@/types').PaperSlot): CreateExamPaperInput {
  return {
    examId,
    classId: s.classId ?? null,
    name: s.subject,
    subject: s.subject,
    date: s.date,
    start: s.start,
    duration: s.duration,
    room: s.room,
    inv1: s.inv1,
    inv2: s.inv2,
    maxMarks: 100,
  }
}

export function slotToUpdateInput(s: import('@/types').PaperSlot): UpdateExamPaperInput {
  return {
    classId: s.classId ?? null,
    name: s.subject,
    subject: s.subject,
    date: s.date,
    start: s.start,
    duration: s.duration,
    room: s.room,
    inv1: s.inv1,
    inv2: s.inv2,
  }
}
