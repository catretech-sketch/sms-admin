import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { saveAttendance, type AttendanceMark } from '../attendance'
import { queryKeys } from '../queryKeys'

export function useSaveAttendance(): UseMutationResult<void, Error, { classId: string; period: number; marks: AttendanceMark[] }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, period, marks }: { classId: string; period: number; marks: AttendanceMark[] }) => saveAttendance(classId, period, marks),
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: queryKeys.attendance.forClass(vars.classId) }) },
  })
}
