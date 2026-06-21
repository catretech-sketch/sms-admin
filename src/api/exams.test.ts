import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listExams, createExam, updateExam } from './exams'
import type { Exam } from '@/types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const wireExam = { id: 'EX1', name: 'Term 1', type: 'Term', grades: 'VI-XII', from: '2026-09-08', to: '2026-09-20', subjects: 6, status: 'scheduled', marks_entered_pct: 0, published: false }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listExams', () => {
  it('maps marks_entered_pct -> marksEntered', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireExam], next_cursor: null })))
    const rows = await listExams()
    expect(rows[0]).toMatchObject({ id: 'EX1', name: 'Term 1', marksEntered: 0, published: false })
    expect((rows[0] as unknown as Record<string, unknown>).marks_entered_pct).toBeUndefined()
  })
})

describe('createExam', () => {
  it('POSTs /exams with marksEntered -> marks_entered_pct', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: wireExam }))
    vi.stubGlobal('fetch', fetchMock)
    await createExam({ id: 'tmp', name: 'Term 1', type: 'Term', grades: 'VI-XII', from: '2026-09-08', to: '2026-09-20', subjects: 6, status: 'scheduled', marksEntered: 0, published: false } as unknown as Exam)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/exams')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.marks_entered_pct).toBe(0)
    expect(body.marksEntered).toBeUndefined()
  })
})

describe('updateExam', () => {
  it('PUTs /exams/{id} with a mapped partial patch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ...wireExam, status: 'marks_entry', marks_entered_pct: 64 } }))
    vi.stubGlobal('fetch', fetchMock)
    const updated = await updateExam('EX1', { status: 'marks_entry', marksEntered: 64 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/exams/EX1')
    expect((init as RequestInit).method).toBe('PUT')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.status).toBe('marks_entry')
    expect(body.marks_entered_pct).toBe(64)
    expect(updated).toMatchObject({ status: 'marks_entry', marksEntered: 64 })
  })
})
