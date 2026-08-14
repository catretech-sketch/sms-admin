/* Exam-day attendance per paper — API is source of truth; in-memory cache only after successful PUT. */
import { request } from './client'
import { ApiError } from './ApiError'
import { tokenStore } from './auth/tokenStore'
import { camelToSnake, snakeToCamel } from './mapper'

export type ExamAttStatus = 'present' | 'absent'

const memory = new Map<string, Record<string, ExamAttStatus>>()

function cacheKey(examId: string, paperId: string, subject: string, date: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  const paper = paperId || `${subject}:${date}`
  return `${tenant}:${examId}:${paper}`
}

function asStatus(v: unknown): ExamAttStatus {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'absent' ? 'absent' : 'present'
}

/** Test helper — drop in-memory exam-attendance cache. */
export function clearExamAttendanceMemory(): void {
  memory.clear()
}

/** Read marks from the in-memory session cache (empty if never fetched/saved this session). */
export function loadExamAttendanceLocal(
  examId: string,
  paperId: string,
  subject: string,
  date: string,
): Record<string, ExamAttStatus> {
  return memory.get(cacheKey(examId, paperId, subject, date)) ?? {}
}

export const EXAM_ATTENDANCE_CHANGED = 'sms:exam-attendance-changed'

/** Update the in-memory read cache only after a successful API write/read. */
export function saveExamAttendanceLocal(
  examId: string,
  paperId: string,
  subject: string,
  date: string,
  marks: Record<string, ExamAttStatus>,
): void {
  memory.set(cacheKey(examId, paperId, subject, date), { ...marks })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EXAM_ATTENDANCE_CHANGED, {
      detail: { examId, paperId, subject, date },
    }))
  }
}

/**
 * Load attendance for a paper from the API. Fail-closed: throws on any error
 * (including 404/405). Empty marks only when the API returns an empty array.
 */
export async function listExamPaperAttendance(paperId: string): Promise<Record<string, ExamAttStatus>> {
  if (!paperId) return {}
  const data = await request<Record<string, unknown>[] | { data?: Record<string, unknown>[] } | null>(
    `/exam-papers/${paperId}/attendance`,
  )
  const rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : [])
  const out: Record<string, ExamAttStatus> = {}
  for (const row of rows) {
    const c = snakeToCamel<Record<string, unknown>>(row)
    const sid = String(c.studentId ?? '')
    if (sid) out[sid] = asStatus(c.status)
  }
  return out
}

/**
 * Save attendance via API first; cache in memory only after success.
 * Throws on missing paper, empty marks, or any API failure (404/405/5xx included).
 */
export async function saveExamPaperAttendance(
  paperId: string,
  examId: string,
  subject: string,
  date: string,
  marks: Record<string, ExamAttStatus>,
): Promise<void> {
  if (!paperId) throw new ApiError(400, 'bad_request', 'Missing exam paper id')
  const records = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }))
  if (!records.length) throw new Error('No students to save')
  await request<unknown>(`/exam-papers/${paperId}/attendance`, {
    method: 'PUT',
    body: camelToSnake({ records }),
  })
  saveExamAttendanceLocal(examId, paperId, subject, date, marks)
}

/** @deprecated use loadExamAttendanceLocal / listExamPaperAttendance */
export function loadExamAttendance(
  examId: string,
  subject: string,
  date: string,
): Record<string, ExamAttStatus> {
  return loadExamAttendanceLocal(examId, '', subject, date)
}

/** @deprecated Removed — local-only writes are not allowed. Use {@link saveExamPaperAttendance}. */
export function saveExamAttendance(
  _examId: string,
  _subject: string,
  _date: string,
  _marks: Record<string, ExamAttStatus>,
): never {
  throw new Error('saveExamAttendance requires the API; use saveExamPaperAttendance')
}
