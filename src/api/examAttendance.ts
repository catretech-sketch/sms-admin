/* Exam-day attendance per student + paper (local until a dedicated API exists). */
import { tokenStore } from './auth/tokenStore'

export type ExamAttStatus = 'present' | 'absent'

function storageKey(examId: string, subject: string, date: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_exam_attendance:${tenant}:${examId}:${subject}:${date}`
}

export function loadExamAttendance(
  examId: string,
  subject: string,
  date: string,
): Record<string, ExamAttStatus> {
  try {
    const raw = localStorage.getItem(storageKey(examId, subject, date))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    const out: Record<string, ExamAttStatus> = {}
    for (const [id, st] of Object.entries(parsed)) {
      if (st === 'present' || st === 'absent') out[id] = st
    }
    return out
  } catch {
    return {}
  }
}

export const EXAM_ATTENDANCE_CHANGED = 'sms:exam-attendance-changed'

export function saveExamAttendance(
  examId: string,
  subject: string,
  date: string,
  marks: Record<string, ExamAttStatus>,
): void {
  localStorage.setItem(storageKey(examId, subject, date), JSON.stringify(marks))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EXAM_ATTENDANCE_CHANGED, { detail: { examId, subject, date } }))
  }
}
