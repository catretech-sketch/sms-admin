# Communication "AI Mode" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Platinum-gated "AI Mode" to the school Communication screen that lets users ask
natural-language questions (typed, or spoken in English/Hindi) and get answers computed locally
from already-live student/attendance data, matching the shape of the backend's future
`POST /v1/ai/search` contract so the swap to that real endpoint later is contained.

**Architecture:** A pure resolver (`resolveAiQuery`) pattern-matches a query against an MVP intent
subset (`WriteBlocked`, `DailyAttendanceSummary`, `StudentSearch`, `Unsupported`) using data already
fetched by existing hooks (`useStudents`, `usePeriodAttendanceRangeSummary`). A `useAiSearch`
mutation hook wraps it. A new `AiSearchScreen` provides the voice/text chat UI, flagged with the
existing `DemoBadge`. `CommunicationScreen` gains an "AI Mode" toggle that swaps its tabbed body for
`AiSearchScreen` behind a `TierGate feature="ai_search"` (Platinum-only).

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3 + React Testing Library, TanStack Query 5.
Browser `SpeechRecognition`/`webkitSpeechRecognition` for voice input (no external service).

**Spec:** `docs/superpowers/specs/2026-08-30-communication-ai-mode-design.md`

## Global Constraints

- No network calls for this feature — `resolveAiQuery` is a pure function; `useAiSearch`'s
  `mutationFn` never calls `fetch`/`request`/`listRequest`.
- `ai_search` feature key must map to `'platinum'` in `FEATURE_TIER` (`src/data/mockDb.ts`) —
  mirrors `sms-backend`'s `TierFeatures.cs`.
- `AiSearchScreen` always carries a `<DemoBadge label="Local answers — Claude-backed search coming soon" />`
  in its header — never remove it in this plan (removing it is explicitly future work, per spec §7).
- Voice input is English (`en-IN`) or Hindi (`hi-IN`) only, chosen via an explicit toggle — no
  auto-detect, no Hinglish STT.
- `npm test`, `npm run typecheck` (`tsc -b`), and `npm run build` must all pass after every task.
  `noUnusedLocals` is on — no unused imports/vars.
- Reuse existing UI primitives from `@/components/ui` (`Btn`, `Badge`, `Segmented`, `Input`,
  `DataTable`, `DemoBadge`, `PageHead`, `Card`, `Empty`) — do not invent new CSS classes or
  duplicate an existing primitive.

---

### Task 1: `resolveAiQuery` — pure MVP intent resolver

**Files:**
- Create: `src/lib/aiSearchResolver.ts`
- Test: `src/lib/aiSearchResolver.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (foundational, pure function, no imports beyond types it
  defines itself).
- Produces (used by Task 2 and Task 4):
  - `export interface AiSearchStudent { id: string; name: string; cls: string; section: string; attendance: number | null }`
  - `export interface AiSearchAttendanceHero { present: number; marked: number; absent: number; pct: number | null }`
  - `export interface DailyAttendanceSummaryData { totalStudents: number; present: number; absent: number; attendancePercentage: number }`
  - `export interface StudentSearchRow { studentId: string; name: string; className: string; section: string; attendancePct: number | null }`
  - `export interface AiSearchResponse { success: boolean; language: 'en' | 'hi' | 'hinglish' | null; intent: string | null; answer: string | null; data: DailyAttendanceSummaryData | StudentSearchRow[] | null; page: number; pageSize: number; count: number; hasNextPage: boolean }`
  - `export function resolveAiQuery(rawQuery: string, ctx: { students: AiSearchStudent[]; attendanceHero: AiSearchAttendanceHero }): AiSearchResponse`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/aiSearchResolver.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/aiSearchResolver.test.ts`
Expected: FAIL — cannot find module `./aiSearchResolver`.

- [ ] **Step 3: Implement**

Create `src/lib/aiSearchResolver.ts`:
```ts
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
const ATTENDANCE_SUMMARY_HI = /(kitne|kitni)\s+(bachche|bacche|student|students)\s+(aaye|aaya)|aaj ki attendance/i
const STUDENT_SEARCH_EN = /^(?:find|search(?: for)?)\s+(.+)$/i
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
  return ATTENDANCE_SUMMARY_EN.test(query) || ATTENDANCE_SUMMARY_HI.test(query)
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
      totalStudents: ctx.students.length,
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/aiSearchResolver.test.ts`
Expected: PASS (all cases above).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/lib/aiSearchResolver.ts src/lib/aiSearchResolver.test.ts
git commit -m "feat(comms): add local AI-search resolver (attendance summary, student search)"
```

---

### Task 2: `useAiSearch` mutation hook

**Files:**
- Create: `src/api/hooks/useAiSearch.ts`
- Test: `src/api/hooks/useAiSearch.test.ts`

**Interfaces:**
- Consumes (from Task 1): `resolveAiQuery`, `AiSearchStudent`, `AiSearchAttendanceHero`,
  `AiSearchResponse` from `@/lib/aiSearchResolver`.
- Produces (used by Task 4):
  - `export interface AiSearchInput { query: string; students: AiSearchStudent[]; attendanceHero: AiSearchAttendanceHero }`
  - `export function useAiSearch(): UseMutationResult<AiSearchResponse, Error, AiSearchInput>`

- [ ] **Step 1: Write the failing test**

Create `src/api/hooks/useAiSearch.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAiSearch } from './useAiSearch'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const attendanceHero = { present: 10, marked: 12, absent: 2, pct: 83 }

describe('useAiSearch', () => {
  it('resolves a query against the given students/attendance context', async () => {
    const { result } = renderHook(() => useAiSearch(), { wrapper })
    act(() => {
      result.current.mutate({
        query: 'find Rahul',
        students: [{ id: 's1', name: 'Rahul Sharma', cls: '8', section: 'A', attendance: 91 }],
        attendanceHero,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.intent).toBe('StudentSearch')
    expect(result.current.data?.count).toBe(1)
  })

  it('resolves an unsupported query without throwing', async () => {
    const { result } = renderHook(() => useAiSearch(), { wrapper })
    act(() => {
      result.current.mutate({ query: 'play some music', students: [], attendanceHero })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.intent).toBe('Unsupported')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/hooks/useAiSearch.test.ts`
Expected: FAIL — cannot find module `./useAiSearch`.

- [ ] **Step 3: Implement**

Create `src/api/hooks/useAiSearch.ts`:
```ts
import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import {
  resolveAiQuery,
  type AiSearchResponse, type AiSearchStudent, type AiSearchAttendanceHero,
} from '@/lib/aiSearchResolver'

export interface AiSearchInput {
  query: string
  students: AiSearchStudent[]
  attendanceHero: AiSearchAttendanceHero
}

/** No network call yet — resolveAiQuery is local (see aiSearchResolver.ts). Wrapping it in a
 *  mutation now means the eventual swap to a real POST /v1/ai/search call only touches this
 *  file's mutationFn; every consumer already codes against loading/success/error states. */
export function useAiSearch(): UseMutationResult<AiSearchResponse, Error, AiSearchInput> {
  return useMutation({
    mutationFn: (input: AiSearchInput) =>
      Promise.resolve(resolveAiQuery(input.query, { students: input.students, attendanceHero: input.attendanceHero })),
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/api/hooks/useAiSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`

```bash
git add src/api/hooks/useAiSearch.ts src/api/hooks/useAiSearch.test.ts
git commit -m "feat(comms): add useAiSearch mutation hook over the local resolver"
```

---

### Task 3: Feature gating + mic icon

**Files:**
- Modify: `src/data/mockDb.ts:26` (the `FEATURE_TIER` map)
- Modify: `src/lib/gating.test.ts` (extend the existing `tierIncludes` test)
- Modify: `src/components/ui/Icon.tsx` (add a `mic` glyph)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 4 and Task 5): `FEATURE_TIER.ai_search === 'platinum'`; `<Icon name="mic" />`
  renders a microphone glyph instead of the fallback dot.

- [ ] **Step 1: Write the failing assertions**

In `src/lib/gating.test.ts`, inside the existing `it('tierIncludes respects tier order', ...)` test
(the one starting at line 23), add these lines right after the existing `attendance.geofence`
assertions (before the test's closing `})`):
```ts
    expect(tierIncludes('silver', 'ai_search')).toBe(false)
    expect(tierIncludes('gold', 'ai_search')).toBe(false)
    expect(tierIncludes('platinum', 'ai_search')).toBe(true)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/gating.test.ts`
Expected: FAIL on the `silver`/`gold` assertions — an unregistered feature key defaults to
`requiredTier` returning `'silver'`, which every tier (including `silver` and `gold`) satisfies, so
both currently resolve `true` instead of the expected `false`.

- [ ] **Step 3: Implement**

In `src/data/mockDb.ts`, change line 26 from:
```ts
  'attendance.geofence': 'platinum', 'transport.gps': 'platinum', 'support.dedicated': 'platinum',
```
to:
```ts
  'attendance.geofence': 'platinum', 'transport.gps': 'platinum', 'support.dedicated': 'platinum',
  ai_search: 'platinum',
```

In `src/components/ui/Icon.tsx`, add a `mic` entry to the `ICONS` map (anywhere among the other
entries, e.g. right after `phone:`):
```ts
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/gating.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`

```bash
git add src/data/mockDb.ts src/lib/gating.test.ts src/components/ui/Icon.tsx
git commit -m "feat(comms): gate ai_search to Platinum, mirroring sms-backend TierFeatures"
```

---

### Task 4: `AiSearchScreen` — voice/text chat UI

**Files:**
- Create: `src/screens/school/aiSearch.tsx`
- Test: `src/screens/school/aiSearch.test.tsx`

**Interfaces:**
- Consumes (from earlier tasks): `useAiSearch` (Task 2), `AiSearchResponse`, `StudentSearchRow`
  (Task 1), `FEATURE_TIER.ai_search`/`mic` icon (Task 3, exercised indirectly).
- Consumes (existing app code): `useStudents` (`@/api/hooks/useStudents`),
  `usePeriodAttendanceRangeSummary` (`@/api/hooks/usePeriodAttendanceAdvanced`),
  `classWiseDayHero` (`@/api/periodAttendanceAdvanced`), `useToast` (`@/lib/hooks`), UI primitives
  from `@/components/ui`.
- Produces (used by Task 5): `export function AiSearchScreen(): JSX.Element` — a self-contained
  screen with no required props (reads its own data via hooks).

- [ ] **Step 1: Write the failing tests**

Create `src/screens/school/aiSearch.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/context/ToastProvider'
import { AiSearchScreen } from './aiSearch'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetch() {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('/students')) {
      return Promise.resolve(jsonResponse({
        data: [
          {
            id: 's1', admission_no: 'A1', name: 'Rahul Sharma', gender: 'M', grade: '8',
            section: 'A', class_label: '8', roll: 1, guardian_name: 'G', guardian_phone: '1',
            attendance_pct: 91, fee_status: 'paid', fee_due: 0, status: 'active', house: 'Red',
            avatar_hue: 1,
          },
        ],
        next_cursor: null,
      }))
    }
    if (url.includes('/attendance/period-records/summary/range')) {
      return Promise.resolve(jsonResponse({
        data: { total_marked_periods: 12, present: 10, absent: 2, late: 0, leave: 0, attendance_percentage: 83 },
      }))
    }
    return Promise.resolve(jsonResponse({ data: {} }))
  })
}

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider><AiSearchScreen /></ToastProvider>
    </QueryClientProvider>,
  )
}

describe('AiSearchScreen', () => {
  it('shows the demo badge and an empty state before any question is asked', () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    expect(screen.getByText(/Local answers/i)).toBeInTheDocument()
    expect(screen.getByText(/Ask your first question/i)).toBeInTheDocument()
  })

  it('typing a question and pressing Ask renders an answer bubble', async () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    const input = screen.getByPlaceholderText(/How many students present today/i)
    fireEvent.change(input, { target: { value: 'find rahul' } })
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }))
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "rahul"/i)).toBeInTheDocument())
  })

  it('renders a data table for a list-type response', async () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    fireEvent.change(screen.getByPlaceholderText(/How many students present today/i), { target: { value: 'find rahul' } })
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }))
    await waitFor(() => expect(screen.getByText('Rahul Sharma')).toBeInTheDocument())
  })

  it('disables the mic button when SpeechRecognition is unavailable', () => {
    vi.stubGlobal('fetch', mockFetch())
    const original = (window as unknown as Record<string, unknown>).SpeechRecognition
    const originalWebkit = (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    renderScreen()
    expect(screen.getByRole('button', { name: /Speak/i })).toBeDisabled()
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = original
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = originalWebkit
  })

  it('passes the selected language to SpeechRecognition when starting to listen', () => {
    vi.stubGlobal('fetch', mockFetch())
    const instances: { lang: string; start: () => void }[] = []
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: unknown) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null
      start = vi.fn()
      stop = vi.fn()
      constructor() { instances.push(this) }
    }
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'हिंदी' }))
    fireEvent.click(screen.getByRole('button', { name: /Speak/i }))
    expect(instances).toHaveLength(1)
    expect(instances[0].lang).toBe('hi-IN')
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/aiSearch.test.tsx`
Expected: FAIL — cannot find module `./aiSearch`.

- [ ] **Step 3: Implement**

Create `src/screens/school/aiSearch.tsx`:
```tsx
/* ============================================================
   SchoolMate — AI Mode: voice/text natural-language search over
   already-live student/attendance data. Local resolver today
   (see aiSearchResolver.ts); same response shape the future
   POST /v1/ai/search backend will return. Platinum-gated by the
   caller (CommunicationScreen wraps this in <TierGate feature="ai_search">).
   ============================================================ */
import { useMemo, useRef, useState } from 'react'
import {
  PageHead, Card, Btn, Badge, Segmented, Input, DataTable, DemoBadge, Empty,
  type Column,
} from '@/components/ui'
import { useToast } from '@/lib/hooks'
import { useStudents } from '@/api/hooks/useStudents'
import { usePeriodAttendanceRangeSummary } from '@/api/hooks/usePeriodAttendanceAdvanced'
import { classWiseDayHero } from '@/api/periodAttendanceAdvanced'
import { useAiSearch } from '@/api/hooks/useAiSearch'
import type { AiSearchResponse, StudentSearchRow } from '@/lib/aiSearchResolver'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Minimal local typing for the Web Speech API — not declared in TS's default DOM lib. */
interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface ChatTurn { id: number; query: string; response: AiSearchResponse }

function isStudentRows(data: AiSearchResponse['data']): data is StudentSearchRow[] {
  return Array.isArray(data)
}

const STUDENT_COLUMNS: Column<StudentSearchRow>[] = [
  { key: 'name', label: 'Student', render: (r) => r.name },
  { key: 'className', label: 'Class', render: (r) => `${r.className}${r.section ? '-' + r.section : ''}` },
  { key: 'attendancePct', label: 'Attendance', render: (r) => (r.attendancePct == null ? '—' : `${r.attendancePct}%`) },
]

export function AiSearchScreen() {
  const toast = useToast()
  const [lang, setLang] = useState<'en' | 'hi'>('en')
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const turnId = useRef(0)

  const studentsQ = useStudents()
  const today = todayIso()
  const attendanceQ = usePeriodAttendanceRangeSummary({ preset: 'custom', from: today, to: today })
  const hero = useMemo(() => classWiseDayHero({ range: attendanceQ.data }), [attendanceQ.data])
  const search = useAiSearch()

  const speechCtor = getSpeechRecognitionCtor()
  const micSupported = speechCtor != null

  const submit = (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    const students = (studentsQ.data ?? []).map((s) => ({
      id: s.id, name: s.name, cls: s.cls, section: s.section, attendance: s.attendance,
    }))
    search.mutate(
      { query: trimmed, students, attendanceHero: hero },
      {
        onSuccess: (response) => {
          turnId.current += 1
          setTurns((t) => [...t, { id: turnId.current, query: trimmed, response }])
          setText('')
        },
        onError: () => toast.danger('Search failed', 'Could not process that question. Try again.'),
      },
    )
  }

  const toggleMic = () => {
    if (!speechCtor) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const recognition = new speechCtor()
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      setText(event.results[0]?.[0]?.transcript ?? '')
    }
    recognition.onerror = () => {
      toast.danger('Voice input failed', 'Could not hear that — try typing instead.')
      setListening(false)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  return (
    <div>
      <PageHead
        title="AI Mode"
        sub="Ask a question about your school — by voice or text"
        actions={<DemoBadge label="Local answers — Claude-backed search coming soon" />}
      />
      <Card>
        <div className="row ai-center gap12 wrap" style={{ marginBottom: 16 }}>
          <Segmented
            value={lang}
            onChange={(v) => setLang(v as 'en' | 'hi')}
            options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिंदी' }]}
          />
          <Btn
            variant={listening ? 'danger' : 'secondary'}
            icon="mic"
            onClick={toggleMic}
            disabled={!micSupported}
            title={micSupported ? undefined : 'Voice input not available in this browser — type your question instead'}
          >
            {listening ? 'Listening…' : 'Speak'}
          </Btn>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. How many students present today?"
            style={{ flex: 1, minWidth: 240 }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(text) }}
          />
          <Btn variant="primary" icon="arrowRight" onClick={() => submit(text)} disabled={!text.trim() || search.isPending}>
            Ask
          </Btn>
        </div>

        {turns.length === 0 ? (
          <Empty icon="sparkle" title="Ask your first question" body='Try: "How many students present today?" or "Find Rahul".' />
        ) : (
          <div className="col gap16">
            {turns.map((t) => (
              <div key={t.id} className="col gap8">
                <div className="row jc-end"><Badge tone="brand">{t.query}</Badge></div>
                <div style={{ color: t.response.success ? undefined : 'var(--danger)' }}>{t.response.answer}</div>
                {isStudentRows(t.response.data) && t.response.data.length > 0 && (
                  <DataTable<StudentSearchRow>
                    columns={STUDENT_COLUMNS}
                    rows={t.response.data}
                    rowKey={(r) => r.studentId}
                    pageSize={5}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/screens/school/aiSearch.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`

```bash
git add src/screens/school/aiSearch.tsx src/screens/school/aiSearch.test.tsx
git commit -m "feat(comms): add AiSearchScreen — voice/text AI Mode UI"
```

---

### Task 5: Wire "AI Mode" into `CommunicationScreen`

**Files:**
- Modify: `src/screens/school/operations.tsx:120-141` (the `CommunicationScreen` function)
- Test: `src/screens/school/communicationAiMode.test.tsx`

**Interfaces:**
- Consumes (from Task 4): `AiSearchScreen` from `./aiSearch`.
- Consumes (existing): `TierGate` from `@/components/shell/gates` (already imported in
  `operations.tsx:21`).
- Produces: no new exports — `CommunicationScreen` (already exported via `'school.comm'` in the
  screen map at `operations.tsx:2237`) gains the AI Mode toggle.

- [ ] **Step 1: Write the failing test**

Create `src/screens/school/communicationAiMode.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { opsScreens } from './operations'

const CommunicationScreen = opsScreens['school.comm']

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function schoolResponse(tier: string) {
  return jsonResponse({
    data: [{
      id: 'school-1', name: 'Greenwood High', slug: 'greenwood', country: 'IN', status: 'active',
      plan_id: null, plan_name: tier, tier, mrr: 0, students_count: 0, staff_count: 0,
      storage_gb: 0, created: '2026-01-01', contact_name: null, contact_email: null,
      contact_phone: null, address: null, health_score: 100,
    }],
    next_cursor: null,
  })
}

function mockFetch(tier: string) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('/auth/refresh')) return Promise.resolve(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
    if (url.includes('/auth/me')) return Promise.resolve(jsonResponse({ data: { id: 'u1', tenant_id: 'school-1', roles: ['school.admin'], is_platform: false } }))
    if (url.includes('/me/schools') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(schoolResponse(tier))
    if (url.includes('/threads')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/complaints')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/students')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/attendance/period-records/summary/range')) {
      return Promise.resolve(jsonResponse({ data: { total_marked_periods: 0, present: 0, absent: 0, late: 0, leave: 0, attendance_percentage: null } }))
    }
    return Promise.resolve(jsonResponse({ data: {} }))
  })
}

function renderComms(tier: string) {
  vi.stubGlobal('fetch', mockFetch(tier))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider><CommunicationScreen /></ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  tokenStore.set({ access_token: 'a', refresh_token: 'r' })
  tokenStore.setEmail('admin@greenwood.edu')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('CommunicationScreen — AI Mode', () => {
  it('toggling AI Mode on a Platinum school replaces the tabs with AiSearchScreen', async () => {
    renderComms('platinum')
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
    expect(screen.queryByText('Messenger')).not.toBeInTheDocument()
  })

  it('toggling AI Mode on a non-Platinum school shows the upgrade veil, not the screen', async () => {
    renderComms('gold')
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Upgrade to Platinum/i)).toBeInTheDocument())
    expect(screen.queryByText(/Ask a question about your school/i)).not.toBeInTheDocument()
  })

  it('toggling AI Mode off restores the normal tabs', async () => {
    renderComms('platinum')
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Exit AI Mode/i }))
    expect(screen.getByText('Messenger')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/communicationAiMode.test.tsx`
Expected: FAIL — cannot find the "AI Mode" button role (`CommunicationScreen` doesn't render it
yet).

- [ ] **Step 3: Implement**

In `src/screens/school/operations.tsx`, add the import (near the other local imports, e.g. right
after the `TierGate` import on line 21):
```ts
import { AiSearchScreen } from './aiSearch'
```

Replace the `CommunicationScreen` function (currently lines 120-141):
```tsx
function CommunicationScreen() {
  const [tab, setTab] = useState('messenger')
  const [aiMode, setAiMode] = useState(false)
  const { data: threadsData } = useThreads()
  const { data: complaintsData } = useComplaints()
  const unread = (threadsData ?? []).reduce((n, t) => n + t.unread, 0)
  const openComplaints = (complaintsData ?? []).filter((c) => c.status !== 'resolved').length
  return (
    <div>
      <PageHead
        title="Communication"
        sub="Messenger · Complaints · Announcements"
        actions={
          <Btn variant={aiMode ? 'primary' : 'secondary'} icon="sparkle" onClick={() => setAiMode((v) => !v)}>
            {aiMode ? 'Exit AI Mode' : 'AI Mode'}
          </Btn>
        }
      />
      {aiMode ? (
        <TierGate feature="ai_search" title="AI Mode" blurb="Ask natural-language questions about your school on the Platinum plan.">
          <AiSearchScreen />
        </TierGate>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <Tabs value={tab} onChange={setTab} tabs={[
              { value: 'messenger', label: 'Messenger', icon: 'message', count: unread },
              { value: 'complaints', label: 'Complaints', icon: 'inbox', count: openComplaints },
              { value: 'announcements', label: 'Announcements', icon: 'bell' },
            ]} />
          </div>
          {tab === 'messenger' && <MessengerTab />}
          {tab === 'complaints' && <ComplaintsTab />}
          {tab === 'announcements' && <AnnouncementsTab />}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/screens/school/communicationAiMode.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Full verification and commit**

Run, in order:
```bash
npx vitest run
npx tsc -b
npm run build
```
Expected: all green, build succeeds.

```bash
git add src/screens/school/operations.tsx src/screens/school/communicationAiMode.test.tsx
git commit -m "feat(comms): wire AI Mode toggle into CommunicationScreen, Platinum-gated"
```

---

## Post-plan verification

After Task 5, run the full suite once more to confirm nothing elsewhere broke:
```bash
npm test
npm run typecheck
npm run build
```
All three commands must exit 0 before considering this plan complete.
