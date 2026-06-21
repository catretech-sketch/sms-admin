import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listStaff } from '../staff'
import { queryKeys } from '../queryKeys'
import type { Staff, ListStaffOpts } from '@/types'

export function useStaff(opts: ListStaffOpts = {}): UseQueryResult<Staff[]> {
  return useQuery({
    queryKey: queryKeys.staff.list(opts),
    queryFn: () => listStaff(opts),
  })
}
