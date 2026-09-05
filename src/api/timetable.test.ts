import { describe, it, expect } from 'vitest'
import { getTimetableSubject, findTimetableSlot, type TimetableSlot } from './timetable'

function slot(overrides: Partial<TimetableSlot>): TimetableSlot {
  return {
    id: 's1', day: 'Mon', period: 1, subject: 'Mathematics', classId: 'class-1', className: 'IV-B',
    room: null, startTime: null, endTime: null, teacherName: null, teacherId: null,
    ...overrides,
  }
}

describe('getTimetableSubject', () => {
  it('finds the subject for a matching class/weekday/period', () => {
    // 2026-09-04 is a Friday.
    const slots = [slot({ day: 'Fri', period: 3, subject: 'Science' })]
    expect(getTimetableSubject(slots, 'class-1', '2026-09-04', 3)).toBe('Science')
  })

  it('matches day names given as a full word (e.g. "Friday") against the 3-letter form', () => {
    const slots = [slot({ day: 'Friday', period: 3, subject: 'Science' })]
    expect(getTimetableSubject(slots, 'class-1', '2026-09-04', 3)).toBe('Science')
  })

  it('returns null when no slot matches the class', () => {
    const slots = [slot({ day: 'Fri', period: 3, classId: 'class-2' })]
    expect(getTimetableSubject(slots, 'class-1', '2026-09-04', 3)).toBeNull()
  })

  it('returns null when no slot matches the period', () => {
    const slots = [slot({ day: 'Fri', period: 4 })]
    expect(getTimetableSubject(slots, 'class-1', '2026-09-04', 3)).toBeNull()
  })

  it('returns null when no slot matches the weekday', () => {
    const slots = [slot({ day: 'Mon', period: 3 })]
    expect(getTimetableSubject(slots, 'class-1', '2026-09-04', 3)).toBeNull() // 2026-09-04 is Friday
  })

  it('returns null for an unscheduled/blank slot subject', () => {
    const slots = [slot({ day: 'Fri', period: 3, subject: '' })]
    expect(getTimetableSubject(slots, 'class-1', '2026-09-04', 3)).toBeNull()
  })

  it('handles a full UTC datetime string (not just a bare date), like the wire format period-attendance rows actually use', () => {
    const slots = [slot({ day: 'Fri', period: 3, subject: 'Science' })]
    // Same calendar day as '2026-09-04' once read on the browser's local clock.
    expect(getTimetableSubject(slots, 'class-1', '2026-09-04T12:00:00.000Z', 3)).toBe('Science')
  })
})

describe('findTimetableSlot', () => {
  it('returns the full matched slot, including start/end time', () => {
    const slots = [slot({ day: 'Fri', period: 3, subject: 'Science', startTime: '09:55', endTime: '10:40' })]
    const found = findTimetableSlot(slots, 'class-1', '2026-09-04', 3)
    expect(found).toMatchObject({ subject: 'Science', startTime: '09:55', endTime: '10:40' })
  })

  it('returns null when nothing matches', () => {
    const slots = [slot({ day: 'Mon', period: 3 })]
    expect(findTimetableSlot(slots, 'class-1', '2026-09-04', 3)).toBeNull() // 2026-09-04 is Friday
  })
})
