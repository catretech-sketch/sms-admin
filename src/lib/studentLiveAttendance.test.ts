import { describe, it, expect } from 'vitest'
import { studentLiveAttendance } from './studentLiveAttendance'

describe('studentLiveAttendance', () => {
  it('uses official overallPct and does not mix period totals with enrollment', () => {
    const live = studentLiveAttendance({
      loaded: true,
      presentTotal: 0,
      studentTotal: 0,
      overallPct: 92,
      enrollment: 200,
    })
    expect(live.pct).toBe(92)
    expect(live.meter).toBe(92)
  })

  it('does not show 0% when period counts are empty and overallPct is missing', () => {
    const live = studentLiveAttendance({
      loaded: true,
      presentTotal: 0,
      studentTotal: 0,
      overallPct: 0,
      enrollment: 200,
    })
    expect(live.pct).toBeNull()
    expect(live.meter).toBe(0)
    expect(live.footnote).toBe('No period marks today')
  })

  it('shows Loading… instead of No period marks while the range request is in flight', () => {
    const live = studentLiveAttendance({ loaded: false, enrollment: 200 })
    expect(live.pct).toBeNull()
    expect(live.footnote).toBe('Loading…')
  })

  it('computes % from period present/marked when overallPct is absent', () => {
    const live = studentLiveAttendance({
      loaded: true,
      presentTotal: 45,
      studentTotal: 50,
      overallPct: undefined,
      enrollment: 200,
    })
    expect(live.pct).toBe(90)
    expect(live.present).toBe(45)
    expect(live.marked).toBe(50)
  })
})
