import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import {
  listExamPapers, createExamPaper, updateExamPaper, deleteExamPaper,
  type ExamPaper, type CreateExamPaperInput, type UpdateExamPaperInput,
} from '../examPapers'
import { queryKeys } from '../queryKeys'

export function useExamPapers(examId: string | null): UseQueryResult<ExamPaper[]> {
  return useQuery({
    queryKey: queryKeys.exams.papers(examId ?? ''),
    queryFn: () => listExamPapers(examId!),
    enabled: !!examId,
  })
}

export function useCreateExamPaper(): UseMutationResult<ExamPaper, Error, CreateExamPaperInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => createExamPaper(input),
    onSuccess: (p) => {
      if (p.examId) qc.invalidateQueries({ queryKey: queryKeys.exams.papers(p.examId) })
    },
  })
}

export function useUpdateExamPaper(): UseMutationResult<ExamPaper, Error, { id: string; examId: string; patch: UpdateExamPaperInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateExamPaper(id, patch),
    onSuccess: (_p, { examId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.exams.papers(examId) })
    },
  })
}

export function useDeleteExamPaper(): UseMutationResult<void, Error, { id: string; examId: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => deleteExamPaper(id),
    onSuccess: (_v, { examId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.exams.papers(examId) })
    },
  })
}
