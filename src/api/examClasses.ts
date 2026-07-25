/* Selected class/section IDs for an exam (local until API stores class_ids). */
import { tokenStore } from './auth/tokenStore'

function storageKey(examId: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_exam_classes:${tenant}:${examId}`
}

export function loadExamClassIds(examId: string): string[] {
  if (!examId) return []
  try {
    const raw = localStorage.getItem(storageKey(examId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(String).filter(Boolean)
  } catch {
    return []
  }
}

export function saveExamClassIds(examId: string, classIds: string[]): void {
  if (!examId) return
  const unique = [...new Set(classIds.filter(Boolean))]
  localStorage.setItem(storageKey(examId), JSON.stringify(unique))
}

export function clearExamClassIds(examId: string): void {
  if (!examId) return
  localStorage.removeItem(storageKey(examId))
}
