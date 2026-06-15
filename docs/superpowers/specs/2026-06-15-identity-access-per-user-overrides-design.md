# Per-user permission overrides — Identity & access

**Date:** 2026-06-15
**Status:** Approved design — ready for implementation plan
**Area:** `src/screens/school/admin.tsx` (Identity & access), `src/lib/gating.ts`

## Problem

Today, access in the Identity & access screen is granted **role-wise only**. The
Roles & permissions tab edits a `module × role → capabilities` matrix (`PERMS` in
`src/data/mockDb.ts`), where every user of a role gets identical access and the
four roles are fixed (`admin`, `principal`, `vice_principal`, `teacher`).

In the Users tab each user has a role, but the row "Edit" button is a stub
(`toast.info('Edit access', 'Adjust role for {name}.')`). There is no way to make
one specific person's access differ from their role.

We want to **also** grant or revoke operations (View / Edit / Approve) **per
individual user (per-ID)** as an override layered on top of the role matrix.

## Goals

- Let an admin grant **or** revoke individual capabilities for a single user,
  relative to that user's role.
- Keep the role matrix as the baseline; overrides are sparse deltas, not a full
  copy.
- Make the override resolution logic pure and unit-testable.
- Surface, in the Users tab, which users deviate from their role.

## Non-goals (YAGNI)

- No rewire of live gating. `can()` / `RoleGate` and global `PERMS` are
  untouched. This is a **functional mock**, consistent with the rest of the
  Identity screen (the Roles & permissions tab itself only edits local state and
  toasts on save).
- No backend or persistence beyond on-screen React state.
- No new roles; no per-user editing of the **Owner** super-role (Owner stays a
  locked, full-access super-role and is not a subject of per-user overrides).
- Module set is unchanged: the same 12 modules as the role matrix are editable
  per user.

## Decisions (from brainstorming)

1. **Override model:** grant **and** revoke relative to the role. Each cell is
   tri-state.
2. **Entry point:** a modal opened from the existing Users-tab "Edit" button
   (reuses the `InviteModalContent` modal pattern already in the screen).
3. **Wiring depth:** functional mock — overrides persist in on-screen state and
   `Save` shows a toast; global gating is not rewired.
4. **Cell interaction:** click-to-cycle chip, reusing the `CapChip` look:
   `inherit → grant → revoke → inherit`.

## Data model

```ts
// Per capability, per module, per user.
type CellState = 'inherit' | 'grant' | 'revoke'

// Sparse: only non-inherit cells are stored.
// module key -> cap -> 'grant' | 'revoke'   (absent entry = inherit from role)
type UserOverrides = Record<string, Partial<Record<Cap, 'grant' | 'revoke'>>>
```

Override state lives in the **Users tab** as `Record<userId, UserOverrides>`,
seeded with 1–2 sample overrides so the feature is visible on first load (mirrors
how the rest of the Identity screen ships with mock data). Module keys and `Cap`
values reuse the existing `PERMS` / `types` definitions.

## Permission logic

New pure resolver in `src/lib/gating.ts`, sitting beside `caps()` and `can()` and
matching their signature style:

```ts
export function effectiveCaps(
  role: Role,
  module: string,
  overrides: UserOverrides,
): Cap[]
```

Algorithm:

1. Start from the role baseline: `caps(role, module)`.
2. Apply that module's overrides:
   - `'grant'` adds the cap if absent (idempotent if the role already has it).
   - `'revoke'` removes the cap if present (no-op if the role never had it).
3. Return caps in canonical `V → E → A` order.

This is the only real logic in the feature and is fully unit-testable in
isolation. (An `effectiveCan(role, module, cap, overrides)` convenience wrapper
may be added if the UI needs single-cap checks; optional.)

## UI / UX

### `UserAccessModal` (new, in `admin.tsx`)

Opened from the Users-tab row "Edit" button (replacing the current stub toast).
Same modal mechanics as `InviteModalContent`.

Contents:

- **Header:** avatar, name, email, role badge.
- **Module table:** one row per module (same 12 as the role matrix). Each row
  shows:
  - the module label + key (as the role matrix does),
  - the **role default** caps as faint reference,
  - three **click-to-cycle chips** (V / E / A) reusing the `CapChip` visual.
- **Chip states / colors:**
  - inherit → faint outline (shows the role default beneath),
  - grant → filled green,
  - revoke → red / strikethrough.
- **Effective hint:** each row indicates the resulting effective caps; a header
  counter shows **"N overrides"** for the user.
- **Footer:** `Reset` (revert to last-saved overrides for this user) and `Save`
  (commit to the Users-tab override state + success toast).

### Users tab signal

Users that have any override show a small badge on their row (e.g. `2 custom`)
so admins can spot who deviates from their role default.

### Audit log

Add a sample entry in the existing `AUDIT` list reflecting a per-user grant/revoke
(e.g. "Granted Edit · {user} · Fees") so the new action appears in the Audit tab.

## Testing

Follows existing patterns (`src/lib/gating.test.ts`, `*.test.tsx` with Testing
Library).

**Unit — `effectiveCaps`:**

- inherit (no overrides) returns the role's caps unchanged;
- `grant` adds a cap the role lacks;
- `revoke` removes a cap the role has;
- `grant` of a cap the role already has is a no-op (no duplicates);
- `revoke` of a cap the role never had is a no-op;
- result is ordered `V → E → A`.

**Component — `UserAccessModal` / Users tab:**

- "Edit" on a user row opens the modal;
- clicking a chip cycles `inherit → grant → revoke → inherit`;
- `Save` fires a success toast and the row's override badge reflects the new
  count;
- `Reset` reverts unsaved changes.

## Files touched

- `src/lib/gating.ts` — add `effectiveCaps` (and optional `effectiveCan`).
- `src/lib/gating.test.ts` — unit tests for the resolver.
- `src/screens/school/admin.tsx` — `UserAccessModal`, wire the Users-tab Edit
  button, override state + row badge, sample audit entry.
- `src/types/index.ts` — `CellState` / `UserOverrides` types (or co-located in
  `gating.ts` if preferred).
- New `*.test.tsx` for the modal interaction.
