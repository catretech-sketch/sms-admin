import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listExams, createExam, updateExam, listExamLetterGrades } from '../exams'
import { queryKeys } from '../queryKeys'
import { pickLatestExam, resultBandCountsFromHistogram } from '@/lib/dashboardLive'
import type { Exam } from '@/types'

export function useExams(): UseQueryResult<Exam[]> {
  return useQuery({ queryKey: queryKeys.exams.all, queryFn: () => listExams() })
}

/** Latest exam letter-grade bands for the school dashboard. Empty when no marks are saved. */
export function useDashboardExamBands(enabled = true): UseQueryResult<{ examName: string; bands: ReturnType<typeof resultBandCountsFromHistogram> }> {
  return useQuery({
    queryKey: queryKeys.exams.dashboardBands('latest'),
    queryFn: async () => {
      const exams = await listExams()
      const latest = pickLatestExam(exams)
      if (!latest) return { examName: '', bands: [] }
      const rows = await listExamLetterGrades(latest.id)
      return { examName: latest.name, bands: resultBandCountsFromHistogram(rows) }
    },
    enabled,
    staleTime: 30_000,
  })
}

export function useCreateExam(): UseMutationResult<Exam, Error, Exam> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (e: Exam) => createExam(e),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.exams.all }) },
  })
}

export function useUpdateExam(): UseMutationResult<Exam, Error, { id: string; patch: Partial<Exam> }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Exam> }) => updateExam(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.exams.all }) },
  })
}
