import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listAssignments, createHomeworkAssignment, homeworkStatusLabel } from './assignments'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('homeworkStatusLabel', () => {
  it('maps API status codes to display labels', () => {
    expect(homeworkStatusLabel('active')).toBe('Active')
    expect(homeworkStatusLabel('due_soon')).toBe('Due soon')
    expect(homeworkStatusLabel('overdue')).toBe('Overdue')
    expect(homeworkStatusLabel('closed')).toBe('Closed')
  })
})

describe('listAssignments', () => {
  it('maps AssignmentResponse into the UI shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'A1',
        title: 'Quadratic equations — Ex 4.3',
        class_name: 'IX-A',
        subject: 'Mathematics',
        due_date: '2026-06-12T00:00:00Z',
        status: 'active',
        submissions_count: 2,
        total_students: 30,
      }],
    })))
    const row = (await listAssignments())[0]
    expect(row).toMatchObject({
      id: 'A1',
      title: 'Quadratic equations — Ex 4.3',
      className: 'IX-A',
      subject: 'Mathematics',
      dueDate: '2026-06-12',
      status: 'active',
      submissionsCount: 2,
      totalStudents: 30,
      source: 'teacher_app',
    })
  })
})

describe('createHomeworkAssignment', () => {
  it('POSTs /assignments then fans out /homework per student', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: { id: 'HW1', title: 'Chapter 5', class_id: 'c1', class_name: 'IX-A', status: 'active' },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 's1' }, { id: 's2' }], next_cursor: null }))
      .mockResolvedValue(jsonResponse({ data: { id: 'h1' } }))
    vi.stubGlobal('fetch', fetchMock)

    const created = await createHomeworkAssignment({
      title: 'Chapter 5',
      classId: 'c1',
      className: 'IX-A',
      subject: 'Math',
      dueDate: '2026-06-15',
    })
    expect(created.source).toBe('admin')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/assignments'))).toBe(true)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/homework')).length).toBe(2)
  })
})
