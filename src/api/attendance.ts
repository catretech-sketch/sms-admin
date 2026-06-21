import { request } from './client'

export interface AttendanceMark { studentId: string; status: 'present' | 'late' | 'absent' }

export async function saveAttendance(classId: string, period: number, marks: AttendanceMark[]): Promise<void> {
  await request<unknown>(`/classes/${classId}/attendance`, {
    method: 'POST',
    body: { period, marks: marks.map((m) => ({ student_id: m.studentId, status: m.status })) },
  })
}
