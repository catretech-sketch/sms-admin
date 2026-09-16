import {
  useQuery, useInfiniteQuery, useMutation, useQueryClient,
  type UseQueryResult, type UseMutationResult,
} from '@tanstack/react-query'
import {
  listAllTasks, listAllTasksPage, listPeopleSummary, listRoleSummary, createTask,
  type StaffTask, type CreateTaskInput, type TaskListFilter,
  type PersonTaskSummary, type RoleTaskSummary,
} from '../tasks'
import { queryKeys } from '../queryKeys'

export function useTasks(filter: TaskListFilter = {}): UseQueryResult<StaffTask[]> {
  return useQuery({
    queryKey: queryKeys.tasks.list(filter),
    queryFn: () => listAllTasks(filter),
  })
}

export function useTaskPages(filter: TaskListFilter = {}, enabled = true) {
  const { cursor: _ignored, ...stable } = filter
  return useInfiniteQuery({
    queryKey: queryKeys.tasks.pages(stable),
    queryFn: ({ pageParam }) => listAllTasksPage({ ...stable, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
}

export function usePeopleSummary(): UseQueryResult<PersonTaskSummary[]> {
  return useQuery({
    queryKey: queryKeys.tasks.people(),
    queryFn: listPeopleSummary,
  })
}

export function useRoleSummary(): UseQueryResult<RoleTaskSummary[]> {
  return useQuery({
    queryKey: queryKeys.tasks.roles(),
    queryFn: listRoleSummary,
  })
}

export function useCreateTask(): UseMutationResult<StaffTask, Error, CreateTaskInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.tasks.all }) },
  })
}
