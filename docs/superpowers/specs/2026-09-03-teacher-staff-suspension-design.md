# Teacher & Staff Suspension

## Problem

Owner, Principal, and Admin need a way to temporarily block a teacher or
staff member's app login without deleting or unlinking their account —
reversible, distinct from "Remove access" (permanent) — and Principal
currently has no path to manage account access at all.

## Existing building blocks (reused, not duplicated)

- `Users.Status` already has `active` / `inactive` / `removed`.
  `inactive` already blocks login today via
  `AuthService.AccessBlockedError`, used by both password and OTP login
  (`src/Sms.Application/Services/Auth/AuthService.cs:70,120`).
- `UserService.SetActiveAsync` (`src/Sms.Application/Services/Users/UserService.cs:191-217`)
  already flips `active ↔ inactive`, reversibly, with guards against
  touching your own row or an owner's row.
- `UserService.ListAsync` (`UserService.cs:150-160`) already returns every
  `Users` row for the tenant, any role, gated to Admin/Owner
  (`IsSchoolAdmin()` in `UserController.cs:53-54`).
- Frontend `setUserActive` / `listSchoolUsers`
  (`sms-admin/src/api/users.ts:75-78,127-132`) — no change needed, the new
  UI calls these exact functions.
- Email-matching a `Teacher`/`Staff` row to a `Users` row is an existing
  pattern (`TryLinkTeacherUserIdAsync` / `TryLinkStaffUserIdAsync`,
  `Sms.Modules.Staffing/Data/StaffingRepositories.cs:107-109,239-241`) —
  reused client-side for display, not re-implemented.

## Explicitly out of scope

- Creating teacher/staff login accounts in the first place (today, People
  onboarding never creates a `Users` row — see
  `sms-admin/src/screens/school/admin.tsx:935`, "Teachers & staff use
  People → onboard form"). Suspend only acts on accounts that already
  exist by whatever means. Tracked as separate follow-up work.
- Any change to the existing Identity & Access screen
  (`admin.tsx` `IdentityScreen`/`UsersTab`) or its Deactivate / Activate /
  Remove access buttons — those keep working exactly as today, for
  exactly the roles that can reach them today (Admin/Owner, gated by
  `router.tsx:76`).
- Distinguishing Principal from Vice-Principal — both map to the same
  `school.principal` backend policy today (`Policies.Principal`), with no
  way to tell them apart. "Principal can suspend" therefore also means
  "Vice-Principal can suspend." This is an existing system limitation,
  not introduced by this change.

## Design

### 1. Backend RBAC (`Sms.Api` / `Sms.Application`)

`UserController` gains a third actor check alongside the existing
`IsSchoolAdmin()` / `IsSchoolOwner()`:

```csharp
private bool IsPrincipal() =>
    User.FindAll("role").Any(c => c.Value == Policies.Principal);
```

`IUserService.ListAsync` and `SetActiveAsync` each gain an `isPrincipal`
parameter:

- **`ListAsync(isSchoolAdmin, isPrincipal, ct)`**
  - 403 if neither is true (unchanged shape, widened condition).
  - Admin/Owner: unchanged — every row in the tenant.
  - Principal-only (not Admin/Owner): rows are filtered server-side to
    those whose `Roles` contains `school.teacher` or `staff` — a
    Principal never sees Admin/Owner/other-Principal accounts through
    this endpoint.

- **`SetActiveAsync(userId, active, isSchoolAdmin, isPrincipal, ct)`**
  - 403 if neither is true.
  - Admin/Owner: unchanged — may target any non-owner row, all existing
    guards (self, owner-row, must-already-be-accepted) unchanged.
  - Principal-only (not Admin/Owner): additionally requires the target
    row's `Roles` contains `school.teacher` or `staff`; otherwise 403
    `"Principals can only suspend teacher or staff accounts."` All other
    existing guards still apply.

`UserController`'s two call sites pass `IsPrincipal()` through:

```csharp
FromResult(await users.ListAsync(IsSchoolAdmin(), IsPrincipal(), ct));
...
FromResult(await users.SetActiveAsync(id, req.Active, IsSchoolAdmin(), IsPrincipal(), ct));
```

Tenant isolation is unaffected — both methods already scope through
`tenant.TenantId` via `dao.ListByTenantAsync(tid, ct)`; no change to that
scoping.

### 2. Backend login-block message (`AuthService`)

`AccessBlockedError` becomes role-aware at the two real login call sites
(password login line 70, OTP login line 120) — the two
candidate-*ordering* call sites (lines 692, 764, used only to sort
already-blocked accounts after usable ones during multi-school
disambiguation) keep calling it without roles, since they only need the
null/non-null result, not the exact wording.

```csharp
private static Error? AccessBlockedError(UserRecord user, IReadOnlyList<string>? roles = null) =>
    user.Status switch
    {
        "removed" => new Error("access_removed",
            "Your access to this school has been removed by the admin."),
        "inactive" when roles is not null && IsTeacherOrStaffRole(roles) =>
            new Error("access_suspended",
                "Your account has been suspended by your school. Please contact your school administrator."),
        "inactive" => new Error("access_inactive",
            "Your access to this school has been deactivated by the admin."),
        _ => null,
    };

private static bool IsTeacherOrStaffRole(IReadOnlyList<string> roles) =>
    roles.Any(r => string.Equals(r, Policies.Teacher, StringComparison.OrdinalIgnoreCase)
                 || string.Equals(r, Policies.Staff, StringComparison.OrdinalIgnoreCase));
```

The two login call sites fetch roles the same way the existing refresh
flow already does (`users.GetRolesAsync(userId, ct)`, see
`AuthService.cs:268-269`) before calling `AccessBlockedError(user, roles)`.

No change to `Users.Status` values, no migration needed — `suspended` is
a *presentation* concept (which message, who may toggle it, for which
target roles), not a new database state.

### 3. Frontend — Access card on Teacher/Staff profile drawers

`people.tsx`: both `TeacherProfile` and `StaffProfile` drawers get a new
"Access" card, visible only when `app.role` is `owner`, `admin`, or
`principal` (vice_principal included, per the indistinguishability note
above).

Data flow:
- Fetch `listSchoolUsers()` once per screen (Teachers screen / Staff
  screen), same call `admin.tsx` already makes.
- Match the open profile's `email` (case-insensitive) against the
  returned rows' `email` to find a linked account.
- No match → card shows "Not yet invited to the app", no button.
- Match found → show current status (`Active` / `Suspended` badge) and a
  `Suspend` / `Unsuspend` button that calls the existing `setUserActive`.

Because these two screens only ever show teachers or staff respectively,
there's no branching on target role for the button label — it's always
"Suspend"/"Unsuspend" here, distinct wording from `admin.tsx`'s
"Deactivate"/"Activate" (which is untouched).

On success: toast confirmation, update the local matched-row status so
the badge/button flip immediately without a full refetch.
On error (e.g. a Principal hitting the new 403 for a non-teacher/staff
target — shouldn't happen from this UI since it only ever shows
teacher/staff people, but the API could still reject for other reasons):
show the error message from the API, same pattern as `admin.tsx`'s
existing error handling.

### 4. Testing

Backend (new/updated unit tests near existing `UserService`/`AuthService`
tests):
- Principal may `SetActiveAsync` a teacher-role target → succeeds.
- Principal may `SetActiveAsync` a staff-role target → succeeds.
- Principal attempting `SetActiveAsync` an admin/principal/owner target →
  403.
- Admin/Owner behavior on `SetActiveAsync`/`ListAsync` unchanged (regression
  coverage for existing tests, no new cases needed if they already pass).
- Principal's `ListAsync` result excludes non-teacher/staff rows; Admin/
  Owner's is unfiltered.
- Login with `status="inactive"` and role `teacher`/`staff` → message is
  the new suspended wording, error code `access_suspended`.
- Login with `status="inactive"` and role `admin`/`principal`/`owner` →
  message is the existing unchanged wording.
- Login with `status="removed"` (any role) → unchanged message.

Frontend:
- `people.tsx`-style test: Access card shows for owner/admin/principal,
  hidden for other roles; shows "Not yet invited" when no email match;
  Suspend/Unsuspend button calls `setUserActive` and flips the badge.

Manual: run the app in Chrome, log in as a principal, open a teacher's
profile, suspend them, confirm the teacher's next login attempt shows the
exact required message; unsuspend, confirm login works again.
