/* ============================================================
   SchoolMate — Exam lifecycle pure helpers (keys + progress).
   ============================================================ */
export const markKey = (examId: string, studentId: string, subject: string): string =>
  `${examId}|${studentId}|${subject}`

export const attKey = (examId: string, studentId: string, subject: string): string =>
  `${examId}|${studentId}|${subject}`

/** Percentage of an exam's papers that have at least one saved mark. */
export function marksProgress(
  examMarks: Record<string, number>,
  examId: string,
  paperCount: number,
): number {
  const subs = new Set<string>()
  const prefix = examId + '|'
  for (const k of Object.keys(examMarks)) {
    if (k.startsWith(prefix)) subs.add(k.split('|')[2])
  }
  return Math.min(100, Math.round((100 * subs.size) / Math.max(1, paperCount)))
}
