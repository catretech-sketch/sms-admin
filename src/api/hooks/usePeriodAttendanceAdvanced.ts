import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  listPeriodAttendanceAdvanced,
  type PeriodAttendanceAdvancedFilters,
  type PeriodAttendanceAdvancedPage,
} from '../periodAttendanceAdvanced'
import { queryKeys } from '../queryKeys'

/** Server-filtered period attendance list for the Advanced CRM tab. */
export function usePeriodAttendanceAdvanced(
  filters: PeriodAttendanceAdvancedFilters = {},
  enabled = true,
): UseQueryResult<PeriodAttendanceAdvancedPage> {
  return useQuery({
    queryKey: queryKeys.attendance.advanced(filters),
    queryFn: () => listPeriodAttendanceAdvanced(filters),
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}
