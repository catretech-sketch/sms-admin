/** Local, offline stand-in for the backend's future POST /v1/ai/search — same response
 *  shape, computed from already-live student/attendance data. See
 *  docs/superpowers/specs/2026-08-30-communication-ai-mode-design.md §3. */

export interface AiSearchStudent {
  id: string
  name: string
  cls: string
  section: string
  attendance: number | null
}

export interface AiSearchAttendanceHero {
  present: number
  marked: number
  absent: number
  pct: number | null
}

export interface DailyAttendanceSummaryData {
  totalStudents: number
  present: number
  absent: number
  attendancePercentage: number
}

export interface StudentSearchRow {
  studentId: string
  name: string
  className: string
  section: string
  attendancePct: number | null
}

export type AiSearchLanguage = 'en' | 'hi' | 'hinglish'

export interface AiSearchResponse {
  success: boolean
  language: AiSearchLanguage | null
  intent: string | null
  answer: string | null
  data: DailyAttendanceSummaryData | StudentSearchRow[] | null
  page: number
  pageSize: number
  count: number
  hasNextPage: boolean
}

const MUTATION_VERBS = /\b(mark|delete|remove|update|add|create|edit|change)\b/i
const HINDI_KEYWORDS = ['kitne', 'kitni', 'bachche', 'bacche', 'aaj', 'kya', 'kaun', 'hai', 'hain', 'kaisa', 'haal']
const ATTENDANCE_SUMMARY_EN = /how many\b.*\b(student|students)\b.*(present|absent|came|attend)/i
const ATTENDANCE_SUMMARY_HI = /(kitne|kitni).*(bachche|bacche|student|students).*(aaye|aaya)|aaj ki attendance/i
// Native Devanagari script — romanized Hindi/Hinglish keywords above never match this script.
const ATTENDANCE_SUMMARY_DEVANAGARI = /कितने.*(बच्चे|बच्चा|विद्यार्थी).*आ(ये|ए)|आज.*उपस्थिति/
const STUDENT_SEARCH_EN = /^(?:find|search(?: for)?)\s+(.+)$/i
// NOTE: native-script (Devanagari) student search (e.g. finding a student by name written
// in Hindi script) is a known follow-up, not required now.
const STUDENT_SEARCH_HI = /^(.+?)\s+ka\s+(?:attendance|details|record)/i

const WRITE_BLOCKED_ANSWER =
  'Main sirf data search aur display kar sakta hoon. Main school data ko modify nahi kar sakta.'
const UNSUPPORTED_ANSWER =
  "I couldn't understand that as a supported search. Try asking about attendance, students, exams, homework, subjects, or bus location."

function detectLanguage(query: string): AiSearchLanguage {
  if (/[ऀ-ॿ]/.test(query)) return 'hi'
  const lower = query.toLowerCase()
  if (HINDI_KEYWORDS.some((w) => lower.includes(w))) return 'hinglish'
  return 'en'
}

function isMutationQuery(query: string): boolean {
  return MUTATION_VERBS.test(query)
}

function matchAttendanceSummary(query: string): boolean {
  return ATTENDANCE_SUMMARY_EN.test(query) || ATTENDANCE_SUMMARY_HI.test(query) || ATTENDANCE_SUMMARY_DEVANAGARI.test(query)
}

function matchStudentSearch(query: string): string | null {
  const en = query.match(STUDENT_SEARCH_EN)
  if (en) return en[1].trim()
  const hi = query.match(STUDENT_SEARCH_HI)
  if (hi) return hi[1].trim()
  return null
}

function attendanceAnswer(lang: AiSearchLanguage, hero: AiSearchAttendanceHero, totalStudents: number): string {
  if (lang === 'en') return `${hero.present} of ${totalStudents} students present today (${hero.pct ?? 0}%).`
  return `Aaj ${totalStudents} mein se ${hero.present} bachche school aaye hain.`
}

function studentSearchAnswer(lang: AiSearchLanguage, count: number, needle: string): string {
  if (lang === 'en') return `Found ${count} student${count === 1 ? '' : 's'} matching "${needle}".`
  return `"${needle}" se milte ${count} student mile.`
}

// NOTE: ctx.students is whatever the caller passed (currently one page from useStudents(),
// matching this app's existing single-page convention) — StudentSearch and totalStudents
// only reflect that page, not the full roster, if the school has more than one page.
export function resolveAiQuery(
  rawQuery: string,
  ctx: { students: AiSearchStudent[]; attendanceHero: AiSearchAttendanceHero },
): AiSearchResponse {
  const query = rawQuery.trim()
  const language = detectLanguage(query)
  const base = { success: true, language, page: 1, pageSize: 20 } as const

  if (isMutationQuery(query)) {
    return { ...base, intent: 'WriteBlocked', answer: WRITE_BLOCKED_ANSWER, data: null, count: 0, hasNextPage: false }
  }

  if (matchAttendanceSummary(query)) {
    const data: DailyAttendanceSummaryData = {
      // present/absent are counts over ctx.attendanceHero.marked (the actual period-marks
      // denominator), not the full roster — pairing them with the roster size produces
      // incoherent numbers (e.g. "781 of 3 students"). Use marked as the denominator once
      // marks exist; only fall back to full enrollment before any marks are in for the day.
      totalStudents: ctx.attendanceHero.marked > 0 ? ctx.attendanceHero.marked : ctx.students.length,
      present: ctx.attendanceHero.present,
      absent: ctx.attendanceHero.absent,
      attendancePercentage: ctx.attendanceHero.pct ?? 0,
    }
    return {
      ...base, intent: 'DailyAttendanceSummary',
      answer: attendanceAnswer(language, ctx.attendanceHero, data.totalStudents),
      data, count: 1, hasNextPage: false,
    }
  }

  const needle = matchStudentSearch(query)
  if (needle) {
    const lower = needle.toLowerCase()
    const rows: StudentSearchRow[] = ctx.students
      .filter((s) => s.name.toLowerCase().includes(lower))
      .map((s) => ({ studentId: s.id, name: s.name, className: s.cls, section: s.section, attendancePct: s.attendance }))
    return {
      ...base, intent: 'StudentSearch',
      answer: studentSearchAnswer(language, rows.length, needle),
      data: rows, count: rows.length, hasNextPage: false,
    }
  }

  return { ...base, intent: 'Unsupported', answer: UNSUPPORTED_ANSWER, data: null, count: 0, hasNextPage: false }
}
