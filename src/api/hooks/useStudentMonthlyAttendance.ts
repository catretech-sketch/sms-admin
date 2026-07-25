import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listStudentAttendanceHistory } from '../studentAttendance'
import type { AttendanceRecord } from '../attendance'
import { queryKeys } from '../queryKeys'

/**
 * Loads a student's real day-level attendance history (last ~4 months).
 * The caller derives month bars + daily drill-down from these records so a
 * single fetch powers both views.
 */
export function useStudentMonthlyAttendance(
  studentId: string | null | undefined,
  classId: string | null | undefined,
  enabled = true,
): UseQueryResult<AttendanceRecord[]> {
  return useQuery({
    queryKey: queryKeys.attendance.studentMonths(studentId ?? '', classId ?? ''),
    queryFn: () => listStudentAttendanceHistory(studentId!, classId),
    enabled: Boolean(enabled && studentId),
  })
}
