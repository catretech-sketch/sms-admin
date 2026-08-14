import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import {
  getAttendanceRollCall,
  listAttendance,
  listClassDayTimetable,
  listPeriodAttendance,
  saveAttendance,
  savePeriodAttendance,
  type AttendanceMark,
  type AttendanceRecord,
  type AttendanceRollCall,
  type ClassDayTimetableSlot,
  type PeriodAttendanceRecord,
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

export function useClassDayTimetable(
  classId: string | null | undefined,
  date: string,
): UseQueryResult<ClassDayTimetableSlot[]> {
  return useQuery({
    queryKey: queryKeys.attendance.dayTimetable(classId ?? '', date),
    queryFn: () => listClassDayTimetable(classId!, date),
    enabled: Boolean(classId && date),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function usePeriodAttendance(
  classId: string | null | undefined,
  date: string,
  period: number | null | undefined,
  subject: string | null | undefined,
): UseQueryResult<PeriodAttendanceRecord[]> {
  const subj = (subject ?? '').trim()
  return useQuery({
    queryKey: queryKeys.attendance.period(classId ?? '', date, period ?? 0, subj),
    queryFn: () => listPeriodAttendance(classId!, { date, period: period!, subject: subj }),
    enabled: Boolean(classId && date && period && period > 0 && subj),
    staleTime: 15_000,
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

export function useSavePeriodAttendance(): UseMutationResult<
  void,
  Error,
  {
    classId: string
    date: string
    period: number
    subject: string
    subjectId?: string | null
    periodId?: string | null
    records: AttendanceMark[]
  }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, ...args }) => savePeriodAttendance(classId, args),
    onSuccess: async (_d, vars) => {
      await qc.invalidateQueries({
        queryKey: queryKeys.attendance.period(vars.classId, vars.date, vars.period, vars.subject),
      })
      await qc.invalidateQueries({
        queryKey: queryKeys.attendance.dayTimetable(vars.classId, vars.date),
      })
      await qc.invalidateQueries({ queryKey: ['attendance'] })
    },
  })
}
