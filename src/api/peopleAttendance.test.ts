import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from './ApiError'
import {
  loadPeopleAttendance, cachePeopleAttendance, savePeopleAttendance,
  clearPeopleAttendanceMemory, listCachedPeopleAttendance,
  effectivePeopleStatus, countPeoplePresent, type CheckInInfo,
  fetchRemotePeopleAttendance, savePeopleAttendanceRemote, pushPeopleAttendance,
} from './peopleAttendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)
}

beforeEach(() => {
  clearPeopleAttendanceMemory()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('peopleAttendance cache', () => {
  it('caches and loads marks for a date in memory only', () => {
    cachePeopleAttendance('teachers', '2026-07-16', { t1: 'present', t2: 'absent' })
    expect(loadPeopleAttendance('teachers', '2026-07-16')).toEqual({ t1: 'present', t2: 'absent' })
    expect(loadPeopleAttendance('teachers', '2026-07-15')).toEqual({})
    expect(loadPeopleAttendance('staff', '2026-07-16')).toEqual({})
    expect(localStorage.length).toBe(0)
  })

  it('savePeopleAttendance throws — remote save required', () => {
    expect(() => savePeopleAttendance('staff', '2026-07-16', { s1: 'late' }))
      .toThrow(/savePeopleAttendanceRemote/)
    expect(loadPeopleAttendance('staff', '2026-07-16')).toEqual({})
  })

  it('listCachedPeopleAttendance reads only memory', () => {
    cachePeopleAttendance('teachers', '2026-07-16', { t1: 'present' })
    cachePeopleAttendance('teachers', '2026-07-15', { t2: 'absent' })
    const rows = listCachedPeopleAttendance('teachers')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.date).sort()).toEqual(['2026-07-15', '2026-07-16'])
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
    expect(loadPeopleAttendance('teachers', '2026-07-16')).toEqual({ t1: 'absent', t2: 'present' })
  })

  it('throws ApiError (fail-closed) when the endpoint is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFound())
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchRemotePeopleAttendance('staff', '2026-07-16')).rejects.toBeInstanceOf(ApiError)
    expect(loadPeopleAttendance('staff', '2026-07-16')).toEqual({})
  })
})

describe('savePeopleAttendanceRemote', () => {
  it('POSTs /staff-attendance then updates the memory cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }))
    vi.stubGlobal('fetch', fetchMock)
    await savePeopleAttendanceRemote('staff', '2026-07-16', { s1: 'present', s2: 'absent' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff-attendance')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.person_type).toBe('staff')
    expect(body.date).toBe('2026-07-16')
    expect(body.records).toEqual(
      expect.arrayContaining([{ person_id: 's1', status: 'present' }, { person_id: 's2', status: 'absent' }]),
    )
    expect(loadPeopleAttendance('staff', '2026-07-16')).toEqual({ s1: 'present', s2: 'absent' })
    expect(localStorage.length).toBe(0)
  })

  it('throws and does not cache when the backend call fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFound())
    vi.stubGlobal('fetch', fetchMock)
    await expect(savePeopleAttendanceRemote('teachers', '2026-07-16', { t1: 'present' }))
      .rejects.toBeInstanceOf(ApiError)
    expect(loadPeopleAttendance('teachers', '2026-07-16')).toEqual({})
  })

  it('throws when there are no marks', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(savePeopleAttendanceRemote('teachers', '2026-07-16', {})).rejects.toThrow(/No people/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('pushPeopleAttendance', () => {
  it('delegates to savePeopleAttendanceRemote (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()))
    await expect(pushPeopleAttendance('teachers', '2026-07-16', { t1: 'present' }))
      .rejects.toBeInstanceOf(ApiError)
  })
})
