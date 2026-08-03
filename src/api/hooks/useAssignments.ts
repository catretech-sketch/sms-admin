import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import {
  listAssignments,
  createHomeworkAssignment,
  type HomeworkAssignment,
  type CreateHomeworkInput,
} from '../assignments'
import { queryKeys } from '../queryKeys'

export function useAssignments(): UseQueryResult<HomeworkAssignment[]> {
  return useQuery({ queryKey: queryKeys.assignments.all, queryFn: () => listAssignments() })
}

export function useCreateAssignment(): UseMutationResult<HomeworkAssignment, Error, CreateHomeworkInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateHomeworkInput) => createHomeworkAssignment(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.assignments.all }) },
  })
}
