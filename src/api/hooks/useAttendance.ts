import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import {
  getAttendanceRollCall,
  listAttendance,
  saveAttendance,
  type AttendanceMark,
  type AttendanceRecord,
  type AttendanceRollCall,
} from '../attendance'
import { queryKeys } from '../queryKeys'

export function useClassAttendance(
  classId: string | null | undefined,
  date: string,
): UseQueryResult<AttendanceRecord[]> {
  return useQuery({
    queryKey: queryKeys.attendance.forClass(classId ?? '', date),
    queryFn: () => listAttendance(classId!, date),
    enabled: Boolean(classId && date),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useAttendanceRollCall(
  classId: string | null | undefined,
  date: string,
): UseQueryResult<AttendanceRollCall> {
  return useQuery({
    queryKey: queryKeys.attendance.rollCall(classId ?? '', date),
    queryFn: () => getAttendanceRollCall(classId!, date),
    enabled: Boolean(classId && date),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useSaveAttendance(): UseMutationResult<
  void,
  Error,
  { classId: string; date: string; records: AttendanceMark[] }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, date, records }) => saveAttendance(classId, { date, records }),
    onSuccess: async (_d, vars) => {
      const key = queryKeys.attendance.forClass(vars.classId, vars.date)
      const optimistic: AttendanceRecord[] = vars.records.map((r) => ({
        id: `local-${r.studentId}`,
        classId: vars.classId,
        studentId: r.studentId,
        date: vars.date,
        status: r.status,
      }))
      qc.setQueryData(key, optimistic)
      await qc.invalidateQueries({ queryKey: ['attendance'] })
      await qc.invalidateQueries({ queryKey: queryKeys.attendance.principal(vars.date) })
    },
  })
}
