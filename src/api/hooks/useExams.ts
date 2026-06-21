import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listExams, createExam, updateExam } from '../exams'
import { queryKeys } from '../queryKeys'
import type { Exam } from '@/types'

export function useExams(): UseQueryResult<Exam[]> {
  return useQuery({ queryKey: queryKeys.exams.all, queryFn: () => listExams() })
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
