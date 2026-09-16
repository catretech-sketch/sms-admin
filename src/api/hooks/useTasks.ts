import {
  useQuery, useMutation, useQueryClient,
  type UseQueryResult, type UseMutationResult,
} from '@tanstack/react-query'
import {
  listAllTasks, createTask,
  type StaffTask, type CreateTaskInput,
} from '../tasks'
import { queryKeys } from '../queryKeys'

export function useTasks(): UseQueryResult<StaffTask[]> {
  return useQuery({
    queryKey: queryKeys.tasks.list(),
    queryFn: () => listAllTasks(),
  })
}

export function useCreateTask(): UseMutationResult<StaffTask, Error, CreateTaskInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.tasks.all }) },
  })
}
