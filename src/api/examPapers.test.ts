import { describe, it, expect } from 'vitest'
import { timeHm, toExamPaper, paperToSlot, slotToCreateInput, slotToUpdateInput } from './examPapers'

describe('timeHm', () => {
  it('normalizes HH:MM and HH:MM:SS', () => {
    expect(timeHm('9:30')).toBe('09:30')
    expect(timeHm('09:30:00')).toBe('09:30')
    expect(timeHm('13:05')).toBe('13:05')
  })

  it('parses 12-hour and object shapes', () => {
    expect(timeHm('1:30 PM')).toBe('13:30')
    expect(timeHm({ hours: 9, minutes: 5 })).toBe('09:05')
  })
})

describe('toExamPaper start time', () => {
  it('reads start_time from wire', () => {
    const p = toExamPaper({
      id: '1', subject: 'Maths', date: '2026-09-08',
      start_time: '09:30:00', duration_min: 180,
    })
    expect(p.start).toBe('09:30')
    expect(p.duration).toBe(180)
  })

  it('falls back to start when start_time missing', () => {
    const p = toExamPaper({
      id: '1', subject: 'Maths', date: '2026-09-08',
      start: '13:30', duration_min: 120,
    })
    expect(p.start).toBe('13:30')
  })
})

describe('paper max marks round-trip', () => {
  it('paperToSlot and slot create/update keep maxMarks', () => {
    const p = toExamPaper({
      id: 'p1', subject: 'Drawing', date: '2026-09-08',
      start_time: '09:30', duration_min: 90, max_marks: 70,
    })
    const slot = paperToSlot(p)
    expect(slot.maxMarks).toBe(70)
    expect(slotToCreateInput('e1', slot).maxMarks).toBe(70)
    expect(slotToUpdateInput({ ...slot, maxMarks: 80 }).maxMarks).toBe(80)
  })
})
