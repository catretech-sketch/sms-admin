import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { ATTENDANCE_CHANGED, ATTENDANCE_SAVED_EVENT } from '../attendance'
import { PEOPLE_ATTENDANCE_CHANGED } from '../peopleAttendance'
import { bumpAttendanceLiveQueries } from './useAttendanceLive'

describe('bumpAttendanceLiveQueries', () => {
  it('invalidates attendance queries and notifies open screens', () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const dispatch = vi.spyOn(window, 'dispatchEvent')

    bumpAttendanceLiveQueries(qc)

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['attendance'] })
    const names = dispatch.mock.calls.map((c) => (c[0] as Event).type)
    expect(names).toEqual(
      expect.arrayContaining([ATTENDANCE_SAVED_EVENT, ATTENDANCE_CHANGED, PEOPLE_ATTENDANCE_CHANGED]),
    )
  })
})
