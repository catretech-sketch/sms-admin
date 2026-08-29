import { request } from './client'
import { snakeToCamel } from './mapper'

export interface TimetableSlot {
  id: string
  day: string
  period: number
  subject: string | null
  classId: string | null
  className: string | null
  room: string | null
  startTime: string | null
  endTime: string | null
  teacherName: string | null
  teacherId: string | null
}

export interface CreateTimetableSlotInput {
  day: string
  period: number
  subject?: string | null
  classId?: string | null
  className?: string | null
  room?: string | null
  startTime?: string | null
  endTime?: string | null
  teacherId?: string | null
}

export async function listTimetable(): Promise<TimetableSlot[]> {
  const wire = await request<Record<string, unknown>[] | null>('/timetable')
  return Array.isArray(wire) ? wire.map((s) => snakeToCamel<TimetableSlot>(s)) : []
}

export async function createTimetableSlot(input: CreateTimetableSlotInput): Promise<TimetableSlot> {
  const wire = await request<Record<string, unknown>>('/timetable', {
    method: 'POST',
    body: {
      day: input.day,
      period: input.period,
      subject: input.subject ?? null,
      class_id: input.classId ?? null,
      class_name: input.className ?? null,
      room: input.room ?? null,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      teacher_id: input.teacherId ?? null,
    },
  })
  return snakeToCamel<TimetableSlot>(wire)
}

/** One-shot publish: clear class_ids then insert slots (avoids N× POST/DELETE). */
export async function replaceTimetableSlots(input: {
  classIds: string[]
  slots: CreateTimetableSlotInput[]
}): Promise<void> {
  await request<void>('/timetable/replace', {
    method: 'PUT',
    body: {
      class_ids: input.classIds,
      slots: input.slots.map((s) => ({
        day: s.day,
        period: s.period,
        subject: s.subject ?? null,
        class_id: s.classId ?? null,
        class_name: s.className ?? null,
        room: s.room ?? null,
        start_time: s.startTime ?? null,
        end_time: s.endTime ?? null,
        teacher_id: s.teacherId ?? null,
      })),
    },
  })
}

export async function deleteTimetableSlot(id: string): Promise<void> {
  await request<void>(`/timetable/${id}`, { method: 'DELETE' })
}
