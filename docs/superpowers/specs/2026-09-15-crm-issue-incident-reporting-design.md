# CRM Project 1 — Issue / Incident Reporting — Design

**Date:** 2026-09-15
**Status:** Draft, pending review
**Scope:** **sms-admin only.** No sms-backend or sms-staff changes. This project consumes an
external API contract owned by the sms-staff/sms-backend project (see
`sms-staff/docs/superpowers/specs/2026-09-15-issue-incident-reporting-design.md`), which was
confirmed (2026-09-15, cross-session check with the sms-staff agent) to be still unimplemented —
backend work has not started. This spec is contract-driven: it documents the agreed shapes and
does not invent behavior beyond them.

## 1. Objective

Give School Admin / Principal / School Owner a manager screen in sms-admin to view and act on
staff-reported operational issues (vehicle, student, route, safety, other) — a new, separate
concept from the existing Complaints feature. The CRM must be ready to consume the Issues API the
moment sms-staff/sms-backend ships it, without any mock/fake data standing in for it.

## 2. Existing CRM behavior (must remain unchanged)

- `Operations → Complaints` (`src/screens/school/operations.tsx`, `ComplaintsTab`) continues to
  work exactly as today: its own state, its own API (`src/api/complaints.ts`,
  `src/api/hooks/useComplaints.ts`), its own query keys, its own tests. No file shared between
  Complaints and Issues holds mutable cross-feature state.
- Route/pickup/GPS/attendance/leave/student-transport-mapping/fee functionality is untouched.

## 3. New Issues tab

Add an "Issues" tab inside `operations.tsx`, as a sibling to the existing Complaints tab (same
tab-bar mechanism already used there). New tab renders a self-contained `IssuesTab` component with
its own list state, filter state, and drawer state — no props/state shared with `ComplaintsTab`.

## 4. API contract (external, consumed as-is)

| Method | Path | Purpose | Caller-visible behavior |
| --- | --- | --- | --- |
| `GET` | `/v1/staff/issues` | List | Role-gated server-side: SchoolAdmin/Principal/SchoolOwner see all tenant issues; other roles see only their own. Optional `?status=` query param filters server-side. |
| `GET` | `/v1/staff/issues/{id}` | Detail | Same visibility rule as list. Includes `IssueNotes`. |
| `PATCH` | `/v1/issues/{id}` | Update | Manager-only (SchoolAdmin/Principal/SchoolOwner). Body: `{ status?, note? }`. No transition validation — any status may follow any status. |

**Documented ambiguities (flagged, not resolved unilaterally):**
- Exact wire field casing (camelCase vs snake_case) for the Issues/IssueNotes response is not
  finalized on the backend side yet. We follow the same `snakeToCamel`/`camelToSnake` mapper
  convention `complaints.ts` already uses, so either casing on the wire requires no client change
  beyond the mapper — this insulates us from that ambiguity.
- Whether `GET /v1/staff/issues/{id}` returns `notes` inline or requires a second fetch is not
  yet confirmed. We design `useIssue(id)` to expect `notes` inline (per the spec's stated
  behavior: "detail view including its IssueNotes"), with the mapper isolated so a follow-up
  fetch could be added later without changing the hook's public shape.
- Pagination shape (cursor vs offset) for the list endpoint is not specified beyond "same pattern
  as Complaints." We reuse `ListEnvelope` (`{ data, next_cursor }`) exactly as `complaints.ts`
  does, since that's the established convention and the spec says the list mirrors Complaints'
  existing pattern.

## 5. Data models (frontend, mapped from backend DTOs)

```ts
// src/api/issues.ts
export type IssueCategory = 'vehicle' | 'student' | 'route' | 'safety' | 'other';
export type IssuePriority = 'normal' | 'high' | 'emergency';
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface IssueNote {
  id: string;
  authorUserId: string;
  authorName?: string; // present if backend joins it; optional to tolerate absence
  note: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  tenantId: string;
  reporterUserId: string;
  reporterName?: string; // optional, same tolerance as above
  category: IssueCategory;
  title: string;
  description: string;
  priority: IssuePriority;
  status: IssueStatus;
  vehicleId?: string;
  routeId?: string;
  tripId?: string;
  photoBase64?: string; // e.g. "data:image/jpeg;base64,..."
  notes?: IssueNote[]; // present on detail fetch
  createdAt: string;
  updatedAt: string;
}

export interface UpdateIssueRequest {
  status?: IssueStatus;
  note?: string;
}
```

`reporterName`/`authorName` are marked optional because the backend spec does not confirm whether
the list/detail response joins user display names or only IDs — the UI falls back to showing the
raw id (truncated) if the name is absent, per §9 below, rather than assuming a shape.

## 6. List behavior

- `DataTable<Issue>` (existing component, `src/components/table/DataTable.tsx`), columns:
  Category, Title, Priority, Status, Reporter (name if present, else id), Created (formatted
  date/time).
- Row click opens the detail Drawer (§9).
- Empty state: `"No issues reported"`.
- Loading state: existing `Spinner`.

## 7. Server-side status filter

A `<Select>` of `open | in_progress | resolved | closed | (all)` drives the `status` param passed
to `useIssues({ status })`, which forwards it as `?status=` on the `GET /v1/staff/issues` call.
Changing the filter triggers a new server fetch (React Query key includes `status`); the full
issue set for a given status is never fetched client-side and then filtered.

## 8. Client-side title/description search

A `Search` input (existing component) filters the currently-loaded page of issues by substring
match against `title`/`description`, following the same ad-hoc `useMemo` pattern used elsewhere
(e.g. `classAttendanceOverview.tsx`). This operates only within the current server-filtered
result set — it does not replace or duplicate the server-side status filter.

## 9. Detail Drawer

Row click opens a `Drawer` (existing component, pattern modeled on `StaffProfile` in
`people.tsx`), showing:

- Category, Title, Description, Priority, Status, Reporter (name if present else id), Created
  date/time.
- Vehicle / Route / Trip: each rendered only when its id is present on the record; no empty
  "Vehicle: —" placeholder rows for absent fields.
- Photo: when `photoBase64` is present, rendered as `<img src={photoBase64} alt="Issue attachment" />`
  (never displayed as raw text). Absent → no photo section rendered at all.

## 10. IssueNotes timeline

Rendered inside the Drawer beneath the core fields: notes sorted newest-first, each showing
author (name if present else id), timestamp, and note text. Append-only — no edit/delete
affordance, since the backend contract defines no such operation.

## 11. Status update

A `<Select>` bound to `issue.status`, enabled only for manager roles (§13). On change, calls
`useUpdateIssue()` → `PATCH /v1/issues/{id}` with `{ status: newStatus }`. No client-side
transition restriction (any value may follow any value, per the backend spec). On success:
invalidate both the issue-detail query and the issues-list query, show a success toast. On
failure: toast, and the `<Select>` reverts to the last-known server value (no optimistic
false-success state).

## 12. Add-note flow

A textarea + "Add note" button inside the Drawer. Validation: non-empty, trimmed. Submitting
calls `useUpdateIssue()` → `PATCH /v1/issues/{id}` with `{ note: text }` (same mutation as status
update, per the single-endpoint contract — no separate notes endpoint invented). While pending:
button disabled, shows a submitting state. On success: clear the textarea, invalidate issue
detail (so the new note appears), show success toast. On failure: toast, textarea content is
preserved (not cleared) so the manager doesn't lose their draft.

## 13. RBAC

- Manager controls (status `<Select>`, Add-note form) are gated by
  `can(app.role, 'operations', 'E')`, mirroring the established call-site pattern at
  `people.tsx:466` (`const editable = can(app.role, 'sis', 'E')`). Visible only to
  SchoolAdmin/Principal/SchoolOwner, matching the backend's own manager gate.
- Non-manager roles who can reach the Issues tab at all (if their backend role permits list/detail
  view) see the same Drawer content, minus the status `<Select>` and Add-note form — a read-only
  view, not a hidden tab.
- This is UI convenience only. The backend's own `RoleChecks`/policy gate on `PATCH /v1/issues/{id}`
  remains the actual authorization boundary; the frontend never assumes an action is safe merely
  because a control is rendered.

## 14. Transport/Operations permission-gating fix (bundled, isolated)

Separate from the Issues data/API work: wire the existing `can()`/`PERMS` mechanism into
`transport.tsx` and `operations.tsx`, which currently gate only by plan tier (`TierGate`), not
role. This is additive — it does not touch backend authorization, does not introduce a new
permission concept, and reuses the exact `can(role, module, cap)` pattern from `gating.ts` and the
`PERMS` matrix from `mockDb.ts`. Scope: hide/disable actions that the `PERMS.operations` matrix
already defines per role (e.g. `admin: ['E']`, `staff: ['V','E']`) but that the UI currently
renders unconditionally. Tests added to prove the intended visibility per role (§16).

## 15. Loading / empty / error states

Standard existing conventions across list, detail, and both mutations:
`Spinner` (loading) → content or `Empty` (`"No issues reported"`) → toast on any mutation error,
using the existing `useToast()` hook. Retry uses React Query's built-in refetch (no custom retry
logic).

## 16. Testing strategy

- `src/api/issues.test.ts` — fetch-stubbed (per `src/test/setup.ts` convention), following
  `complaints.test.ts`'s shape: list (incl. `?status=` param assertion), detail (incl. notes
  mapping), update (status-only, note-only, and both), mapper round-trip, error-path assertions.
- `operations.test.tsx` (new — no test file exists for this screen today) covering the Issues tab:
  renders list, applies status filter (asserts the request URL includes `?status=`), applies
  client-side search, opens Drawer on row click, renders vehicle/route/trip/photo conditionally,
  renders notes newest-first, submits a note (success + failure paths), changes status (success +
  failure paths, including revert-on-failure), gated visibility of manager controls
  (SchoolAdmin/Principal/SchoolOwner see them; a Teacher/Staff-equivalent role in the test does
  not). Uses the `transportStudents.test.tsx` boilerplate (`renderScreen()` wrapping
  `QueryClientProvider`/`AppProvider`/`ToastProvider`, `makeFetch()` dispatcher extended for
  `/staff/issues`, `/staff/issues/:id`, `/issues/:id`).
- RBAC tests for the §14 Transport/Operations fix: per-role visibility assertions on the specific
  actions the `PERMS.operations` matrix already defines, added to existing or new test files for
  those screens.
- Existing Complaints tests (`operations.test.tsx` if any exist, `complaints.test.ts`) must
  continue passing unmodified — no shared fixtures with Issues tests.

## 17. E2E dependency (explicit, not fabricated)

At the time of this spec, the backend (`dbo.Issues`, `dbo.IssueNotes`, `IssueController`,
`IssueService`) does not exist. This project's completion state is: **CRM code complete, unit and
component tests passing against stubbed fetch responses, typecheck clean, production build
clean.** The full chain —
`staff creates issue → SQL Server → CRM retrieves same issue → manager changes status/adds note →
staff sees the update` — remains **pending** until sms-staff/sms-backend merges their
implementation and pings this session. No claim of working end-to-end integration will be made
before that happens.

## 18. Files expected to change

New:
- `src/api/issues.ts`
- `src/api/hooks/useIssues.ts`
- `src/api/issues.test.ts`
- `src/screens/school/operations.test.tsx` (new file — none exists today)

Modified:
- `src/screens/school/operations.tsx` (add `IssuesTab`, wire into existing tab bar)
- `src/screens/school/transport.tsx` (RBAC gating fix, §14)
- (possibly) a shared test file for transport RBAC visibility, or a new
  `src/screens/school/transport.test.tsx` if none exists — confirmed during implementation
  planning against the actual current state of that file.
- `src/api/queryKeys.ts` (add `issues`/`issue(id)` keys, isolated from `complaints`)

Not changed: `src/api/complaints.ts`, `src/api/hooks/useComplaints.ts`, any sms-backend or
sms-staff file, any database/migration/RLS artifact.

## 19. Explicit non-goals

- No changes to the Complaints feature, table, or API.
- No sms-backend or database changes of any kind.
- No status-transition validation rules (matches backend's stated MVP scope).
- No note edit/delete.
- No file upload beyond the single inline base64 photo the backend contract already defines.
- No new permission framework — only wiring the existing one into two screens that currently lack it.
- No fabricated end-to-end success claims while the backend is unimplemented.

## 20. Acceptance criteria

- Issues appears as a separate tab beside Complaints; Complaints is unchanged and its existing
  tests still pass.
- Issues has its own API module, hooks, and query keys, isolated from Complaints.
- List uses `DataTable<Issue>`; status filter is server-side (`?status=`); title/description
  search is client-side within the current result set.
- Detail opens in a Drawer; vehicle/route/trip/photo render only when present; photo renders as
  an `<img>`, never raw text.
- Notes render newest-first, append-only; Add Note and Status Update both go through
  `updateIssue()` → `PATCH /v1/issues/{id}`.
- Manager controls (status change, add note) are visible only to SchoolAdmin/Principal/SchoolOwner
  via the existing `can()`/`PERMS` mechanism; other viewer roles get a read-only Drawer.
- Transport/Operations role-gating gap is fixed using the existing `can()`/`PERMS` mechanism only.
- Loading/empty/error states follow existing CRM conventions.
- API tests, component tests, and RBAC visibility tests pass; full sms-admin test suite,
  TypeScript typecheck, and production build all pass.
- No sms-backend/database changes are made; no unrelated existing CRM functionality changes
  behavior.
- E2E integration is explicitly marked pending until sms-staff/sms-backend delivers the live
  contract — not claimed as done.
