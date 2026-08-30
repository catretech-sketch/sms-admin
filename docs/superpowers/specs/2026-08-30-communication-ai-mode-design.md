# Communication "AI Mode" — Design Spec

Status: Approved for planning
Date: 2026-08-30
Scope: Architectural (new cross-cutting subsystem, frontend side)

## 1. Objective

Add an "AI Mode" to the school Communication screen (`src/screens/school/operations.tsx`,
`CommunicationScreen`, currently tabbed Messenger · Complaints · Announcements) that lets
Platinum-plan schools ask natural-language questions — by voice (English or Hindi) or by typing —
and get answers backed by school data, via the backend's centralized AI Search API
(`POST /v1/ai/search`).

This is the frontend half of a feature whose backend contract already exists (not yet merged to
`main`) at `sms-backend/.worktrees/greet-by-id/docs/superpowers/specs/2026-08-28-ai-search-design.md`.
That spec is the source of truth for the API contract, intent catalog, authorization model, and
non-goals (no STT server-side, no writes, no streaming) — this document does not repeat or
re-derive those; it only covers what sms-admin builds against that contract.

Non-goals (explicitly out of scope for this iteration):
- Building or changing the backend AI Search endpoint itself (separate repo/branch, separate spec).
- Full 15-intent parity in the local responder — see §3 for the MVP subset.
- Persisting AI Mode chat history across sessions (in-memory only, per session).
- Any app/screen other than the school Communication screen (the backend is designed for every
  app to consume, but this iteration only wires the admin Communication page).
- Auto-detecting mixed Hindi/English speech; voice input requires an explicit EN/HI toggle.

## 2. UI: "AI Mode" full-page takeover

`CommunicationScreen` gains a header toggle, "AI Mode", next to the existing Messenger/Complaints/
Announcements `Tabs`. The toggle itself is gated by `TierGate feature="ai_search"` (Platinum-only,
same blurred lock-veil pattern used elsewhere, e.g. `staffAdd.tsx`, `transport.tsx`).

When AI Mode is on, the tab body is replaced entirely by a new `AiSearchScreen` component — the
Messenger/Complaints/Announcements tabs are hidden (not just visually behind the veil; the screen
genuinely swaps content, since the ask is for AI Mode to "take over" the page). Toggling AI Mode
off restores the normal tabbed view exactly as it was (tab state, unread counts, etc. are
untouched — AI Mode is a pure overlay of the screen's render, not a data-mutating mode).

`AiSearchScreen` (new file: `src/screens/school/aiSearch.tsx`):
- **Language toggle** (EN / HI) — a small `Segmented` control. Sets both the browser
  `SpeechRecognition` instance's `lang` (`en-IN` / `hi-IN`) and a `lang` hint included in the
  outgoing query payload (informational only — the backend's own `AiClassificationClient` still
  does its own language detection from the query text; this hint is not authoritative).
- **Mic button** — starts/stops `SpeechRecognition` (`webkitSpeechRecognition` fallback for
  Chromium). On final transcript, populates the text input (does not auto-submit — user can edit
  before sending). If the API is unavailable in the browser, or mic permission is denied, the mic
  button is disabled with a tooltip and the screen still fully works via typed text.
- **Text input + send** — always available regardless of voice support. Disabled while a request
  is in flight or the input is empty.
- **Chat-style transcript** — in-memory list of `{ query, response }` pairs for the current
  session only (no persistence, cleared on navigating away/reload). Each turn renders:
  - The user's query (right-aligned bubble).
  - The `answer` string (left-aligned bubble).
  - If the response's `data` is an array (list-type intent), a compact `DataTable`/card list below
    the answer bubble using the same `Column`-based table primitives already used elsewhere (e.g.
    `people.tsx`'s `Staff` columns) — rendered generically enough to handle the two MVP list
    shapes (§3) without a large bespoke renderer.
  - If `success: false`, an inline error bubble (distinct styling) instead of a normal answer.

## 3. Data flow & local responder (MVP)

This repo has already migrated most modules (Staff, Students, Threads, Complaints, …) off the old
`MockApi`/`mockDb` seam described in the README onto real backend calls (`src/api/staff.ts`,
`src/api/students.ts`, on branch `feat/school-api-binding`). Since the real `POST /v1/ai/search`
endpoint isn't merged to `sms-backend` `main` yet, this feature follows the established convention
for that situation (see `docs/superpowers/plans/2026-06-21-api-binding-phase6-gap-flagging.md`,
already used for the dashboard's synthetic KPI counts): compute the answer **client-side from
already-live, already-bound data**, and mark the surface with the existing `<DemoBadge />`
component rather than inventing a new mock-API class. There is no `api.aiSearch()` network call in
this iteration — it is a pure local function.

```
AiSearchScreen
  ├─ useStudents()                          — real, live-bound roster
  ├─ usePeriodAttendanceRangeSummary()      — real, live-bound attendance rollup (same hook the
  │                                           dashboard uses for its "students present today" tile)
  └─ useAiSearch() mutation (src/api/hooks/useAiSearch.ts)
       → resolveAiQuery(query, { students, attendanceRollup }): AiSearchResponse
         (src/lib/aiSearchResolver.ts — pure function, no I/O)
```

`useAiSearch` is a `useMutation` whose `mutationFn` wraps `resolveAiQuery` in `Promise.resolve(...)`
purely so the calling code (loading/error states, retry) is already written the same way it will be
once this becomes a real network call — swapping the mutation's body for a `request()` POST later
is the only change needed, no consumer code changes.

`AiSearchResponse` type (new, `src/api/aiSearch.ts`) mirrors the backend contract exactly:
```ts
interface AiSearchResponse {
  success: boolean
  language: 'en' | 'hi' | 'hinglish' | null
  intent: string | null
  answer: string | null
  data: unknown
  page?: number
  pageSize?: number
  count?: number
  hasNextPage?: boolean
  error?: { code: string; message: string }
}
```

**MVP intent subset**, `resolveAiQuery` matches in this order:
1. **Mutation-verb detection → `WriteBlocked`**: query contains a mutation verb ("mark", "delete",
   "update", "add", "remove", …) → fixed refusal answer, `data: null`, `success: true`. Matches the
   real backend's `WriteBlocked` behavior so the demo teaches the same UX as production.
2. **`DailyAttendanceSummary`**: query matches attendance-summary phrasing (English: "how many
   students present/absent today"; Hindi/Hinglish: "kitne bachche aaye", "aaj ki attendance") →
   computed by feeding the `usePeriodAttendanceRangeSummary()` rollup into the existing
   `studentLiveAttendance()` helper (`src/lib/studentLiveAttendance.ts`) — the exact real data the
   dashboard's student-attendance tile already shows — summary-type response
   (`data: { totalStudents, present, absent, attendancePercentage }`).
3. **`StudentSearch`**: query matches a "find/search <name>" or "<name> ka attendance/details"
   pattern → filters the real `useStudents()` roster by name substring (case-insensitive),
   list-type response (`data: [{ studentId, name, className, section, attendancePct }]`, where
   `attendancePct` is each student's real `Student.attendance` field).
4. **`Unsupported`** (fallback): anything not matched above → the exact generic message from the
   backend spec ("I couldn't understand that as a supported search. Try asking about attendance,
   students, exams, homework, subjects, or bus location.").

**Language heuristic** (local only, not authoritative): Devanagari Unicode range present → `hi`;
else a small keyword list of common Hindi/Hinglish words (`kitne`, `bachche`, `aaj`, `kya`, …)
present → `hinglish`; else `en`. This exists purely to exercise the `language` field in the UI —
the real backend's LLM-based detection replaces this entirely once wired to the real endpoint.

`AiSearchScreen`'s header carries a `<DemoBadge label="Local answers — Claude-backed search coming soon" />`
(reusing `src/components/ui/DemoBadge.tsx`), so it's visually clear — same as other not-yet-bound
surfaces in this app — that answers are computed locally, not by the real AI Search backend.

## 4. Feature gating

Add to `FEATURE_TIER` in `src/data/mockDb.ts`:
```ts
ai_search: 'platinum',
```
This exactly mirrors the backend's `TierFeatures.cs` (`FeatureCatalog.AiSearch` in the Platinum
set) — the backend file's own comment says it mirrors this map, so this entry keeps both sides in
sync by construction, not by convention alone. (`FEATURE_TIER` remains the one part of `mockDb.ts`
this feature touches — it is static gating configuration, not seeded entity data, and every other
gated feature in the app already reads it the same way via `tierIncludes()`.)

## 5. Error handling & UX states

- **Feature gate**: `TierGate feature="ai_search"` around the AI Mode toggle/screen — non-Platinum
  schools see the standard lock/upgrade veil; the toggle itself is still visible (consistent with
  how other gated tabs behave elsewhere in the app) but reveals the veil instead of the screen.
- **Mic unsupported / permission denied**: mic button disabled with a tooltip explanation; text
  input remains fully usable. Detected via `'webkitSpeechRecognition' in window ||
  'SpeechRecognition' in window` at mount, and via the recognition instance's `onerror` handler for
  permission denial after the fact.
- **No speech detected / STT error**: toast (`useToast().danger`), mic re-enabled, no crash.
- **`success: false`** (`AiSearchUnavailable`, `FeatureNotEnabled`, `InvalidRequest`): rendered as
  an inline error bubble in the transcript (keeps the failed question visible in context), not a
  global toast.
- **`WriteBlocked` / `Unsupported` / `Forbidden`**: rendered as ordinary answer bubbles — these are
  `success: true` responses per the backend contract, not errors.
- **Empty input**: send button and mic-driven auto-fill both require non-empty trimmed text before
  a request can be sent.

## 6. Testing

- `resolveAiQuery` (`src/lib/aiSearchResolver.ts`): unit tests per intent — attendance-summary math
  (via `studentLiveAttendance` given a fake rollup), student name matching (case-insensitive
  substring) against a fake student list, mutation-verb detection, fallback to `Unsupported`, and
  the language heuristic (Devanagari / Hindi keyword / plain English cases). Pure function, no
  React Query/mocking needed.
- `useAiSearch` hook: unit test the mutation wiring (loading/success/error) against a mocked
  `resolveAiQuery`.
- `AiSearchScreen` component tests (React Testing Library):
  - Platinum school renders the screen (with the `DemoBadge`); non-Platinum renders the `TierGate`
    veil instead.
  - Typing a query and pressing send renders a new answer bubble with the resolved response.
  - List-type response renders the compact data table below the answer.
  - Mic button is disabled and shows a tooltip when `SpeechRecognition` is absent from `window`.
  - Language toggle switches which `lang` value would be passed to `SpeechRecognition` (assert via
    a mocked recognition constructor, not real browser STT).
- No test exercises the real `.NET` endpoint — that one has its own integration test suite in
  `sms-backend` (per that repo's spec §12); this repo only tests its own local resolver + UI.

## 7. Future extension (not built now)

- Additional intents (`UpcomingExamSearch`, `HomeworkSearch`, etc.) can be added to
  `resolveAiQuery` incrementally without touching `AiSearchScreen` — it renders generically off
  `answer`/`data` shape, not per-intent UI.
- Swapping the local `resolveAiQuery` call for a real `POST /v1/ai/search` request (via
  `src/api/client.ts`'s `request()`, same pattern as `staff.ts`) is a contained change inside
  `useAiSearch`'s `mutationFn` plus removing the `DemoBadge` — no other screen code changes, since
  `AiSearchScreen` only ever consumes the `AiSearchResponse` shape, never the resolver internals.
- Extending AI Mode to other admin screens (dashboard, SIS, etc.) or other apps
  (`sms-teacher-app`, `sms-student`, `sms-staff`) is out of scope here; the backend already
  supports it, but each frontend wiring is its own future piece of work.
