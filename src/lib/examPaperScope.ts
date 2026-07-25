import { getClassSubjects } from '@/api/classSubjects'
import { loadExamClassIds } from '@/api/examClasses'
import { parseExamGrades } from '@/lib/defaultClasses'

export type PaperScopeInput = {
  classId?: string | null
  className?: string | null
  subject: string
}

export type ExamScope = {
  grades?: string | null
  classIds?: string[] | null
  examId?: string | null
}

function gradeFromLabel(label: string): string {
  return label.split('-')[0]?.trim() || ''
}

/** True when the paper subject is not in the class's Academics map (old catalog dump). */
export function isDummyExamPaper(paper: PaperScopeInput): boolean {
  const mapped = getClassSubjects(paper.classId, paper.className ?? '')
  if (!mapped.length) return true
  return !mapped.includes(paper.subject)
}

/** Resolve which class IDs belong to this exam (explicit list, else none). */
export function resolveExamClassIds(exam: ExamScope): Set<string> {
  const fromExam = exam.classIds?.filter(Boolean) ?? []
  if (fromExam.length) return new Set(fromExam)
  if (exam.examId) {
    const local = loadExamClassIds(exam.examId)
    if (local.length) return new Set(local)
  }
  return new Set()
}

export function resolveExamGradeSet(exam: ExamScope): Set<string> {
  return new Set(parseExamGrades(exam.grades))
}

/**
 * Paper is in scope when:
 * - exam has classIds → class must be in that set
 * - else → class grade must be in exam grades
 */
export function isPaperInExamScope(
  paper: PaperScopeInput,
  exam: ExamScope,
  classGradeById?: Map<string, string>,
): boolean {
  const classIds = resolveExamClassIds(exam)
  if (classIds.size) {
    return !!paper.classId && classIds.has(paper.classId)
  }
  const grades = resolveExamGradeSet(exam)
  if (!grades.size) return true
  let grade = ''
  if (paper.classId && classGradeById?.has(paper.classId)) {
    grade = classGradeById.get(paper.classId) ?? ''
  }
  if (!grade) grade = gradeFromLabel(paper.className ?? '')
  return !!grade && grades.has(grade)
}

/** Dummy or outside exam grades/sections — ignored on datesheet & paper count. */
export function isOrphanExamPaper(
  paper: PaperScopeInput,
  exam: ExamScope,
  classGradeById?: Map<string, string>,
): boolean {
  return isDummyExamPaper(paper) || !isPaperInExamScope(paper, exam, classGradeById)
}

export function countRealExamPapers(
  papers: PaperScopeInput[],
  exam: ExamScope,
  classGradeById?: Map<string, string>,
): number {
  return papers.filter((p) => !isOrphanExamPaper(p, exam, classGradeById)).length
}
