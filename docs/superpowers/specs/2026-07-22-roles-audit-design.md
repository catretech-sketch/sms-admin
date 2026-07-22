# Roles & Permissions template + Audit Log — Identity & access

**Date:** 2026-07-22
**Status:** Approved design — ready for implementation plan
**Area:** `sms-backend` (new `RoleTemplateOverrides` table/procs/service,
`UserService` audit instrumentation, new school-scoped audit read endpoint),
`sms-admin` (`src/api/roleTemplates.ts`, `src/api/audit.ts`, their hooks,
`RolesTab` + `AuditTab` in `src/screens/school/admin.tsx`, `gating.ts`)

## Problem

The Identity & access screen has 4 tabs. `Users` is fully backend-wired.
`Invitations` has its own approved plan (`2026-07-22-invitations-lifecycle-design.md`)
covering the remaining Controller/Service gap — not touched by this doc.

The other two tabs are 100% mock, with no backend at all:

- **`RolesTab`** edits a module × role capability matrix cloned from the static
  `PERMS` constant in `src/data/mockDb.ts`. `save()` only shows a toast — no
  API call, and the "customization" never survives a refresh.
- **`AuditTab`** searches a hardcoded static array. The backend does have an
  `AuditLog` table and insert proc, but it's used by exactly one platform
  service (`PlanUpgradeService`) and read only through a platform-only
  controller (`AuditController`, policy `"platform"`) — there is no
  school-scoped audit trail of admin actions (invites, role/permission
  changes, user lifecycle) at all today.

## Goals

- Owner/admin can override, per school, which capabilities each fixed role
  (`admin`, `principal`, `vice_principal`, `teacher`, `staff`) has in each
  module — persisted, not just a client-side toast.
- `effectiveCaps()` gains a middle layer: static `PERMS` default → tenant
  role-template override → per-user override (existing, unchanged, still
  highest precedence).
- A real, school-scoped audit trail: role changes, permission changes, user
  create/deactivate, and role-template updates are recorded and readable by
  that school's owner/admin.
- `AuditTab` and `RolesTab` fully wired: loading / empty / error states, no
  mock arrays left in `admin.tsx` for these two tabs.

## Rules

- **Owner is a system role, not editable.** Admin can customize permissions
  only for `admin`, `principal`, `vice_principal`, `teacher`, `staff` — the
  existing `GateRole` type (`Exclude<Role, 'owner'>`) already encodes this on
  the frontend; `RoleTemplateOverrides.Role` reuses the same constraint.
  `RoleTemplate_Set` rejects (400) any row where `Role = 'owner'` as defense
  in depth, not just relying on the frontend never sending one.
- Admin cannot assign or remove the Owner role from any user, and cannot
  change what Owner can do. This is already enforced today by
  `assignableSchoolRoles()` in `src/api/users.ts` (admin's assignable list
  excludes `owner`) — no change needed there, just confirming this design
  doesn't regress it.

## Non-goals (YAGNI)

- No fully custom/arbitrary roles — the 5 existing role names stay fixed; this
  is override-of-defaults, not a role catalog editor. (Decided in
  brainstorming: bigger scope, touches `Role` type everywhere, not needed to
  satisfy "owner can grant permissions.")
- No new audit table — reuse the existing `AuditLog` table and
  `AuditRepository`; no schema duplication for school vs. platform audit.
- No `invitation.resent` / `invitation.revoked` audit entries in this pass —
  there is no `InvitationService` yet (that's the other plan's job). Added as
  a small follow-up once that plan lands.
- No `user.created` / `user.deactivated` audit entries in this pass, despite
  being named in the original Goals — there is no standalone
  `CreateUserAsync`/deactivate-status service method to instrument (user
  creation happens only via `InviteAsync`, which has no dedicated audit
  action of its own yet either, and there is no admin-facing deactivate
  endpoint at all today). Adding these requires building that functionality
  first, which is out of scope here. Deferred alongside the `invitation.*`
  events above — added as a small follow-up once an invite/deactivate audit
  action is warranted.
- No audit entries for read-only actions (list/view) — only mutating actions.
- No UI to configure *which* actions get audited — the action list below is
  fixed in this pass.
- No app-wide enforcement of the tenant template through `can()`/`caps()` —
  those are called directly against `useApp().role` from 8+ screen files
  (sidebar visibility, route gates, feature gates) with no overrides object
  threaded through anywhere today. Wiring the template into all of those
  would mean loading template data into `AppProvider` and touching every call
  site — a much larger, separate change. This pass applies the tenant
  template only where `effectiveCaps()` is already used (the Users tab's
  per-user permission editor, its only real caller today besides tests).
  Server-side enforcement of the template (not just UI display) is the
  backend's job regardless, via the same DAO the editor reads from.

## Decisions (from brainstorming)

1. **Roles shape:** tenant-level override of the fixed 5 roles (not fully
   custom roles, not read-only).
2. **Audit storage:** reuse the existing `AuditLog` table/proc/RLS policy
   rather than a new school-specific table.

## Backend design (`sms-backend`)

### Roles & Permissions — schema

New migration `M00XX_RoleTemplateOverrides_Table.cs` (next number after latest
at implementation time), tenant-scoped + RLS, same shape as the existing
per-user override concept:

```csharp
Create.Table("RoleTemplateOverrides")
    .WithColumn("Id").AsGuid().PrimaryKey().WithDefault(SystemMethods.NewSequentialId)
    .WithColumn("TenantId").AsGuid().NotNullable()
    .WithColumn("Role").AsString(32).NotNullable()
    .WithColumn("Module").AsString(64).NotNullable()
    .WithColumn("Cap").AsString(1).NotNullable()   // 'V' | 'E' | 'A'
    .WithColumn("Effect").AsString(8).NotNullable() // 'grant' | 'revoke'
    .WithColumn("UpdatedAt").AsDateTime2().NotNullable().WithDefault(SystemMethods.CurrentUTCDateTime)
    .WithColumn("UpdatedByUserId").AsGuid().Nullable();
Create.Index("IX_RoleTemplateOverrides_Tenant").OnTable("RoleTemplateOverrides").OnColumn("TenantId");
```

Unique constraint on `(TenantId, Role, Module, Cap)` — one row per cell, same
pattern as the per-user `UserPermissions` override rows.

Plus RLS security policy in the same migration (`rls.fn_tenant_predicate`),
matching `M0044`'s pattern, reversed in `Down()`.

### Roles & Permissions — procs (`db/Sms.Migrations/procs/saas/`)

- `RoleTemplate_Get` — all override rows for `@TenantId`.
- `RoleTemplate_Set` — replace-style: delete all rows for the tenant, insert
  the provided set (JSON param), same convention as `UserPermissions_Set`.

### Roles & Permissions — service / controller

- `IRoleTemplateDao` / `RoleTemplateDao` (new, `src/Sms.Infrastructure/DAO/`):
  `GetAsync(tenantId)`, `SetAsync(tenantId, overrides, updatedByUserId)`.
- Add to `UserService` (or a new small `RoleTemplateService` if `UserService`
  is already large — decide at plan time by checking its current line count):
  `GetRoleTemplateAsync(tenantId)`, `SetRoleTemplateAsync(tenantId, overrides,
  actorUserId)` — same `isSchoolAdmin` guard as `SetPermissionsAsync`. On
  success, writes an `AuditLog` row (`Action = "role_template.updated"`,
  `Target = <module list or "all">`).
- Controller routes (add to `UserController` or a new `RoleTemplateController`
  — decide at plan time, matching whichever the service placement above
  picks): `GET /v1/roles/permissions`, `PUT /v1/roles/permissions`.

### Audit Log — read endpoint

- New method on the existing `AuditRepository`
  (`src/Sms.Modules.Tenancy/Data/CatreOpsRepositories.cs`) or a thin wrapper:
  `ListByTenantAsync(tenantId, cursor, filters)` — the repo already has
  `ListAsync`; this pass adds tenant-scoped filtering + cursor pagination if
  not already present.
- New controller method — either a new `SchoolAuditController` or a new route
  on an existing school-scoped controller (decide at plan time): `GET
  /v1/school/audit`, policy = school-admin (same as other Identity & access
  endpoints), **not** the existing `"platform"` policy. Supports query params
  `action`, `actor_id`, `from`, `to`, `cursor` to back the tab's search UI.
  Cursor-paginated response: `{ data: AuditEntryDto[], next_cursor }`.

### Audit Log — write points

Instrument these `UserService` methods to call `AuditRepository.InsertAsync`
after a successful mutation (actor = current user, tenant = current tenant):

| Method | Action | Target |
|---|---|---|
| `SetRolesAsync` | `user.role_changed` | target user id + new role |
| `SetPermissionsAsync` | `user.permissions_changed` | target user id |
| `CreateUserAsync` (or wherever a user row is first created, non-invite path) | `user.created` | new user id |
| Deactivate/status-change method (name TBD — locate at plan time) | `user.deactivated` | target user id |
| `SetRoleTemplateAsync` (new, above) | `role_template.updated` | module list |

## Frontend design (`sms-admin`)

### `src/api/roleTemplates.ts` (new)

```ts
export interface RoleTemplateOverride {
  role: GateRole
  module: string
  cap: Cap
  effect: 'grant' | 'revoke'
}
export async function getRoleTemplate(): Promise<RoleTemplateOverride[]>
export async function setRoleTemplate(overrides: RoleTemplateOverride[]): Promise<void>
```

Follows the `request`/`camelToSnake` pattern in `src/api/users.ts`.

### `src/api/audit.ts` (new)

```ts
export interface AuditEntry {
  id: string
  actorId: string | null
  actorName: string | null
  action: string
  target: string | null
  at: string
}
export async function listAuditLog(params?: {
  action?: string; actorId?: string; from?: string; to?: string; cursor?: string
}): Promise<{ data: AuditEntry[]; nextCursor: string | null }>
```

### Hooks

- `src/api/hooks/useRoleTemplates.ts` (new): `useRoleTemplate()` (query),
  `useSetRoleTemplate()` (mutation, invalidates the query key on success).
- `src/api/hooks/useAudit.ts` (new): `useAuditLog(params)` (query, refetch on
  filter change).
- `queryKeys.ts`: add `roleTemplate: { all: [...] }` and
  `audit: { list: (params) => [...] }`.

### `RolesTab` (`admin.tsx`)

- Replace `clonePerms()` seed with `useRoleTemplate()` data merged onto the
  static `PERMS` defaults (server overrides win) — mirrors how
  `effectiveCaps()` will merge them.
- `save()` calls `useSetRoleTemplate().mutate(...)` instead of a bare toast;
  success/error toast wraps the real mutation result.
- Add loading skeleton + error state (retry) — currently has neither since it
  was synchronous mock data.

### `AuditTab` (`admin.tsx`)

- Replace static `AUDIT` array with `useAuditLog({ action, actorId, from, to
})`; existing client-side search UI becomes the params passed to the hook
(debounced) instead of an in-memory filter.
- Add loading skeleton, empty state ("No activity yet"), error state (retry),
  and a "Load more" control wired to `nextCursor`.

### `gating.ts`

- `effectiveCaps()` (and the `caps()` it calls) needs a new optional
  `tenantOverrides: RoleTemplateOverride[]` parameter, applied between the
  static `PERMS` lookup and the per-user `overrides` layer already there.
  Callers that don't have tenant overrides loaded yet (e.g. very first paint)
  pass `[]` and get today's static behavior — no regression while the new
  data is loading.

## Testing

**Backend:**
- `RoleTemplateDaoTests` — get/set round-trip, replace semantics (setting a
  smaller override set removes the dropped rows).
- `UserServiceTests` — `SetRoleTemplateAsync` guards non-admin callers (403),
  writes an `AuditLog` row on success.
- `AuditRepositoryTests` (extend existing if present) — tenant-scoped list
  excludes other tenants' rows (RLS), cursor pagination returns correct
  `next_cursor`.
- `UserServiceTests` — `SetRolesAsync`/`SetPermissionsAsync` each now assert an
  `AuditLog` row is written with the right `Action`.

**Frontend:**
- `src/api/roleTemplates.test.ts`, `src/api/audit.test.ts` — request shape /
  mapper tests mirroring `staff.test.ts`.
- `src/lib/gating.test.ts` — `effectiveCaps()` with tenant overrides present:
  a tenant `grant` adds a capability the static default lacks; a tenant
  `revoke` removes one the static default has; per-user override still wins
  over a tenant override on the same cell.
- `admin.tsx` test updates — `RolesTab` save calls the mutation and shows a
  toast; `AuditTab` loading/empty/error states, filter changes refetch.

## Files touched

**`sms-backend`:**
- `db/Sms.Migrations/M00XX_RoleTemplateOverrides_Table.cs` (new)
- `db/Sms.Migrations/procs/saas/RoleTemplate_{Get,Set}.sql` (new)
- `src/Sms.Application/DTOs/Users/RoleTemplateModels.cs` (new)
- `src/Sms.Infrastructure/DAO/RoleTemplateDao.cs` +
  `src/Sms.Application/Interfaces/DAO/IRoleTemplateDao.cs` (new)
- `src/Sms.Application/Services/Users/UserService.cs` (edit — role template
  methods + audit instrumentation on existing methods)
- `src/Sms.Api/Controllers/UserController.cs` (edit — new routes, or a new
  `RoleTemplateController.cs` — decided at plan time)
- `src/Sms.Modules.Tenancy/Data/CatreOpsRepositories.cs` (edit —
  tenant-scoped/paginated list method if not already sufficient)
- `src/Sms.Api/Controllers/SchoolAuditController.cs` (new, or a new route on
  an existing controller — decided at plan time)
- Test projects — new/updated tests above

**`sms-admin`:**
- `src/api/roleTemplates.ts`, `src/api/roleTemplates.test.ts` (new)
- `src/api/audit.ts`, `src/api/audit.test.ts` (new)
- `src/api/hooks/useRoleTemplates.ts`, `src/api/hooks/useAudit.ts` (new)
- `src/api/queryKeys.ts` (edit — add `roleTemplate`, `audit`)
- `src/lib/gating.ts`, `src/lib/gating.test.ts` (edit — tenant override layer)
- `src/screens/school/admin.tsx` (edit `RolesTab`, `AuditTab`)
