import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCalendarEvent,
  listCalendarEvents,
  removeCalendarEvent,
  type CalendarEventInput,
} from './calendarEvents'
import { tokenStore } from './auth/tokenStore'

describe('calendarEvents', () => {
  beforeEach(() => {
    localStorage.clear()
    tokenStore.setTenantId('school-a')
  })

  it('starts empty — no seeded dummy events', () => {
    expect(listCalendarEvents()).toEqual([])
  })

  it('persists added events per tenant', () => {
    const input: CalendarEventInput = {
      date: '2026-07-20',
      type: 'exam',
      title: 'Unit test',
      desc: 'Math',
      channels: ['email'],
    }
    const created = addCalendarEvent(input)
    expect(created.id).toBeTruthy()
    expect(created.title).toBe('Unit test')
    expect(listCalendarEvents()).toHaveLength(1)
    expect(listCalendarEvents()[0].channels).toEqual(['email'])
  })

  it('isolates events by tenant', () => {
    addCalendarEvent({ date: '2026-07-01', type: 'event', title: 'A only', channels: [] })
    tokenStore.setTenantId('school-b')
    expect(listCalendarEvents()).toEqual([])
    addCalendarEvent({ date: '2026-07-02', type: 'holiday', title: 'B only', channels: ['app'] })
    expect(listCalendarEvents()).toHaveLength(1)
    tokenStore.setTenantId('school-a')
    expect(listCalendarEvents()[0].title).toBe('A only')
  })

  it('removes by id', () => {
    const a = addCalendarEvent({ date: '2026-07-10', type: 'fee', title: 'Fee', channels: [] })
    addCalendarEvent({ date: '2026-07-11', type: 'ptm', title: 'PTM', channels: [] })
    removeCalendarEvent(a.id)
    const left = listCalendarEvents()
    expect(left).toHaveLength(1)
    expect(left[0].title).toBe('PTM')
  })

  it('rejects blank title', () => {
    expect(() =>
      addCalendarEvent({ date: '2026-07-01', type: 'event', title: '  ', channels: [] }),
    ).toThrow(/title/i)
  })
})
