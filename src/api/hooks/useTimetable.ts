import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listTimetable, type TimetableSlot } from '../timetable'
import { queryKeys } from '../queryKeys'

/** Whole-school published timetable (all classes/days/periods) — filter client-side by classId. */
export function useTimetable(enabled = true): UseQueryResult<TimetableSlot[]> {
  return useQuery({
    queryKey: queryKeys.timetable.all(),
    queryFn: () => listTimetable(),
    enabled,
    staleTime: 60_000,
  })
}
