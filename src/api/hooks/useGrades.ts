import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import {
  listGrades, listGradesForStudent, upsertGrade,
  type GradeRow, type UpsertGradeInput,
} from '../grades'
import { useExamPapers } from './useExamPapers'
import { markKey } from '@/lib/examData'
import { queryKeys } from '../queryKeys'

export function useGrades(examPaperId: string | null): UseQueryResult<GradeRow[]> {
  return useQuery({
    queryKey: queryKeys.exams.grades(examPaperId ?? ''),
    queryFn: () => listGrades(examPaperId!),
    enabled: !!examPaperId,
    staleTime: 30_000,
  })
}

/** All marks for one student — prefers GET /grades?student_id= over per-paper fan-out. */
export function useStudentGrades(studentId: string | null): UseQueryResult<GradeRow[]> {
  return useQuery({
    queryKey: queryKeys.exams.studentGrades(studentId ?? ''),
    queryFn: () => listGradesForStudent(studentId!),
    enabled: !!studentId,
    staleTime: 30_000,
  })
}

export function useUpsertGrade(): UseMutationResult<GradeRow, Error, UpsertGradeInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => upsertGrade(input),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: queryKeys.exams.grades(g.examPaperId) })
      qc.invalidateQueries({ queryKey: ['exams', 'studentGrades'] })
      // Scope to marksMaps that actually include this paper, not every exam's map.
      qc.invalidateQueries({
        predicate: (query) => {
          const k = query.queryKey
          return k[0] === 'exams' && k[1] === 'marksMap'
            && typeof k[3] === 'string' && k[3].split(',').includes(g.examPaperId)
        },
      })
    },
  })
}

export type ExamMarksMapOpts = {
  /** When set, only fetch grades for papers of this class (plus unscoped papers). */
  classId?: string | null
  enabled?: boolean
}

/** All saved marks for an exam keyed by markKey(examId, studentId, subject). */
export function useExamMarksMap(
  examId: string | null,
  opts?: ExamMarksMapOpts,
): UseQueryResult<Record<string, number>> {
  const papersQ = useExamPapers(examId)
  const classId = opts?.classId
  const papers = useMemo(() => {
    const all = papersQ.data ?? []
    if (!classId) return all
    return all.filter((p) => !p.classId || p.classId === classId)
  }, [papersQ.data, classId])
  const paperIds = papers.map((p) => p.id).join(',')
  const enabled =
    (opts?.enabled !== false)
    && !!examId
    && papers.length > 0
    && !!papersQ.data
  return useQuery({
    queryKey: ['exams', 'marksMap', examId ?? '', paperIds],
    queryFn: async () => {
      const out: Record<string, number> = {}
      if (!examId || !papers.length) return out
      const perPaper = await Promise.all(papers.map((p) => listGrades(p.id)))
      papers.forEach((p, i) => {
        for (const g of perPaper[i]) {
          out[markKey(examId, g.studentId, p.subject)] = g.marks
        }
      })
      return out
    },
    enabled,
    staleTime: 30_000,
  })
}
