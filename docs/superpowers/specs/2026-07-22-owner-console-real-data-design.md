# Owner Console real data — Users & roles

**Date:** 2026-07-22
**Status:** Approved design — ready for implementation plan
**Area:** `sms-admin` only (`src/screens/owner/workspace.tsx`). No backend changes — every
data need is already served by endpoints built for the school-level Identity & access
screen (`/v1/users`, `/v1/roles/permissions`, `/v1/invitations`, `/v1/school/audit`) plus
the existing school-switch endpoint (`/me/switch-school`).

## Problem

`OwnerUsers` ("Users & roles") is the school-**owner**'s portfolio-wide staff console —
distinct from the school-level "Identity & access" screen (already fully wired to real
data in prior work) and distinct from the separate CATRE/platform-staff console (backed
by `TeamController`, out of scope here — that manages SchoolMate's own internal team, not
a school owner's staff). `OwnerUsers` has 4 tabs, all still mock:

- **`TeamTab`** (`workspace.tsx:364`) — local `useState<TeamUser[]>([])`, seeded with only
  the logged-in owner. Invite/edit only mutate local state via `InviteModal`/`EditUserModal`
  callbacks, no API call.
- **`RolesTab`** (`workspace.tsx:622`) — a duplicate of the old school-level mock: local
  `clonePerms()` matrix, `save()` is a bare toast.
- **`InvitationsTab`** (`workspace.tsx:717`) — starts empty, resend/revoke mutate local
  state only.
- **`AuditTab`** (`workspace.tsx:772`) — hardcoded `AUDIT` array (`workspace.tsx:761-770`),
  the fake entries (Anil Mehta, Ravi Menon, etc.) the user is currently seeing.

## Goals

- All 4 tabs show and mutate real data for whichever of the owner's mapped schools they
  select — reusing the exact API modules/hooks already built for the school-level screen
  (`src/api/users.ts`, `src/api/roleTemplates.ts`, `src/api/invitations.ts`,
  `src/api/audit.ts` + their hooks), not new endpoints.
- A school picker, shared across all 4 tabs (one selection, not per-tab), sourced from
  the existing `usePortfolioSchools` list.
- Selecting a school calls the existing `switchSchool(tenantId)` mutation (mints a
  tenant-scoped JWT + sets `X-Tenant-Id`) so subsequent API calls are correctly scoped —
  reused directly, without the fuller `enterSchool` navigation (the owner stays in the
  Owner Console; `enterSchool`/`exitToOwner` remain for the separate "manage this school
  as if I were its admin" flow already used elsewhere, e.g. `portfolio.tsx`).
- Team invites and the Roles & Permissions matrix are scoped to **CRM roles only**:
  `admin`, `principal`, `vice_principal`, `teacher` — **`staff` is dropped** from both the
  Roles matrix columns and the Team invite role picker (staff are always onboarded via
  the separate People → onboard form, never through this console — this mirrors the
  existing "Send invite = CRM users" copy already in `TeamTab`, just now also excluding
  `staff` from the Roles matrix, per explicit decision).
- Each tab, before a school is selected, shows a "select a school" empty state instead of
  fetching anything.

## Non-goals (YAGNI)

- No Suspend/Restore on the Team tab — there is no deactivate/reactivate endpoint for
  school users anywhere in the backend today (confirmed: `dbo.User_SetStatus` exists but
  is only ever called internally by the invitation-revoke flow, not exposed as its own
  endpoint). Dropped from this pass; a real "deactivate a user" feature is separate,
  larger backend work.
- No cross-school aggregation — each tab shows one selected school's data at a time, not
  a merged view across the owner's whole portfolio. (Decided in brainstorming: the
  school-switch JWT mechanism already exists and works one-tenant-at-a-time; aggregating
  would need new backend endpoints and is out of scope.)
- No changes to the CATRE/platform-staff console (`TeamController`, `CatreRoles`) — that
  is a different persona/feature entirely, not touched by this spec.
- No new "recently added" or pending-acceptance concept beyond what `/v1/invitations`
  already computes (`pending`/`accepted`/`expired`/`revoked`) — this screen reuses that
  API's status semantics as-is.
- `EditUserModal`'s cross-school "scope" concept (a user's access spanning multiple
  schools, `workspace.tsx:551-563`) is out of scope for this pass — the real
  `setUserRoles`/`getUserPermissions`/`setUserPermissions` APIs are per-tenant (a user
  belongs to one tenant), so "scope" as multi-school is a mock-only concept with no real
  backend equivalent. `EditUserModal` is replaced by the same per-user permission editor
  already built for the school console (`UserAccessEditor` pattern), scoped to the
  currently-selected school only.

## Decisions (from brainstorming)

1. **Multi-school data fetching:** school picker, one school's real data fetched at a
   time via the existing `switchSchool` JWT mechanism — no new backend aggregation
   endpoints, no client-side merge-across-schools.
2. **Suspend/Restore:** removed from the Team tab (no backend to wire to).
3. **Roles matrix columns:** `admin`, `principal`, `vice_principal`, `teacher` — `staff`
   dropped.

## Design

### Shared school-selector state

Lift school selection up to `OwnerUsers` (`workspace.tsx:812`), replacing the bare
`Tabs`+tab-switch shell with a school picker that all 4 tab components receive as a prop:

```tsx
function OwnerUsers() {
  const [tab, setTab] = useState('team')
  const { data: clients = [] } = usePortfolioSchools(useApp().isPlatform)
  const schools = useMemo(() => clients.map((c, i) => clientToSchool(c, i)), [clients])
  const [schoolId, setSchoolId] = useState('')
  const switchSchool = useSwitchSchool()
  const [switching, setSwitching] = useState(false)

  const selectSchool = (id: string) => {
    if (!id || id === schoolId) { setSchoolId(id); return }
    setSwitching(true)
    switchSchool.mutate(id, {
      onSuccess: () => setSchoolId(id),
      onError: () => toast.danger('Could not switch school', 'Try again.'),
      onSettled: () => setSwitching(false),
    })
  }
  // ...render school <Select> + tabs; pass schoolId to each tab
}
```

Each tab receives `schoolId: string` as a prop. When `schoolId === ''`, every tab renders
a shared `<Empty icon="building" title="Select a school" body="Pick one of your mapped
schools above to manage its team, roles, invitations and activity." />` instead of
fetching. `switching` disables the picker and shows a small spinner next to it while a
switch is in flight (the JWT/tenant-id swap is a network round trip).

### `TeamTab`

Replace the local `team` state and `InviteModal`/`EditUserModal` mock callbacks with the
exact pattern from the school console's `UsersTab` (`admin.tsx`):

- Load: `listSchoolUsers()` (`@/api/users`) on mount and whenever `schoolId` changes.
- Invite: `useInviteUser()` restricted to `CRM_INVITE_ROLES` (`admin`, `principal`,
  `vice_principal` — already exported from `@/api/users`, no change needed there).
- Per-user role change: `setUserRoles(userId, [role])`.
- Per-user permission editor: reuse the `UserAccessEditor` component from `admin.tsx`
  (or extract it to a shared location if duplicating verbatim — decide at plan time based
  on file size; either is acceptable, prefer extraction if `admin.tsx` and this new code
  would otherwise duplicate >50 lines identically).
- "Onboard teacher"/"Onboard staff" buttons stay as-is (they already navigate to the real
  onboarding screens via `app.go(...)`, unrelated to this mock-data cleanup).
- Drop the Suspend/Restore column entirely (Non-goal #1).
- KPI cards (`Kard` components, `workspace.tsx:489-493`) recompute from the real fetched
  list instead of the local mock array.

### `RolesTab`

Reuse the school console's `RolesTab` pattern (`useRoleTemplate`/`useSetRoleTemplate`,
`applyTenantOverrides`/`matrixToOverrides` helpers) scoped to `schoolId`, with one
difference: the rendered role columns are `['admin', 'principal', 'vice_principal',
'teacher']` (a local constant in this file, not the shared `ROLES` which still includes
`staff` for the school console's own use) — `staff` is never rendered as a column here and
never included in the overrides payload sent to `setRoleTemplate`.

### `InvitationsTab`

Reuse the school console's `InvitationsTab` pattern (`listInvitations`,
`useResendInvitation`, `useRevokeInvitation`, pending-count scoping, retry-on-error)
scoped to `schoolId`, verbatim — no owner-specific differences from the school-level
version other than which tenant's JWT is active when the calls fire.

### `AuditTab`

Reuse the school console's `AuditTab` pattern (`useAuditLog`, cursor-based "Load more",
filter-resets-pagination) scoped to `schoolId`, verbatim.

## Testing

- `workspace.test.tsx` (existing, currently has the "Invite user" vs. "Send invite" label
  mismatch at line 68 — fixed as part of this plan, folded into whichever task touches
  `TeamTab`, since the plan will rewrite that component anyway) gets updated/extended
  coverage for: school-picker-gates-fetching (no fetch before a school is selected),
  switching schools re-fetches all 4 tabs' data, CRM-only invite roles, staff dropped from
  the Roles matrix, and each tab's loading/error/empty states (mirroring the equivalent
  school-level tests already written for `admin.tsx`/`identityOverrides.test.tsx`).
- No new backend tests — no backend changes.

## Files touched

**`sms-admin`:**
- `src/screens/owner/workspace.tsx` (edit — `OwnerUsers` shell gains the school picker;
  `TeamTab`, `RolesTab`, `InvitationsTab`, `AuditTab` all rewired to real data; mock
  `TeamUser`/`Invite`/`AuditRow`/`AUDIT` types and data removed)
- `src/screens/owner/workspace.test.tsx` (edit — new/updated coverage per Testing above,
  plus the pre-existing "Invite user"/"Send invite" label fix)
