import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCalendarEvent,
  listCalendarEvents,
  removeCalendarEvent,
  type CalendarEventInput,
} from './calendarEvents'
import { tokenStore } from './auth/tokenStore'

function jsonOk(data: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    text: async () => JSON.stringify({ data }),
    json: async () => ({ data }),
  } as Response)
}

describe('calendarEvents (API)', () => {
  beforeEach(() => {
    localStorage.clear()
    tokenStore.set({ access_token: 'cal-token', refresh_token: 'cal-refresh' })
    tokenStore.setTenantId('school-a')
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists from GET /calendar with bearer auth', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonOk([
      {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Sports',
        date: '2026-07-20',
        type: 'event',
        description: 'Day',
        channels_json: '["email"]',
      },
    ]))
    const rows = await listCalendarEvents()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Sports')
    expect(rows[0].channels).toEqual(['email'])
    expect(String(fetchMock.mock.calls[0][0])).toContain('/calendar')
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer cal-token')
    expect(headers['X-Tenant-Id']).toBe('school-a')
  })

  it('POSTs new events and does not write localStorage SoT', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    const input: CalendarEventInput = {
      date: '2026-07-20',
      type: 'exam',
      title: 'Unit test',
      desc: 'Math',
      channels: ['email'],
    }
    fetchMock.mockResolvedValueOnce(jsonOk({
      id: '22222222-2222-2222-2222-222222222222',
      title: 'Unit test',
      date: '2026-07-20',
      type: 'exam',
      description: 'Math',
      channels_json: '["email"]',
    }, 201))
    const created = await addCalendarEvent(input)
    expect(created.title).toBe('Unit test')
    expect(localStorage.getItem('sms_calendar_events:school-a')).toBeNull()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/calendar')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('clears legacy localStorage without migrating into API results', async () => {
    localStorage.setItem('sms_calendar_events:school-a', JSON.stringify([{
      id: 'local-1',
      date: '2026-07-01',
      type: 'event',
      title: 'Legacy',
      channels: ['app'],
      createdAt: new Date().toISOString(),
    }]))
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonOk([]))
    const rows = await listCalendarEvents()
    expect(rows.some((r) => r.title === 'Legacy')).toBe(false)
    expect(localStorage.getItem('sms_calendar_events:school-a')).toBeNull()
  })

  it('DELETEs by id', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: async () => '',
      json: async () => ({}),
    } as Response)
    await removeCalendarEvent('44444444-4444-4444-4444-444444444444')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/calendar/44444444-4444-4444-4444-444444444444')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
  })

  it('rejects blank title before calling API', async () => {
    await expect(
      addCalendarEvent({ date: '2026-07-01', type: 'event', title: '  ', channels: [] }),
    ).rejects.toThrow(/title/i)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
