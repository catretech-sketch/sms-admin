import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listGrades, upsertGrade, type GradeRow, type UpsertGradeInput } from '../grades'
import { useExamPapers } from './useExamPapers'
import { markKey } from '@/lib/examData'
import { queryKeys } from '../queryKeys'

export function useGrades(examPaperId: string | null): UseQueryResult<GradeRow[]> {
  return useQuery({
    queryKey: queryKeys.exams.grades(examPaperId ?? ''),
    queryFn: () => listGrades(examPaperId!),
    enabled: !!examPaperId,
  })
}

export function useUpsertGrade(): UseMutationResult<GradeRow, Error, UpsertGradeInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => upsertGrade(input),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: queryKeys.exams.grades(g.examPaperId) })
    },
  })
}

/** All saved marks for an exam keyed by markKey(examId, studentId, subject). */
export function useExamMarksMap(examId: string | null): UseQueryResult<Record<string, number>> {
  const papersQ = useExamPapers(examId)
  const paperIds = (papersQ.data ?? []).map((p) => p.id).join(',')
  return useQuery({
    queryKey: ['exams', 'marksMap', examId ?? '', paperIds],
    queryFn: async () => {
      const out: Record<string, number> = {}
      if (!examId || !papersQ.data?.length) return out
      for (const p of papersQ.data) {
        const grades = await listGrades(p.id)
        for (const g of grades) {
          out[markKey(examId, g.studentId, p.subject)] = g.marks
        }
      }
      return out
    },
    enabled: !!examId && !!papersQ.data?.length,
  })
}
