import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listApprovals, type ApprovalFilter } from '../approvals'
import { queryKeys } from '../queryKeys'
import type { Approval } from '@/types'

export function useApprovals(
  opts: { status?: ApprovalFilter; enabled?: boolean } = {},
): UseQueryResult<Approval[]> {
  const { status = 'pending', enabled = true } = opts
  return useQuery({
    queryKey: queryKeys.approvals.list(status),
    queryFn: () => listApprovals(status),
    enabled,
  })
}
