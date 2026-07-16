import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadPeopleAttendance, savePeopleAttendance,
  effectivePeopleStatus, countPeoplePresent, type CheckInInfo,
} from './peopleAttendance'

beforeEach(() => { localStorage.clear() })

describe('peopleAttendance', () => {
  it('saves and loads marks for a date', () => {
    savePeopleAttendance('teachers', '2026-07-16', { t1: 'present', t2: 'absent' })
    expect(loadPeopleAttendance('teachers', '2026-07-16')).toEqual({ t1: 'present', t2: 'absent' })
    expect(loadPeopleAttendance('teachers', '2026-07-15')).toEqual({})
    expect(loadPeopleAttendance('staff', '2026-07-16')).toEqual({})
  })
})

describe('effectivePeopleStatus', () => {
  const p = { id: 't1', name: 'Asha Rao' }

  it('honours an explicit CRM mark above everything else', () => {
    const checkIn = new Map<string, CheckInInfo>([['t1', { checkedIn: true }]])
    expect(effectivePeopleStatus('teachers', p, { t1: 'absent' }, { checkIn, principalKnown: true }))
      .toBe('absent')
  })

  it('uses teacher-app check-in when no manual mark', () => {
    const checkIn = new Map<string, CheckInInfo>([['t1', { checkedIn: true }]])
    expect(effectivePeopleStatus('teachers', p, {}, { checkIn, principalKnown: true })).toBe('present')
  })

  it('marks a known-but-not-checked-in teacher absent once the feed loaded', () => {
    const checkIn = new Map<string, CheckInInfo>([['t1', { checkedIn: false }]])
    expect(effectivePeopleStatus('teachers', p, {}, { checkIn, principalKnown: true })).toBe('absent')
  })

  it('defaults to present for staff roll-call and unknown teachers', () => {
    expect(effectivePeopleStatus('staff', { id: 's1', name: 'Ravi' }, {})).toBe('present')
    expect(effectivePeopleStatus('teachers', p, {}, { principalKnown: false })).toBe('present')
  })

  it('matches teacher-app check-ins by name when id differs', () => {
    const checkIn = new Map<string, CheckInInfo>([['asha rao', { checkedIn: true }]])
    expect(effectivePeopleStatus('teachers', p, {}, { checkIn, principalKnown: true })).toBe('present')
  })
})

describe('countPeoplePresent', () => {
  it('counts present/late across manual marks and check-ins', () => {
    const people = [
      { id: 't1', name: 'A' },
      { id: 't2', name: 'B' },
      { id: 't3', name: 'C' },
    ]
    const checkIn = new Map<string, CheckInInfo>([
      ['t1', { checkedIn: true }],
      ['t2', { checkedIn: false }],
      ['t3', { checkedIn: false }],
    ])
    // t1 checked in (present), t2 not checked in (absent), t3 manually marked late (present)
    const present = countPeoplePresent('teachers', people, { t3: 'late' }, { checkIn, principalKnown: true })
    expect(present).toBe(2)
  })

  it('counts staff via manual marks, defaulting unmarked to present', () => {
    const staff = [{ id: 's1', name: 'X' }, { id: 's2', name: 'Y' }]
    expect(countPeoplePresent('staff', staff, { s2: 'absent' })).toBe(1)
  })
})
