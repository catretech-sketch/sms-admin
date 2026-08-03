import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getPrincipalAttendance, type PrincipalAttendance } from '../principalAttendance'
import { principalStaffToCheckInMap } from '@/lib/geoAttendanceDemo'
import type { CheckInInfo } from '../peopleAttendance'
import { queryKeys } from '../queryKeys'

export function usePrincipalAttendance(date: string, enabled = true): UseQueryResult<PrincipalAttendance> {
  return useQuery({
    queryKey: queryKeys.attendance.principal(date),
    queryFn: () => getPrincipalAttendance(date),
    enabled: enabled && Boolean(date),
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
}

/** Teacher/staff app punches for a day — not gated on geo-fence tier. */
export function useStaffCheckIns(date: string, enabled = true): {
  staff: PrincipalAttendance['staff']
  checkIn: Map<string, CheckInInfo>
  principalKnown: boolean
  loading: boolean
} {
  const principalQ = usePrincipalAttendance(date, enabled)
  const checkIn = useMemo(
    () => (principalQ.isSuccess ? principalStaffToCheckInMap(principalQ.data?.staff ?? []) : new Map()),
    [principalQ.data?.staff, principalQ.isSuccess],
  )
  return {
    staff: principalQ.data?.staff ?? [],
    checkIn,
    principalKnown: principalQ.isSuccess,
    loading: principalQ.isLoading,
  }
}
