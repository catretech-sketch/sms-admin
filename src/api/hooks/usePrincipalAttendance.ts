import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getPrincipalAttendance, type PrincipalAttendance } from '../principalAttendance'
import { queryKeys } from '../queryKeys'

export function usePrincipalAttendance(date: string, enabled = true): UseQueryResult<PrincipalAttendance> {
  return useQuery({
    queryKey: queryKeys.attendance.principal(date),
    queryFn: () => getPrincipalAttendance(date),
    enabled: enabled && Boolean(date),
  })
}
