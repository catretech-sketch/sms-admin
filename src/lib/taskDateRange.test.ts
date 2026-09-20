import { describe, it, expect } from 'vitest'
import { taskDateRange } from './taskDateRange'

/** Wednesday 16 Sep 2026, 15:30 local — a known weekday so "this week" is deterministic. */
const NOW = new Date(2026, 8, 16, 15, 30, 0)

function iso(y: number, m: number, d: number, h: number, min: number, s: number, ms: number) {
  return new Date(y, m, d, h, min, s, ms).toISOString()
}

describe('taskDateRange', () => {
  it('bounds Today to the local calendar day', () => {
    expect(taskDateRange('today', NOW)).toEqual({
      from: iso(2026, 8, 16, 0, 0, 0, 0),
      to: iso(2026, 8, 16, 23, 59, 59, 999),
    })
  })

  it('bounds Yesterday to the previous local calendar day', () => {
    expect(taskDateRange('yesterday', NOW)).toEqual({
      from: iso(2026, 8, 15, 0, 0, 0, 0),
      to: iso(2026, 8, 15, 23, 59, 59, 999),
    })
  })

  it('bounds This Week Monday–Sunday in local time', () => {
    expect(taskDateRange('this_week', NOW)).toEqual({
      from: iso(2026, 8, 14, 0, 0, 0, 0),
      to: iso(2026, 8, 20, 23, 59, 59, 999),
    })
  })

  it('bounds This Month to the local calendar month', () => {
    expect(taskDateRange('this_month', NOW)).toEqual({
      from: iso(2026, 8, 1, 0, 0, 0, 0),
      to: iso(2026, 8, 30, 23, 59, 59, 999),
    })
  })

  it('bounds Last Month to the previous local calendar month', () => {
    expect(taskDateRange('last_month', NOW)).toEqual({
      from: iso(2026, 7, 1, 0, 0, 0, 0),
      to: iso(2026, 7, 31, 23, 59, 59, 999),
    })
  })

  it('returns no bounds for All Time', () => {
    expect(taskDateRange('all', NOW)).toEqual({})
  })

  it('passes Custom from/to through unchanged', () => {
    expect(taskDateRange('custom', NOW, { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' }))
      .toEqual({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T23:59:59.999Z' })
  })
})
