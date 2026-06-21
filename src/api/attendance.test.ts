import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveAttendance } from './attendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('saveAttendance', () => {
  it('POSTs /classes/{classId}/attendance with period + snake_case marks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await saveAttendance('X-A', 3, [{ studentId: 's1', status: 'present' }, { studentId: 's2', status: 'absent' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/classes/X-A/attendance')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.period).toBe(3)
    expect(body.marks).toEqual([{ student_id: 's1', status: 'present' }, { student_id: 's2', status: 'absent' }])
  })
})
