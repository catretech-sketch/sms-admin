import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

/** UI-facing homework assignment row (mapped from AssignmentResponse). */
export interface HomeworkAssignment {
  id: string
  title: string
  classId?: string
  className?: string
  subject?: string
  dueDate?: string
  status: string
  submissionsCount: number
  totalStudents: number
  description?: string
  source: 'teacher_app' | 'admin'
}

export interface CreateHomeworkInput {
  title: string
  classId: string
  className?: string
  subject?: string
  dueDate: string
  description?: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  closed: 'Closed',
}

export function homeworkStatusLabel(raw: string): string {
  const key = raw.trim().toLowerCase()
  return STATUS_LABEL[key] ?? raw
}

function formatDueDate(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined
  const d = new Date(String(raw))
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toISOString().slice(0, 10)
}

function toAssignment(raw: Record<string, unknown>, source: HomeworkAssignment['source'] = 'teacher_app'): HomeworkAssignment {
  const a = snakeToCamel<Record<string, unknown>>(raw)
  const status = String(a.status ?? 'active')
  return {
    id: String(a.id ?? ''),
    title: String(a.title ?? ''),
    classId: a.classId != null ? String(a.classId) : undefined,
    className: typeof a.className === 'string' ? a.className : undefined,
    subject: typeof a.subject === 'string' ? a.subject : undefined,
    dueDate: formatDueDate(a.dueDate),
    status,
    submissionsCount: typeof a.submissionsCount === 'number' ? a.submissionsCount : 0,
    totalStudents: typeof a.totalStudents === 'number' ? a.totalStudents : 0,
    description: typeof a.description === 'string' ? a.description : undefined,
    source,
  }
}

export async function listAssignments(): Promise<HomeworkAssignment[]> {
  const rows = await request<Record<string, unknown>[]>('/assignments')
  return rows.map((row) => toAssignment(row))
}

async function listClassStudentIds(classId: string): Promise<string[]> {
  const ids: string[] = []
  let cursor: string | undefined
  do {
    const env = await listRequest<ListEnvelope>(`/classes/${classId}/students`, {
      query: { limit: 200, cursor },
    })
    for (const row of env.data) {
      const c = snakeToCamel<Record<string, unknown>>(row)
      if (c.id) ids.push(String(c.id))
    }
    cursor = env.next_cursor ?? undefined
  } while (cursor)
  return ids
}

async function fanOutStudentHomework(assignment: HomeworkAssignment, input: CreateHomeworkInput): Promise<void> {
  const studentIds = await listClassStudentIds(input.classId)
  await Promise.all(studentIds.map((studentId) =>
    request('/homework', {
      method: 'POST',
      body: camelToSnake({
        studentId,
        assignmentId: assignment.id,
        title: input.title,
        subjectId: null,
        dueDate: input.dueDate,
        dueTime: null,
        priority: null,
      }),
    }),
  ))
}

/**
 * POST /assignments then fan-out POST /homework per student (same as teacher app).
 */
export async function createHomeworkAssignment(input: CreateHomeworkInput): Promise<HomeworkAssignment> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')
  if (!input.classId) throw new Error('Class is required')
  if (!input.dueDate) throw new Error('Due date is required')

  const payload = camelToSnake({
    title,
    classId: input.classId,
    className: input.className?.trim() || null,
    subject: input.subject?.trim() || null,
    dueDate: input.dueDate,
    description: input.description?.trim() || null,
    imageUri: null,
  })
  const wire = await request<Record<string, unknown>>('/assignments', { method: 'POST', body: payload })
  const assignment = toAssignment(wire, 'admin')
  await fanOutStudentHomework(assignment, { ...input, title })
  return assignment
}
