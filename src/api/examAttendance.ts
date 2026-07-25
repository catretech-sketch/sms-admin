/* Exam-day attendance per paper — API when available, tenant-local fallback. */
import { request } from './client'
import { ApiError } from './ApiError'
import { tokenStore } from './auth/tokenStore'
import { camelToSnake, snakeToCamel } from './mapper'

export type ExamAttStatus = 'present' | 'absent'

function storageKey(examId: string, paperId: string, subject: string, date: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  const paper = paperId || `${subject}:${date}`
  return `sms_exam_attendance:${tenant}:${examId}:${paper}`
}

function asStatus(v: unknown): ExamAttStatus {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'absent' ? 'absent' : 'present'
}

export function loadExamAttendanceLocal(
  examId: string,
  paperId: string,
  subject: string,
  date: string,
): Record<string, ExamAttStatus> {
  try {
    const raw = localStorage.getItem(storageKey(examId, paperId, subject, date))
    if (!raw) {
      /* Legacy key without paperId */
      const legacy = localStorage.getItem(
        `sms_exam_attendance:${tokenStore.getTenantId() || 'default'}:${examId}:${subject}:${date}`,
      )
      if (!legacy) return {}
      return parseMap(legacy)
    }
    return parseMap(raw)
  } catch {
    return {}
  }
}

function parseMap(raw: string): Record<string, ExamAttStatus> {
  const parsed = JSON.parse(raw) as Record<string, string>
  const out: Record<string, ExamAttStatus> = {}
  for (const [id, st] of Object.entries(parsed)) {
    if (st === 'present' || st === 'absent') out[id] = st
  }
  return out
}

export const EXAM_ATTENDANCE_CHANGED = 'sms:exam-attendance-changed'

export function saveExamAttendanceLocal(
  examId: string,
  paperId: string,
  subject: string,
  date: string,
  marks: Record<string, ExamAttStatus>,
): void {
  localStorage.setItem(storageKey(examId, paperId, subject, date), JSON.stringify(marks))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EXAM_ATTENDANCE_CHANGED, {
      detail: { examId, paperId, subject, date },
    }))
  }
}

/** Load attendance for a paper — API first, then local. */
export async function listExamPaperAttendance(paperId: string): Promise<Record<string, ExamAttStatus>> {
  if (!paperId) return {}
  try {
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
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return {}
    throw err
  }
}

/** Save attendance — try API, always mirror to local for CRM / offline. */
export async function saveExamPaperAttendance(
  paperId: string,
  examId: string,
  subject: string,
  date: string,
  marks: Record<string, ExamAttStatus>,
): Promise<'api' | 'local'> {
  saveExamAttendanceLocal(examId, paperId, subject, date, marks)
  if (!paperId) return 'local'
  const records = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }))
  if (!records.length) return 'local'
  try {
    await request<unknown>(`/exam-papers/${paperId}/attendance`, {
      method: 'PUT',
      body: camelToSnake({ records }),
    })
    return 'api'
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return 'local'
    /* Keep local copy; rethrow only for unexpected errors if desired — prefer soft local. */
    if (err instanceof ApiError && err.status >= 500) return 'local'
    return 'local'
  }
}

/** @deprecated use loadExamAttendanceLocal / listExamPaperAttendance */
export function loadExamAttendance(
  examId: string,
  subject: string,
  date: string,
): Record<string, ExamAttStatus> {
  return loadExamAttendanceLocal(examId, '', subject, date)
}

/** @deprecated use saveExamAttendanceLocal / saveExamPaperAttendance */
export function saveExamAttendance(
  examId: string,
  subject: string,
  date: string,
  marks: Record<string, ExamAttStatus>,
): void {
  saveExamAttendanceLocal(examId, '', subject, date, marks)
}
