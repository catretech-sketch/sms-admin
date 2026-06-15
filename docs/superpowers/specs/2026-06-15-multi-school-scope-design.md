# Multi-school access per user — Owner Users & roles

**Date:** 2026-06-15
**Status:** Approved design — ready for implementation plan
**Area:** `src/screens/owner/workspace.tsx` (Owner console → Users & roles → Team + Invite)

## Problem

In the Owner console, a teammate's `scope` is a single value — either `"All
schools"` or exactly one school name — set via a single `<Select>` in both the
Edit and Invite modals. In reality one admin may need access to **several
specific** schools (more than one, but not all). The current model can't express
that.

## Goal

Let a user's scope be **either** "All schools" **or** an explicit set of
one-or-more specific schools, settable from both the Edit and Invite modals and
shown compactly in the Team table.

## Non-goals (YAGNI)

- Functional mock only — scope lives in component state, like the rest of the
  screen. No live gating / route enforcement.
- Applies to the Owner **Users & roles** Team list and its Invite/Edit modals
  only. The role-permission matrix and the school-console screens are untouched.
- No backend / persistence beyond on-screen state.
- No new "school group" abstraction — just a set of school names.

## Decisions (from brainstorming)

1. **Selection model:** "All schools" OR a set of specific schools. Picking a
   specific school turns off "All schools"; picking "All schools" clears the
   specifics. Scope is never empty.
2. **Control:** a checkbox list (All schools + one row per school), replacing the
   single `<Select>`, in **both** the Edit and Invite modals.
3. Keep "All schools" as a distinct, first-class option (covers future tenants).

## Data model

`TeamUser.scope` changes from `string` to `string[]`:

- `['All schools']` — all tenants (the sentinel string `'All schools'` is kept so
  it matches the existing display text and avoids a separate enum).
- `['Greenwood Valley School', 'Delhi Public Academy']` — that specific set.
- Invariant: the array is non-empty, and the `'All schools'` sentinel is never
  mixed with specific school names (it's `['All schools']` alone, or a list of
  real names).

The 12 `TEAM` seed rows are updated to arrays. At least one seed user gets a
multi-school scope (e.g. an admin with two schools) so the feature is visible on
load.

`'All schools'` is defined once as a module constant (e.g.
`const ALL_SCHOOLS = 'All schools'`) and reused by the model, the control, and
the display helper.

## Scope helpers (pure, in `workspace.tsx`)

```ts
const ALL_SCHOOLS = 'All schools'

/** True when the scope grants every tenant. */
function isAllSchools(scope: string[]): boolean

/** Compact label for the table: "All schools" | "<name>" | "N schools". */
function scopeLabel(scope: string[]): string

/** Toggle a school in the working scope, enforcing the All-vs-specific rule
 *  and the non-empty invariant. Returns the next scope array. */
function toggleScope(scope: string[], school: string): string[]
```

`toggleScope` rules:
- toggling `ALL_SCHOOLS` on → `[ALL_SCHOOLS]`.
- toggling a specific school on while scope is `[ALL_SCHOOLS]` → `[school]`.
- toggling a specific school on/off otherwise → add/remove from the list.
- if removing the last specific school would empty the scope → fall back to
  `[ALL_SCHOOLS]` (never empty).

## UI / UX

### Scope control (shared component, used by Edit + Invite modals)

Replace the single scope `<Select>` with a `ScopePicker`:

- A `Field` labelled "Scope" containing a scrollable checkbox list.
- First row: **All schools** checkbox. When checked, the specific-school rows
  render unchecked/disabled (visually de-emphasised).
- One checkbox row per entry in `schools` (id + name), checked when present in
  the working scope.
- Checking a specific school clears "All schools"; checking "All schools" clears
  specifics. Backed by `toggleScope`.
- Reuses existing `Field` + native checkbox inputs styled to match the app.

`InviteModal` currently maps a single `<Select>` value (`'all'` / school id) to a
display string on submit; it switches to a working `string[]` scope seeded to
`[ALL_SCHOOLS]`, edited via `ScopePicker`, and passed through as-is.

`EditUserModal` seeds the `ScopePicker` from `user.scope` and saves the array
back via the existing `onSave`.

### Team table — Scope column

Render via `scopeLabel(u.scope)`:
- all → 🌐 (globe icon) **All schools**
- one → 🏢 (building icon) **{name}**
- many → 🏢 **N schools**, with `title={u.scope.join(', ')}` for the full list.

### Search

The Team search matches when the query hits the user name, email, **or any
school name in `scope`** (and "All schools").

## Testing (`workspace.test.tsx`)

- **Scope helpers (unit):** `isAllSchools`, `scopeLabel` (all / one / many), and
  `toggleScope` (all↔specific switching, add/remove, never-empty fallback).
- **Edit (component):** open editor → check two specific schools → Save → the
  user's row shows "2 schools"; checking a specific school clears "All schools".
- Update the existing edit + cancel component tests for the new checkbox control
  (they currently drive a `<Select>` for scope).

## Files touched

- `src/screens/owner/workspace.tsx` — `scope: string[]`, `ALL_SCHOOLS`,
  `isAllSchools` / `scopeLabel` / `toggleScope`, `ScopePicker`, updated
  `EditUserModal` + `InviteModal`, updated Scope column + search, updated `TEAM`
  seed data.
- `src/screens/owner/workspace.test.tsx` — helper unit tests + updated/new
  component tests.
