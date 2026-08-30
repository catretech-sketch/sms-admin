import { describe, it, expect } from 'vitest'
import { resolveAiQuery, type AiSearchStudent, type AiSearchAttendanceHero } from './aiSearchResolver'

const students: AiSearchStudent[] = [
  { id: 's1', name: 'Rahul Sharma', cls: '8', section: 'A', attendance: 91.2 },
  { id: 's2', name: 'Rahul Verma', cls: '9', section: 'B', attendance: 85 },
  { id: 's3', name: 'Priya Singh', cls: '8', section: 'A', attendance: null },
]
const hero: AiSearchAttendanceHero = { present: 781, marked: 842, absent: 61, pct: 93 }
const ctx = { students, attendanceHero: hero }

describe('resolveAiQuery — WriteBlocked', () => {
  it('blocks a mutation-verb query in English', () => {
    const r = resolveAiQuery('mark Rahul present', ctx)
    expect(r.intent).toBe('WriteBlocked')
    expect(r.success).toBe(true)
    expect(r.data).toBeNull()
    expect(r.answer).toContain('nahi kar sakta')
  })
  it('blocks "delete all students"', () => {
    expect(resolveAiQuery('delete all students', ctx).intent).toBe('WriteBlocked')
  })
  it('blocks a SQL-injection-shaped query the same as any other mutation attempt', () => {
    expect(resolveAiQuery("'; DROP TABLE Students--", ctx).intent).toBe('Unsupported')
  })
})

describe('resolveAiQuery — DailyAttendanceSummary', () => {
  it('answers an English attendance-summary query from the live hero', () => {
    const r = resolveAiQuery('How many students present today?', ctx)
    expect(r.intent).toBe('DailyAttendanceSummary')
    expect(r.language).toBe('en')
    expect(r.data).toEqual({
      totalStudents: 3, present: 781, absent: 61, attendancePercentage: 93,
    })
    expect(r.answer).toContain('781')
  })
  it('answers a Hinglish attendance-summary query', () => {
    const r = resolveAiQuery('Aaj kitne bachche aaye?', ctx)
    expect(r.intent).toBe('DailyAttendanceSummary')
    expect(r.language).toBe('hinglish')
    expect(r.answer).toContain('781')
  })
})

describe('resolveAiQuery — StudentSearch', () => {
  it('finds students by case-insensitive substring (English "find")', () => {
    const r = resolveAiQuery('find rahul', ctx)
    expect(r.intent).toBe('StudentSearch')
    expect(r.count).toBe(2)
    expect(r.data).toEqual([
      { studentId: 's1', name: 'Rahul Sharma', className: '8', section: 'A', attendancePct: 91.2 },
      { studentId: 's2', name: 'Rahul Verma', className: '9', section: 'B', attendancePct: 85 },
    ])
    expect(r.answer).toContain('Found 2 students matching "rahul"')
  })
  it('finds a single student via the Hindi "X ka attendance" pattern', () => {
    const r = resolveAiQuery('Priya ka attendance', ctx)
    expect(r.intent).toBe('StudentSearch')
    expect(r.count).toBe(1)
    expect(r.data).toEqual([
      { studentId: 's3', name: 'Priya Singh', className: '8', section: 'A', attendancePct: null },
    ])
  })
  it('returns zero rows (not Unsupported) when no name matches', () => {
    const r = resolveAiQuery('find nobody', ctx)
    expect(r.intent).toBe('StudentSearch')
    expect(r.count).toBe(0)
    expect(r.data).toEqual([])
  })
})

describe('resolveAiQuery — Unsupported fallback', () => {
  it('falls back to the exact backend-spec generic message', () => {
    const r = resolveAiQuery('what is the weather today', ctx)
    expect(r.intent).toBe('Unsupported')
    expect(r.answer).toBe(
      "I couldn't understand that as a supported search. Try asking about attendance, students, exams, homework, subjects, or bus location.",
    )
    expect(r.data).toBeNull()
  })
})

describe('resolveAiQuery — language heuristic', () => {
  it('detects Devanagari script as hi', () => {
    expect(resolveAiQuery('आज कितने बच्चे आये?', ctx).language).toBe('hi')
  })
  it('detects Hindi/Hinglish keywords in Latin script as hinglish', () => {
    expect(resolveAiQuery('kya haal hai', ctx).language).toBe('hinglish')
  })
  it('defaults to en for plain English text', () => {
    expect(resolveAiQuery('show me the report', ctx).language).toBe('en')
  })
})
