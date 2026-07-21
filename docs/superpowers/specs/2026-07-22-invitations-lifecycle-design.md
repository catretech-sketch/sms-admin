# Invitations lifecycle — Identity & access

**Date:** 2026-07-22
**Status:** Approved design — ready for implementation plan
**Area:** `sms-backend` (new `Invitations` table/procs/controller, `UserService`,
`AuthService`), `sms-admin` (`src/api/invitations.ts`,
`src/api/hooks/useInvitations.ts`, `InvitationsTab` in
`src/screens/school/admin.tsx`)

## Problem

The Identity & access → Invitations tab is 100% local mock state
(`INITIAL_INVITES` in `admin.tsx`); "resend"/"revoke" only mutate that array and
toast, with no backend call.

On the backend, invites are not a first-class concept: `POST /v1/users`
(`UserService.InviteAsync`) creates the `Users` row immediately with
`Status = "active"` (no pending state), sends a 6-digit OTP email by reusing the
forgot-password pipeline (10-minute expiry — unusable for an email sitting in an
inbox), and there is no `Invitations` table, no list-pending endpoint, and no
resend/revoke endpoint.

## Goals

- A real `Invitations` table tracking each invite's lifecycle (invited /
  accepted / revoked / expired), tenant-scoped with RLS.
- `GET /v1/invitations`, `POST /v1/invitations/{id}/resend`,
  `POST /v1/invitations/{id}/revoke` backed by real procs.
- Invite links/codes valid for **24 hours** (up from the reused 10-minute OTP).
- Revoking deactivates the user (`Status = "revoked"`) but keeps the row for
  audit history.
- Invitations tab in `sms-admin` fully wired: list, resend, revoke, loading /
  empty / error states.

## Non-goals (YAGNI)

- No new "accept invite" endpoint — acceptance continues to go through the
  existing `POST /v1/auth/reset-password` (OTP) flow; we only add
  invitation-status bookkeeping on top of it.
- No change to how an invite is *created* (`POST /v1/users` stays the entry
  point) — this spec only adds tracking + resend/revoke + expiry, not a new
  create-invite endpoint.
- No SMS invite improvements — SMS sending remains `Console.WriteLine` (out of
  scope; email is the only real channel today).
- No changes to `TeamController`/platform-team invites — unrelated resource.

## Decisions (from brainstorming)

1. **Expiry:** 24 hours, tracked on the `Invitations` row itself
   (`ExpiresAt`), not by changing the shared OTP default (still 10 minutes for
   forgot-password). The invite OTP is generated with its own 24h expiry.
2. **Revoke behavior:** deactivate, don't delete — `Users.Status = "revoked"`,
   `Invitations.RevokedAt` set, outstanding OTP consumed so it can no longer be
   redeemed. Row stays for audit/history.
3. **Status is computed, not stored:** `pending` / `accepted` / `expired` /
   `revoked` derived from `AcceptedAt` / `RevokedAt` / `ExpiresAt` vs now, so
   there's no separate status column to keep in sync.

## Backend design (`sms-backend`)

### Schema

New migration `M0079_Invitations_Table.cs` (current latest is
`M0078_StudentBus_Tables.cs`), following the `M0044_Bus_Tables.cs` tenant-scoped
+ RLS pattern:

```csharp
Create.Table("Invitations")
    .WithColumn("Id").AsGuid().PrimaryKey().WithDefault(SystemMethods.NewSequentialId)
    .WithColumn("TenantId").AsGuid().NotNullable()
    .WithColumn("UserId").AsGuid().NotNullable()
    .WithColumn("Email").AsString(256).Nullable()
    .WithColumn("Phone").AsString(32).Nullable()
    .WithColumn("RoleLabel").AsString(64).NotNullable()
    .WithColumn("InvitedByUserId").AsGuid().Nullable()
    .WithColumn("InvitedAt").AsDateTime2().NotNullable().WithDefault(SystemMethods.CurrentUTCDateTime)
    .WithColumn("ExpiresAt").AsDateTime2().NotNullable()
    .WithColumn("AcceptedAt").AsDateTime2().Nullable()
    .WithColumn("RevokedAt").AsDateTime2().Nullable()
    .WithColumn("LastResentAt").AsDateTime2().Nullable();
Create.Index("IX_Invitations_Tenant").OnTable("Invitations").OnColumn("TenantId");
Create.ForeignKey().FromTable("Invitations").ForeignColumn("UserId")
    .ToTable("Users").ToColumn("Id");
```

Plus RLS security policy in the same migration, matching `M0044`'s
`rls.fn_tenant_predicate` filter/block predicate, reversed in `Down()`.

### Procs (`db/Sms.Migrations/procs/users/`)

- `Invitations_Create` — called from `UserService.InviteAsync` right after
  `dao.CreateUserAsync`, in the same flow (one new DAO call, not a new
  transaction boundary).
- `Invitations_ListByTenant` — join to `Users` for email/phone/role/name.
- `Invitations_GetById`
- `Invitations_MarkResent` — bumps `ExpiresAt` (+24h from now) and
  `LastResentAt`.
- `Invitations_MarkAccepted` — sets `AcceptedAt`.
- `Invitations_MarkRevoked` — sets `RevokedAt`.

### Service changes

- `IUserProvisioningDao` / `UserProvisioningDao`: add
  `CreateInvitationAsync`, `ListInvitationsByTenantAsync`,
  `GetInvitationAsync`, `MarkInvitationResentAsync`,
  `MarkInvitationAcceptedAsync`, `MarkInvitationRevokedAsync`.
- `UserService.InviteAsync`: after creating the user + roles, also creates the
  `Invitations` row and sets `Users.Status = "pending"` (was incorrectly
  defaulting to `"active"`).
- New `IInvitationService` / `InvitationService`:
  - `ListAsync(tenantId)` → maps rows to a response DTO with computed
    `status: "pending" | "accepted" | "expired" | "revoked"`.
  - `ResendAsync(tenantId, invitationId)` — guards: must be school admin, invite
    must not be accepted/revoked; generates a fresh OTP (24h expiry — requires
    adding an `expiry` parameter to `AuthService.SendInviteSetupAsync` /
    `OtpInsertAsync`, defaulted to the existing 10 minutes for forgot-password
    callers so that path is untouched), re-enqueues the invite email via the
    existing `IEmailQueue`, calls `MarkInvitationResentAsync`.
  - `RevokeAsync(tenantId, invitationId)` — guards as above; sets
    `Users.Status = "revoked"`, consumes any outstanding unexpired OTP for that
    user (mark it consumed so it can't be redeemed), calls
    `MarkInvitationRevokedAsync`. Returns 409 if already accepted/revoked.
- `AuthService.ResetPasswordAsync`: on success, if the user has a pending
  invitation (`AcceptedAt IS NULL AND RevokedAt IS NULL`), call
  `MarkInvitationAcceptedAsync` and set `Users.Status = "active"`.

### Controller

New `InvitationController` (`[Route("v1")]`, `[Authorize]`, manual
`IsSchoolAdmin()` check mirroring `UserController`):

- `GET /v1/invitations` → `InvitationService.ListAsync`
- `POST /v1/invitations/{id}/resend` → `InvitationService.ResendAsync`
- `POST /v1/invitations/{id}/revoke` → `InvitationService.RevokeAsync`

### Multi-tenancy

`TenantId` passed explicitly from `ITenantContext` into every service/DAO call,
plus RLS as defense in depth — same convention as `Users`/`UserPermissions`.

## Frontend design (`sms-admin`)

### `src/api/invitations.ts` (new)

DTOs + `listInvitations()`, `resendInvitation(id)`, `revokeInvitation(id)`,
following the `toX`/`fromX` mapper pattern in `src/api/users.ts`, using
`request`/`listRequest` from `src/api/client.ts`.

```ts
export interface Invitation {
  id: string
  email: string | null
  phone: string | null
  roleLabel: string
  invitedAt: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
}
```

### `src/api/hooks/useInvitations.ts` (new)

- `useInvitations()` — `useQuery` keyed on `queryKeys.invitations.list()`.
- `useResendInvitation()` / `useRevokeInvitation()` — `useMutation`, invalidate
  `queryKeys.invitations.all` on success, matching `useInviteUser` in
  `useUserMutations.ts`.

### `queryKeys.ts`

Add:
```ts
invitations: {
  all: ['invitations'],
  list: () => [...queryKeys.invitations.all, 'list'],
},
```

### `InvitationsTab` (`admin.tsx`)

- Replace `INITIAL_INVITES` + local `useState` with `useInvitations()`.
- Add loading skeleton, empty state ("No pending invitations"), and error state
  (retry button) — the tab currently has none of these since it was static mock
  data.
- `resend(id)` / `revoke(id)` call the mutation hooks; wrap in the existing
  try/catch → `toast.danger('...', e instanceof ApiError ? e.message : 'Try
  again.')` pattern used elsewhere in this file.
- Remove the inline `Invite` interface once the `Invitation` type from
  `src/api/invitations.ts` replaces it.
- Status badge rendering extends to the new `expired` state (not present in
  the current mock, which only had pending/sent-ish states).

## Testing

**Backend:**
- `UserServiceTests` — `InviteAsync` now also asserts an `Invitations` row is
  created and `Users.Status == "pending"`.
- New `InvitationServiceTests` — resend bumps `ExpiresAt`/`LastResentAt` and
  re-enqueues an email; resend/revoke on accepted/revoked invite returns a
  conflict; revoke sets `Users.Status == "revoked"` and consumes the OTP;
  `ResetPasswordAsync` on a pending invite sets `AcceptedAt` and flips
  `Users.Status` to `"active"`.
- Computed status mapping: a row with `ExpiresAt` in the past and no
  `AcceptedAt`/`RevokedAt` maps to `"expired"`.

**Frontend:**
- `src/api/invitations.test.ts` — request shape / mapper tests mirroring
  `staff.test.ts`.
- `admin.tsx` test updates — `InvitationsTab` loading / empty / error states,
  resend and revoke call the right mutation and show a toast, expired invites
  show a "Resend" action.

## Files touched

**`sms-backend`:**
- `db/Sms.Migrations/M0079_Invitations_Table.cs` (new)
- `db/Sms.Migrations/procs/users/Invitations_*.sql` (new, 6 procs)
- `src/Sms.Application/DTOs/Users/InvitationModels.cs` (new)
- `src/Sms.Application/Services/Users/UserService.cs` (edit `InviteAsync`)
- `src/Sms.Application/Services/Users/InvitationService.cs` (new) +
  `IInvitationService.cs` (new)
- `src/Sms.Application/Services/Auth/AuthService.cs` (edit
  `SendInviteSetupAsync` expiry param, `ResetPasswordAsync`)
- `src/Sms.Api/Controllers/InvitationController.cs` (new)
- `Sms.Api`/`Sms.Application` test projects — new/updated tests above

**`sms-admin`:**
- `src/api/invitations.ts` (new)
- `src/api/invitations.test.ts` (new)
- `src/api/hooks/useInvitations.ts` (new)
- `src/api/queryKeys.ts` (edit — add `invitations`)
- `src/screens/school/admin.tsx` (edit `InvitationsTab`, remove
  `INITIAL_INVITES`)
