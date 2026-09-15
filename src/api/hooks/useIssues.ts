import {
  useQuery, useMutation, useQueryClient,
  type UseQueryResult, type UseMutationResult,
} from '@tanstack/react-query'
import {
  listIssues, getIssue, updateIssue,
  type Issue, type IssueStatus, type UpdateIssueInput,
} from '../issues'
import { queryKeys } from '../queryKeys'

export function useIssues(status?: IssueStatus | 'all'): UseQueryResult<Issue[]> {
  return useQuery({
    queryKey: queryKeys.issues.list(status),
    queryFn: () => listIssues(status && status !== 'all' ? status : undefined),
  })
}

export function useIssue(id: string | null): UseQueryResult<Issue | null> {
  return useQuery({
    queryKey: queryKeys.issues.detail(id ?? ''),
    queryFn: () => (id ? getIssue(id) : Promise.resolve(null)),
    enabled: !!id,
  })
}

export function useUpdateIssue(): UseMutationResult<Issue, Error, { id: string; input: UpdateIssueInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIssueInput }) => updateIssue(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.issues.all }) },
  })
}
