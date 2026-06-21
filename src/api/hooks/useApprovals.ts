import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listApprovals } from '../approvals'
import { queryKeys } from '../queryKeys'
import type { Approval } from '@/types'

export function useApprovals(): UseQueryResult<Approval[]> {
  return useQuery({
    queryKey: queryKeys.approvals.all,
    queryFn: () => listApprovals(),
  })
}
