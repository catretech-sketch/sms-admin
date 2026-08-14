/* Exam class scope — API class_ids on the exam only (no localStorage SoT). */
import { updateExam } from './exams'

/** @deprecated Prefer exam.classIds from the API. Always returns []. */
export function loadExamClassIds(_examId: string): string[] {
  return []
}

/** Persist class ids via exam PATCH. */
export async function saveExamClassIds(examId: string, classIds: string[]): Promise<string[]> {
  if (!examId) return []
  const unique = [...new Set(classIds.filter(Boolean))]
  await updateExam(examId, { classIds: unique })
  return unique
}

export function clearExamClassIds(_examId: string): void {
  /* no local cache */
}

/** Prefer API class ids; never hydrate from browser storage. */
export async function migrateExamClassIdsIfNeeded(
  examId: string,
  apiClassIds?: string[],
): Promise<string[]> {
  if (apiClassIds?.length) return apiClassIds
  if (!examId) return []
  return []
}
