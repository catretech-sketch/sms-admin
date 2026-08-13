/* Advanced period attendance list — CRM read API (fail closed, no browser SoT). */
import { request } from './client'
import { snakeToCamel } from './mapper'

export type PeriodAttendanceAdvancedFilters = {
  preset?: string
  from?: string
  to?: string
  classId?: string
  grade?: string
  section?: string
  subject?: string
  period?: number
  assignedTeacherId?: string
  markedBy?: string
  markedByRole?: string
  status?: string
  q?: string
  page?: number
  pageSize?: number
}

export type PeriodAttendanceAdvancedRow = {
  id: string
  classId: string
  grade: string
  section: string
  classLabel: string
  studentId: string
  studentName: string
  admissionNo: string
  date: string
  period: number
  periodId?: string | null
  subject: string
  subjectId?: string | null
  startTime?: string | null
  endTime?: string | null
  status: string
  assignedTeacherId?: string | null
  assignedTeacherName?: string | null
  markedBy?: string | null
  markedByName?: string | null
  markedByRole?: string | null
  markedAt?: string | null
  geoFenceStatus: string
}

export type PeriodAttendanceAdvancedPage = {
  items: PeriodAttendanceAdvancedRow[]
  totalCount: number
  page: number
  pageSize: number
}

function filterQuery(filters: PeriodAttendanceAdvancedFilters): Record<string, string | number | undefined> {
  return {
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    classId: filters.classId,
    grade: filters.grade,
    section: filters.section,
    subject: filters.subject,
    period: filters.period,
    assignedTeacherId: filters.assignedTeacherId,
    markedBy: filters.markedBy,
    markedByRole: filters.markedByRole,
    status: filters.status,
    q: filters.q,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

function toRow(raw: Record<string, unknown>): PeriodAttendanceAdvancedRow {
  const row = snakeToCamel<Record<string, unknown>>(raw)
  return {
    id: String(row.id ?? ''),
    classId: String(row.classId ?? ''),
    grade: String(row.grade ?? ''),
    section: String(row.section ?? ''),
    classLabel: String(row.classLabel ?? ''),
    studentId: String(row.studentId ?? ''),
    studentName: String(row.studentName ?? ''),
    admissionNo: String(row.admissionNo ?? ''),
    date: String(row.date ?? ''),
    period: Number(row.period) || 0,
    periodId: row.periodId != null ? String(row.periodId) : null,
    subject: String(row.subject ?? ''),
    subjectId: row.subjectId != null ? String(row.subjectId) : null,
    startTime: row.startTime != null ? String(row.startTime) : null,
    endTime: row.endTime != null ? String(row.endTime) : null,
    status: String(row.status ?? ''),
    assignedTeacherId: row.assignedTeacherId != null ? String(row.assignedTeacherId) : null,
    assignedTeacherName: row.assignedTeacherName != null ? String(row.assignedTeacherName) : null,
    markedBy: row.markedBy != null ? String(row.markedBy) : null,
    markedByName: row.markedByName != null ? String(row.markedByName) : null,
    markedByRole: row.markedByRole != null ? String(row.markedByRole) : null,
    markedAt: row.markedAt != null ? String(row.markedAt) : null,
    geoFenceStatus: String(row.geoFenceStatus ?? 'not_required'),
  }
}

/** Paginated, server-filtered period attendance rows for the Advanced CRM tab. */
export async function listPeriodAttendanceAdvanced(
  filters: PeriodAttendanceAdvancedFilters = {},
): Promise<PeriodAttendanceAdvancedPage> {
  const wire = await request<Record<string, unknown>>('/attendance/period-records', {
    query: filterQuery(filters),
  })
  const page = snakeToCamel<Record<string, unknown>>(wire)
  const itemsRaw = Array.isArray(wire.items)
    ? wire.items as Record<string, unknown>[]
    : Array.isArray(page.items)
      ? page.items as Record<string, unknown>[]
      : []
  return {
    items: itemsRaw.map(toRow),
    totalCount: Number(page.totalCount ?? wire.total_count ?? 0),
    page: Number(page.page ?? wire.page ?? filters.page ?? 1),
    pageSize: Number(page.pageSize ?? wire.page_size ?? filters.pageSize ?? 25),
  }
}
