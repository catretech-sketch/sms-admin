import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listStaff, getStaff } from '../staff'
import { queryKeys } from '../queryKeys'
import { useApp } from '@/lib/hooks'
import { tierIncludes } from '@/lib/gating'
import type { Staff, ListStaffOpts } from '@/types'

export function useStaff(opts: ListStaffOpts = {}): UseQueryResult<Staff[]> {
  const app = useApp()
  const allowed = tierIncludes(app.plan, 'staff_support') || tierIncludes(app.plan, 'operations')
  return useQuery({
    queryKey: queryKeys.staff.list(opts),
    queryFn: () => listStaff(opts),
    enabled: allowed && opts.enabled !== false,
  })
}

export function useStaffById(id: string | null): UseQueryResult<Staff> {
  const app = useApp()
  const allowed = tierIncludes(app.plan, 'staff_support')
  return useQuery({
    queryKey: queryKeys.staff.detail(id ?? ''),
    queryFn: () => getStaff(id as string),
    enabled: allowed && !!id,
  })
}
