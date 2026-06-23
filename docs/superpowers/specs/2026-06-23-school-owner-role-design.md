# School `owner` role for onboarded schools

**Date:** 2026-06-23
**Status:** Approved design (pre-plan)
**Repos:** `sms-backend` (RBAC, onboarding, data migration) and `sms-admin` (frontend role/gating).
**Related:** [`2026-06-23-owner-console-real-api-design.md`](./2026-06-23-owner-console-real-api-design.md) — `is_platform` console routing.

## Context

When the Catre platform admin (`is_platform = 1`) onboards a school via `POST /v1/clients`
(`ModuleEndpoints.cs`), the new tenant's founding account is created with `is_platform = false`
and the role `school.admin` (`Policies.SchoolAdmin`). Product intent is that this founding
account is the **owner of that school**, and its role should be **saved as `owner`**, not `admin`.

This is purely a role-naming/identity change for the school's top account. It is **not** a console
change: a school owner is still `is_platform = 0` and therefore lands on the **School Console**, not
the Catre **Owner Console** (which stays platform-only, gated by `is_platform`). The Catre platform
admin already carries an unrelated platform-level role string `owner` (from `PlatformAdminSeeder`);
the new school role is namespaced as `school.owner` so the two never collide — they are further
separated by `is_platform`.

## Goals

- Onboarding (`POST /clients`) saves the founding school account with a new **`school.owner`** role.
- `school.owner` has the **same powers** as `school.admin` (a renamed top role, no new privileges).
- The frontend recognizes `owner` as a first-class role: correct label, admin-equivalent gating,
  and it routes to the **School Console**.
- Migrate the **existing** founding `school.admin` accounts to `school.owner`.

## Non-goals

- No change to console routing. Owner Console remains `is_platform`-only.
- No new permissions or a role hierarchy above admin. `owner` powers ≡ `admin` powers.
- No rename of the Catre platform `owner` role string.
- No change to other school roles (`principal`, `vice_principal`/`school.principal`, `teacher`, `staff`).

## Architecture

### 1. Backend RBAC (`sms-backend`)

- **`Sms.Shared.Kernel/Authz/Policies.cs`** — add `public const string SchoolOwner = "school.owner";`
  and include it in `Policies.All`.
- **`Sms.Shared.Kernel/Authz/AuthorizationPolicies.cs`** — grant `school.owner` everywhere
  `school.admin` is granted, so powers are identical:
  - `SchoolAdmin` policy → `RequireRole(Policies.SchoolAdmin, Policies.SchoolOwner)`
  - `Principal` policy → `RequireRole(Policies.Principal, Policies.SchoolAdmin, Policies.SchoolOwner)`
  - `TeacherApp` policy → `RequireRole(Policies.Teacher, Policies.Principal, Policies.SchoolAdmin, Policies.SchoolOwner)`

### 2. Onboarding (`sms-backend`)

- **`Sms.Modules.Tenancy/ModuleEndpoints.cs`** (`POST /clients`, currently line ~73-74) — assign
  `Policies.SchoolOwner` instead of `Policies.SchoolAdmin` to the newly-provisioned founding user.
  Everything else (tenant creation, `is_platform = false`, onboarding card) is unchanged.

### 3. Data migration (`sms-backend`)

- A new FluentMigrator migration (next `M00xx`) runs a one-time data fix:
  `UPDATE dbo.UserRoles SET Role = 'school.owner' WHERE Role = 'school.admin';`
- Effect on current data: converts the two existing founding admins
  (`vaibhavdubey17@gmail.com`, `catre120@yopmail.com`) to `school.owner`. The teacher
  (`teacher.smoke@ktim.test`, role `school.teacher`) and the Catre platform admin (role `owner`,
  `is_platform = 1`) are not `school.admin` and are untouched.
- The migration writes under platform context (RLS bypass), consistent with other seed/migration writes.

### 4. Frontend role + gating (`sms-admin`)

- **`src/types/index.ts`** — add `'owner'` to the `Role` union; add an `owner` entry to `ROLE_META`
  (label "Owner", a short form, and a one-line description).
- **`src/context/AppProvider.tsx` (`finishLogin`)** — introduce an explicit backend→frontend role
  map so `school.owner` → `owner` (and, for clarity, `school.admin` → `admin`,
  `school.principal` → `principal`, `school.teacher` → `teacher`), defaulting unknown roles to
  `admin`. This is required: today `school.admin` only becomes `admin` via the unknown-default
  fallback, so without an explicit mapping `school.owner` would also wrongly default to `admin`.
- **`src/lib/gating.ts`** — treat `owner` as `admin` inside `can()` and `caps()` (normalize
  `owner` → `admin` before the `PERMS` lookup) so `owner` inherits the full admin permission matrix
  without duplicating every `PERMS[module]` entry.
- **Permission-matrix UI** (`src/screens/school/admin.tsx`, `src/screens/owner/workspace.tsx`) —
  these iterate `ROLE_META`, so the new `owner` role appears automatically; it renders with
  admin-equivalent capabilities via the gating normalization above.

## Identity & routing (unchanged, restated for safety)

- School `owner` ⇒ `is_platform = 0` ⇒ **School Console**.
- Catre platform admin ⇒ `is_platform = 1` ⇒ **Owner Console**.
- `applySession` keys the console off `is_platform` only; adding the `owner` role does not affect it.

## Testing

- **Backend (integration):** onboarding via `POST /clients` creates a user whose role is
  `school.owner`; that user satisfies the `SchoolAdmin`, `Principal`, and `TeacherApp` policies
  (proving "same powers"). A `school.owner` token does **not** satisfy the `platform` policy.
- **Backend (migration):** after the migration, no `school.admin` rows remain for the seeded data
  and the previously-admin accounts hold `school.owner`.
- **Frontend (`AppProvider.test.tsx`):** a `/auth/me` returning `roles: ['school.owner'],
  is_platform: false` maps to role `owner` and sets `consoleKind: 'school'` (School Console).
- **Frontend (`gating.test.ts`):** `can('owner', module, cap)` equals `can('admin', module, cap)`
  for every module/cap; `caps('owner', module)` equals `caps('admin', module)`.

## Risks / open questions

- **Role-string namespacing:** school `owner` is the string `school.owner`; the Catre platform role
  is the string `owner`. Distinct strings, further separated by `is_platform`. No collision.
- **Migration breadth:** the data migration converts *all* current `school.admin` rows. Today that
  is exactly the two founding accounts, which is intended. Future schools that add additional
  `school.admin` staff (post-migration) keep `school.admin`; only the onboarding-created founding
  account gets `school.owner`.
- **Cross-app consumers:** other frontends (`sms-staff`, `sms-student`, `sms-teacher-app`,
  `sms-catreadmin`) read roles from the same backend. A repo-wide search confirms none of them
  hardcode the `school.admin` string as a gating role — the only non-backend reference is this spec.
  A school owner would not sign into those staff/student/teacher surfaces anyway, so the rename does
  not affect them. (Re-verify before the migration ships.)
