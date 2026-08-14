import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

export interface GradeRow {
  id: string
  studentId: string
  studentName: string
  examPaperId: string
  marks: number
  maxMarks: number
  grade: string
  gpa: number
  pass: boolean
  date: string
  /** Present on GET /grades?student_id= (joined from exam paper). */
  subject?: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export function toGrade(wire: Record<string, unknown>): GradeRow {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const subject = typeof c.subject === 'string' && c.subject ? c.subject : undefined
  return {
    id: String(c.id ?? ''),
    studentId: String(c.studentId ?? ''),
    studentName: String(c.studentName ?? ''),
    examPaperId: String(c.examPaperId ?? ''),
    marks: Number(c.marks ?? 0),
    maxMarks: Number(c.maxMarks ?? 100),
    grade: String(c.grade ?? ''),
    gpa: Number(c.gpa ?? 0),
    pass: Boolean(c.pass),
    date: typeof c.date === 'string' ? c.date.slice(0, 10) : '',
    ...(subject ? { subject } : {}),
  }
}

export async function listGrades(examPaperId: string): Promise<GradeRow[]> {
  const env = await listRequest<ListEnvelope>(`/exam-papers/${examPaperId}/grades`)
  return env.data.map(toGrade)
}

/** One round-trip: all marks for a single student (avoids N× /exam-papers/{id}/grades). */
export async function listGradesForStudent(studentId: string): Promise<GradeRow[]> {
  const rows = await request<Record<string, unknown>[]>('/grades', {
    query: { student_id: studentId },
  })
  return (rows ?? []).map(toGrade)
}

export interface UpsertGradeInput {
  studentId: string
  studentName: string
  examPaperId: string
  marks: number
}

export async function upsertGrade(input: UpsertGradeInput): Promise<GradeRow> {
  const wire = await request<Record<string, unknown>>('/grades', {
    method: 'PUT',
    body: camelToSnake(input),
  })
  return toGrade(wire)
}
