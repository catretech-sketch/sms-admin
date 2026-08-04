import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadPeopleAttendance, savePeopleAttendance,
  effectivePeopleStatus, countPeoplePresent, type CheckInInfo,
  fetchRemotePeopleAttendance, pushPeopleAttendance,
} from './peopleAttendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

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

  it('defaults staff to absent (no app feed) but unknown teachers to present', () => {
    expect(effectivePeopleStatus('staff', { id: 's1', name: 'Ravi' }, {})).toBe('absent')
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
    const present = countPeoplePresent(people, { t3: 'late' }, { checkIn, principalKnown: true })
    expect(present).toBe(2)
  })

  it('counts staff via manual marks; unmarked staff never count as present', () => {
    const staff = [{ id: 's1', name: 'X' }, { id: 's2', name: 'Y' }]
    expect(countPeoplePresent(staff, { s2: 'present' })).toBe(1)
  })
})

describe('fetchRemotePeopleAttendance', () => {
  it('GETs /staff-attendance?person_type=&date= and maps person_id/status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ person_id: 't1', status: 'absent' }, { person_id: 't2', status: 'present' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const marks = await fetchRemotePeopleAttendance('teachers', '2026-07-16')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff-attendance')
    expect(url).toContain('person_type=teacher')
    expect(url).toContain('date=2026-07-16')
    expect(marks).toEqual({ t1: 'absent', t2: 'present' })
  })

  it('returns null (never throws) when the endpoint is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFound())
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchRemotePeopleAttendance('staff', '2026-07-16')).toBeNull()
  })
})

describe('pushPeopleAttendance', () => {
  it('POSTs /staff-attendance with personType + snake_case records', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }))
    vi.stubGlobal('fetch', fetchMock)
    await pushPeopleAttendance('staff', '2026-07-16', { s1: 'present', s2: 'absent' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff-attendance')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.person_type).toBe('staff')
    expect(body.date).toBe('2026-07-16')
    expect(body.records).toEqual(
      expect.arrayContaining([{ person_id: 's1', status: 'present' }, { person_id: 's2', status: 'absent' }]),
    )
  })

  it('never throws, even when the backend call fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFound())
    vi.stubGlobal('fetch', fetchMock)
    await expect(pushPeopleAttendance('teachers', '2026-07-16', { t1: 'present' })).resolves.toBeUndefined()
  })

  it('is a no-op with no marks', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await pushPeopleAttendance('teachers', '2026-07-16', {})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
