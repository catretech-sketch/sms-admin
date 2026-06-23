# School `owner` Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the Catre platform admin onboards a school, the founding school account is saved with a new `school.owner` role that has the same powers as `school.admin`; existing founding admins are migrated to `owner`.

**Architecture:** Add a namespaced `school.owner` role on the backend that every `school.admin` authorization path also accepts (policies + inline checks), assign it at onboarding, and migrate existing rows. On the frontend, add `owner` as a first-class `Role` that displays as "Owner", routes to the School Console (it is `is_platform = false`), and inherits the admin permission matrix via a normalization in the gating layer.

**Tech Stack:** Backend — .NET 10 minimal APIs, Dapper, FluentMigrator, SQL Server, xUnit + FluentAssertions. Frontend — React 19 + TypeScript, Vite, Vitest.

## Global Constraints

- Backend role string for the school owner is exactly `school.owner` (namespaced; distinct from the Catre platform role string `owner`). Copy verbatim.
- A school owner is always `is_platform = false` → **School Console**. The Owner Console stays platform-only (`is_platform` claim). Do not change console routing.
- `owner` powers ≡ `admin` powers. No new privileges, no role hierarchy above admin.
- The two repos live side by side: backend at `D:\SMS\sms-project\sms-backend`, frontend at `D:\SMS\sms-project\sms-admin` (the cwd). Commit each repo separately.
- Run backend tests with: `dotnet test sms-backend/tests/Sms.Tests.Integration`. Run frontend tests with: `npm test` (from `sms-admin`).

---

## File Structure

**Backend (`sms-backend`):**
- Modify `src/Sms.Shared.Kernel/Authz/Policies.cs` — add the `SchoolOwner` constant.
- Modify `src/Sms.Shared.Kernel/Authz/AuthorizationPolicies.cs` — grant `school.owner` everywhere `school.admin` is granted.
- Modify `src/Sms.Api/Endpoints/UserEndpoints.cs` — accept `school.owner` in the inline admin check; keep it out of invitable roles.
- Modify `src/Sms.Modules.Tenancy/ModuleEndpoints.cs` — onboarding assigns `school.owner`.
- Create `db/Sms.Migrations/M0045_School_Owner_Role.cs` — one-time data migration.
- Create `tests/Sms.Tests.Integration/Authz/OwnerPolicyTests.cs` — owner-role authorization tests.
- Modify `tests/Sms.Tests.Integration/Catre/CatreClientsTests.cs` — assert onboarding saves `school.owner`.

**Frontend (`sms-admin`):**
- Modify `src/types/index.ts` — add `owner` to `Role`; add `GateRole`.
- Modify `src/data/mockDb.ts` — add `owner` to `ROLE_META`; re-key `ROLES`/`PERMS` to `GateRole`.
- Modify `src/screens/school/admin.tsx` — re-key `Matrix` to `GateRole`; `roleTone` handles `owner`.
- Modify `src/screens/owner/workspace.tsx` — re-key `Matrix` to `GateRole`.
- Modify `src/context/AppProvider.tsx` — map backend `school.*` roles to frontend roles in `finishLogin`.
- Modify `src/lib/gating.ts` — normalize `owner` → `admin` in `can()`/`caps()`.
- Modify `src/context/AppProvider.test.tsx` — owner login routes to School Console as role `owner`.
- Modify `src/lib/gating.test.ts` — `owner` caps equal `admin` caps.

---

## Task 1: Backend — `school.owner` role with admin-equivalent policies

**Files:**
- Modify: `sms-backend/src/Sms.Shared.Kernel/Authz/Policies.cs`
- Modify: `sms-backend/src/Sms.Shared.Kernel/Authz/AuthorizationPolicies.cs`
- Test: `sms-backend/tests/Sms.Tests.Integration/Authz/OwnerPolicyTests.cs` (create)

**Interfaces:**
- Produces: `Policies.SchoolOwner` (`const string` = `"school.owner"`), included in `Policies.All`.
- Produces: the `Principal` and `SchoolAdmin` and `teacher.app` authorization policies all accept a caller holding role `school.owner`.

- [ ] **Step 1: Write the failing test**

Create `sms-backend/tests/Sms.Tests.Integration/Authz/OwnerPolicyTests.cs`:

```csharp
using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Authz;
using Sms.Shared.Kernel.Time;
using Xunit;

namespace Sms.Tests.Integration.Authz;

[Collection("sql")]
public class OwnerPolicyTests(SqlServerFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", Key);
        });

    private static HttpClient TenantClient(WebApplicationFactory<Program> app, string[] roles)
    {
        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var token = jwt.IssueAccess(Guid.NewGuid(), Guid.NewGuid(), roles, isPlatform: false);
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        return client;
    }

    [Fact]
    public async Task Owner_role_has_admin_level_access_to_approvals()
    {
        await using var app = App();
        var client = TenantClient(app, [Policies.SchoolOwner]);
        (await client.GetAsync("/v1/approvals")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Owner_role_is_not_platform()
    {
        await using var app = App();
        var client = TenantClient(app, [Policies.SchoolOwner]);
        // /v1/clients is platform-only; a school owner must be forbidden.
        (await client.GetAsync("/v1/clients")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails to compile**

Run: `dotnet test sms-backend/tests/Sms.Tests.Integration --filter OwnerPolicyTests`
Expected: FAIL — build error, `Policies.SchoolOwner` does not exist.

- [ ] **Step 3: Add the `SchoolOwner` constant**

In `sms-backend/src/Sms.Shared.Kernel/Authz/Policies.cs`, add the constant and include it in `All`:

```csharp
namespace Sms.Shared.Kernel.Authz;

/// Canonical RBAC policy names mirroring the frontend permission matrices.
public static class Policies
{
    public const string PlatformOnly = "platform.only";          // Catre team
    public const string SchoolAdmin = "school.admin";
    public const string SchoolOwner = "school.owner";            // school's founding owner; admin-equivalent powers
    public const string Principal = "school.principal";
    public const string Teacher = "school.teacher";
    public const string Staff = "staff";
    public const string StudentOrParent = "student.parent";

    public static readonly string[] All =
        [PlatformOnly, SchoolAdmin, SchoolOwner, Principal, Teacher, Staff, StudentOrParent];
}
```

- [ ] **Step 4: Grant `school.owner` everywhere `school.admin` is granted**

In `sms-backend/src/Sms.Shared.Kernel/Authz/AuthorizationPolicies.cs`, add `Policies.SchoolOwner` to the three role-bearing policies:

```csharp
    public static IServiceCollection AddSmsAuthorization(this IServiceCollection services) =>
        services.AddAuthorizationBuilder()
            .AddPolicy("platform", p => p.RequireClaim("is_platform", "1"))
            .AddPolicy(Policies.SchoolAdmin, p => p.RequireRole(Policies.SchoolAdmin, Policies.SchoolOwner))
            .AddPolicy(Policies.Principal, p => p.RequireRole(Policies.Principal, Policies.SchoolAdmin, Policies.SchoolOwner))
            .AddPolicy(TeacherApp, p => p.RequireRole(Policies.Teacher, Policies.Principal, Policies.SchoolAdmin, Policies.SchoolOwner))
            .Services;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `dotnet test sms-backend/tests/Sms.Tests.Integration --filter OwnerPolicyTests`
Expected: PASS (both facts).

- [ ] **Step 6: Commit**

```bash
git -C sms-backend add src/Sms.Shared.Kernel/Authz/Policies.cs src/Sms.Shared.Kernel/Authz/AuthorizationPolicies.cs tests/Sms.Tests.Integration/Authz/OwnerPolicyTests.cs
git -C sms-backend commit -m "feat(authz): add school.owner role with admin-equivalent policies"
```

---

## Task 2: Backend — owner passes inline admin check; not invitable

**Files:**
- Modify: `sms-backend/src/Sms.Api/Endpoints/UserEndpoints.cs:17-18,64-65`
- Test: `sms-backend/tests/Sms.Tests.Integration/Authz/OwnerPolicyTests.cs` (extend)

**Interfaces:**
- Consumes: `Policies.SchoolOwner` from Task 1.
- Produces: a caller with role `school.owner` passes `IsSchoolAdmin`; `school.owner` is rejected as an invite/import role.

- [ ] **Step 1: Write the failing tests**

Append to `OwnerPolicyTests.cs` (inside the class):

```csharp
    [Fact]
    public async Task Owner_can_invite_a_school_user()
    {
        await using var app = App();
        var client = TenantClient(app, [Policies.SchoolOwner]);
        var resp = await client.PostAsJsonAsync("/v1/users",
            new { email = $"t{Guid.NewGuid():N}@x.com", phone = (string?)null, roles = new[] { Policies.Teacher } });
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Owner_role_is_not_invitable()
    {
        await using var app = App();
        var client = TenantClient(app, [Policies.SchoolOwner]);
        var resp = await client.PostAsJsonAsync("/v1/users",
            new { email = $"t{Guid.NewGuid():N}@x.com", phone = (string?)null, roles = new[] { Policies.SchoolOwner } });
        resp.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity); // 422 invalid role
    }
```

Add the required `using System.Net.Http.Json;` to the top of the file if not present.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test sms-backend/tests/Sms.Tests.Integration --filter OwnerPolicyTests`
Expected: FAIL — `Owner_can_invite_a_school_user` returns 403 (owner not recognized by `IsSchoolAdmin`); `Owner_role_is_not_invitable` returns 201 (owner currently invitable via `Policies.All`).

- [ ] **Step 3: Update the inline check and the invitable-roles set**

In `sms-backend/src/Sms.Api/Endpoints/UserEndpoints.cs`, change `AssignableRoles` to also exclude `SchoolOwner`, and `IsSchoolAdmin` to accept it:

```csharp
    private static readonly HashSet<string> AssignableRoles = new(
        Policies.All.Where(r => r != Policies.PlatformOnly && r != Policies.SchoolOwner),
        StringComparer.OrdinalIgnoreCase);
```

```csharp
    private static bool IsSchoolAdmin(HttpContext http) =>
        http.User.FindAll("role").Any(c => c.Value is Policies.SchoolAdmin or Policies.SchoolOwner);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test sms-backend/tests/Sms.Tests.Integration --filter OwnerPolicyTests`
Expected: PASS (all four facts).

- [ ] **Step 5: Commit**

```bash
git -C sms-backend add src/Sms.Api/Endpoints/UserEndpoints.cs tests/Sms.Tests.Integration/Authz/OwnerPolicyTests.cs
git -C sms-backend commit -m "feat(authz): school.owner passes admin checks, not invitable"
```

---

## Task 3: Backend — onboarding assigns `school.owner`

**Files:**
- Modify: `sms-backend/src/Sms.Modules.Tenancy/ModuleEndpoints.cs:72-74`
- Test: `sms-backend/tests/Sms.Tests.Integration/Catre/CatreClientsTests.cs` (extend)

**Interfaces:**
- Consumes: `Policies.SchoolOwner` from Task 1.
- Produces: `POST /v1/clients` with an `admin_email` creates a tenant user whose single role is `school.owner`.

- [ ] **Step 1: Write the failing test**

Append to `CatreClientsTests.cs` (inside the class). It reuses the file's existing `App()`, `PlatformClient`, `Data`, and `CreatePlanAsync` helpers, and reads the role straight from the DB under platform context (RLS bypass), mirroring `AuthFlowTests`:

```csharp
    [Fact]
    public async Task Onboarding_saves_the_founding_account_as_school_owner()
    {
        await using var app = App();
        var client = PlatformClient(app);
        var gold = await CreatePlanAsync(client, "Gold", "gold", 14999);

        var email = $"owner-{Guid.NewGuid():N}@greenwood.edu.in";
        await Data(await client.PostAsJsonAsync("/v1/clients", new
        {
            name = "Greenwood High", slug = $"greenwood-{Guid.NewGuid():N}", country = "Mumbai, MH",
            admin_name = "Priya Sharma", admin_email = email, plan_id = gold, trial_days = 14
        }), System.Net.HttpStatusCode.Created);

        var ctx = new Sms.Shared.Kernel.Tenancy.TenantContext();
        ctx.Set(null, Guid.NewGuid(), true); // platform context bypasses RLS on dbo.Users
        var factory = new Sms.Shared.Kernel.Data.SqlConnectionFactory(fx.ConnectionString, ctx);
        await using var c = await factory.OpenAsync();
        var roles = (await Dapper.SqlMapper.QueryAsync<string>(c,
            "SELECT ur.Role FROM dbo.UserRoles ur JOIN dbo.Users u ON u.Id = ur.UserId WHERE u.Email = @e",
            new { e = email })).ToList();

        roles.Should().ContainSingle().Which.Should().Be("school.owner");
    }
```

Add `using Dapper;` and `using Sms.Shared.Kernel.Data;` and `using Sms.Shared.Kernel.Tenancy;` to the top if not already present.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test sms-backend/tests/Sms.Tests.Integration --filter Onboarding_saves_the_founding_account_as_school_owner`
Expected: FAIL — the role is `school.admin`, not `school.owner`.

- [ ] **Step 3: Assign `school.owner` at onboarding**

In `sms-backend/src/Sms.Modules.Tenancy/ModuleEndpoints.cs`, change the role passed to `CreateUserAsync` in the `POST /clients` handler:

```csharp
            var row = await repo.CreateAsync(req);
            if (row is not null && (req.AdminEmail is not null || req.AdminPhone is not null))
                await users.CreateUserAsync(row.Id, req.AdminEmail, req.AdminPhone, false,
                    new[] { Sms.Shared.Kernel.Authz.Policies.SchoolOwner });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test sms-backend/tests/Sms.Tests.Integration --filter Onboarding_saves_the_founding_account_as_school_owner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C sms-backend add src/Sms.Modules.Tenancy/ModuleEndpoints.cs tests/Sms.Tests.Integration/Catre/CatreClientsTests.cs
git -C sms-backend commit -m "feat(onboarding): save founding school account as school.owner"
```

---

## Task 4: Backend — migrate existing `school.admin` rows to `school.owner`

**Files:**
- Create: `sms-backend/db/Sms.Migrations/M0045_School_Owner_Role.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure data migration).
- Produces: every existing `dbo.UserRoles` row with `Role = 'school.admin'` becomes `Role = 'school.owner'`.

- [ ] **Step 1: Create the migration**

Create `sms-backend/db/Sms.Migrations/M0045_School_Owner_Role.cs` (migration number 45 — current highest is 44):

```csharp
using FluentMigrator;

namespace Sms.Migrations;

[Migration(45, "School owner role: convert existing founding school.admin rows to school.owner")]
public sealed class M0045_School_Owner_Role : Migration
{
    public override void Up() =>
        Execute.Sql("UPDATE dbo.UserRoles SET Role = N'school.owner' WHERE Role = N'school.admin';");

    public override void Down() =>
        Execute.Sql("UPDATE dbo.UserRoles SET Role = N'school.admin' WHERE Role = N'school.owner';");
}
```

- [ ] **Step 2: Build the migrations project to verify it compiles**

Run: `dotnet build sms-backend/db/Sms.Migrations`
Expected: Build succeeded.

- [ ] **Step 3: Apply migrations to the dev database**

The integration-test fixture (`SqlServerFixture`) applies all migrations to its own DB automatically — running the test suite from earlier tasks already exercised the runner. To apply to the dev DB, run the project's migrate command:

Run: `dotnet run --project sms-backend/db/Sms.Migrations -- up` (use the repo's documented migrate command if it differs; check `MigrateCli.cs`).
Expected: migration 45 applied, no errors.

- [ ] **Step 4: Verify the data converted**

Run (PowerShell/Bash):
```
sqlcmd -S DESKTOP-TJL4SG6 -d Sms -E -C -W -s "|" -Q "EXEC sp_set_session_context @key=N'IsPlatform', @value=1; SELECT ur.Role, COUNT(*) AS n FROM dbo.UserRoles ur GROUP BY ur.Role ORDER BY ur.Role;"
```
Expected: a `school.owner` row exists (the 2 previously-`school.admin` founding accounts); no `school.admin` rows remain for the current seed data.

- [ ] **Step 5: Commit**

```bash
git -C sms-backend add db/Sms.Migrations/M0045_School_Owner_Role.cs
git -C sms-backend commit -m "feat(db): migrate existing school.admin founders to school.owner"
```

---

## Task 5: Frontend — add `owner` role, label, and narrow matrix types

**Files:**
- Modify: `sms-admin/src/types/index.ts:7`
- Modify: `sms-admin/src/data/mockDb.ts:29-36`
- Modify: `sms-admin/src/screens/school/admin.tsx:270-271,463`
- Modify: `sms-admin/src/screens/owner/workspace.tsx:348`

**Interfaces:**
- Produces: `Role` union includes `'owner'`; `GateRole = Exclude<Role, 'owner'>`; `ROLE_META.owner` exists; `ROLES`/`PERMS`/`Matrix` are keyed by `GateRole` (the four non-owner roles).

- [ ] **Step 1: Add `owner` to `Role` and define `GateRole`**

In `sms-admin/src/types/index.ts`, line 7:

```ts
export type Role = 'owner' | 'admin' | 'principal' | 'vice_principal' | 'teacher'
/* Roles that appear in the permission matrix (everything except the owner alias).
   `owner` is intentionally excluded — it inherits the admin row via gating normalization. */
export type GateRole = Exclude<Role, 'owner'>
```

- [ ] **Step 2: Add the `owner` label and re-key `ROLES`/`PERMS`**

In `sms-admin/src/data/mockDb.ts`, update the imports to include `GateRole`, add the `owner` entry to `ROLE_META`, and re-type `ROLES` and `PERMS`:

```ts
// in the type import line at the top of mockDb.ts, add GateRole alongside Role:
//   import type { ..., Role, GateRole, ... } from '@/types'

export const ROLES: GateRole[] = ['admin', 'principal', 'vice_principal', 'teacher']
export const ROLE_META: Record<Role, RoleMeta> = {
  owner: { label: 'Owner', short: 'OW', desc: 'School owner — full control of this school' },
  admin: { label: 'Admin', short: 'AD', desc: 'Day-to-day setup & data entry' },
  principal: { label: 'Principal', short: 'PR', desc: 'Final approver + all reports' },
  vice_principal: { label: 'Vice-Principal', short: 'VP', desc: 'Academic owner, no financial authority' },
  teacher: { label: 'Teacher', short: 'TE', desc: 'Marks, attendance & homework for own classes' },
}
export const PERMS: Record<string, Record<GateRole, Cap[]>> = {
```

(Leave every `PERMS` module row exactly as it is — they already list the four `GateRole` keys.)

- [ ] **Step 3: Re-key the interactive `Matrix` type and handle `owner` in `roleTone`**

In `sms-admin/src/screens/school/admin.tsx`, import `GateRole`, change the `Matrix` type (line 463), and extend `roleTone` (line 270-271) so an owner badge matches admin:

```ts
// add GateRole to the type import from '@/types'
type Matrix = Record<string, Record<GateRole, Cap[]>>
```

```ts
const roleTone = (r: Role): BadgeTone =>
  r === 'principal' ? 'success' : r === 'vice_principal' ? 'brand'
    : r === 'admin' || r === 'owner' ? 'info' : 'neutral'
```

In `sms-admin/src/screens/owner/workspace.tsx`, import `GateRole` and change the `Matrix` type (line 348):

```ts
type Matrix = Record<string, Record<GateRole, Cap[]>>
```

(The `clonePerms` literals `{ admin: [], principal: [], vice_principal: [], teacher: [] }` in both files remain valid — they hold exactly the four `GateRole` keys.)

- [ ] **Step 4: Run the typecheck and the test suite to verify nothing broke**

Run (from `sms-admin`): `npm run typecheck && npm test`
Expected: typecheck passes; all existing tests pass (no behavior change yet).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/data/mockDb.ts src/screens/school/admin.tsx src/screens/owner/workspace.tsx
git commit -m "feat(roles): add owner role + label, narrow permission matrix to GateRole"
```

---

## Task 6: Frontend — map `school.owner` → `owner` and inherit admin gating

**Files:**
- Modify: `sms-admin/src/context/AppProvider.tsx:157-164`
- Modify: `sms-admin/src/lib/gating.ts:18-26`
- Test: `sms-admin/src/context/AppProvider.test.tsx` (extend)
- Test: `sms-admin/src/lib/gating.test.ts` (extend)

**Interfaces:**
- Consumes: `Role` (incl. `owner`) and `GateRole` from Task 5.
- Produces: a `/auth/me` role of `school.owner` maps to frontend role `owner` and `consoleKind: 'school'`; `can('owner', …)`/`caps('owner', …)` equal the `admin` results.

- [ ] **Step 1: Write the failing tests**

Append to `sms-admin/src/context/AppProvider.test.tsx` (inside the `describe('AppProvider auth', …)` block):

```tsx
  it('a school.owner account routes to the school console as role owner', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['school.owner'], is_platform: false } })))
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('owner@greenwood.edu', 'pw') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.role).toBe('owner')
    expect(result.current.consoleKind).toBe('school')
    expect(result.current.view).toBe('school.dashboard')
  })
```

Append to `sms-admin/src/lib/gating.test.ts` (inside `describe('gating', …)`):

```ts
  it('owner inherits the admin permission matrix', () => {
    for (const mod of ['setup', 'sis', 'academics', 'fees', 'dashboard']) {
      expect(caps('owner', mod)).toEqual(caps('admin', mod))
      for (const cap of ['V', 'E', 'A'] as const)
        expect(can('owner', mod, cap)).toBe(can('admin', mod, cap))
    }
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `sms-admin`): `npm test -- AppProvider gating`
Expected: FAIL — owner login yields role `admin` (unknown-role fallback) not `owner`; `caps('owner', …)` returns `[]` (no `owner` key in `PERMS`).

- [ ] **Step 3: Map backend roles to frontend roles in `finishLogin`**

In `sms-admin/src/context/AppProvider.tsx`, replace the `finishLogin` body's role resolution (lines ~157-164) with an explicit map:

```tsx
  /* Map the backend role string (e.g. "school.owner") to a frontend Role. Unknown
     roles fall back to 'admin' so ROLE_META lookups never crash. */
  const ROLE_MAP: Record<string, Role> = {
    'school.owner': 'owner', 'school.admin': 'admin',
    'school.principal': 'principal', 'school.teacher': 'teacher',
    owner: 'owner', admin: 'admin', principal: 'principal',
    vice_principal: 'vice_principal', teacher: 'teacher',
  }

  const finishLogin = async (email: string) => {
    const profile = await fetchMe()
    const role = ROLE_MAP[profile.roles[0]] ?? 'admin'
    applySession(email, role, profile.is_platform === true)
  }
```

(Remove the now-unused `known` array.)

- [ ] **Step 4: Normalize `owner` → `admin` in the gating lookups**

In `sms-admin/src/lib/gating.ts`, update `can()` and `caps()` so `owner` reads the admin row:

```ts
export function can(role: Role, module: string, cap: Cap): boolean {
  const r: GateRole = role === 'owner' ? 'admin' : role
  const m = PERMS[module]
  if (!m) return false
  return (m[r] || []).indexOf(cap) >= 0
}

export function caps(role: Role, module: string): Cap[] {
  const r: GateRole = role === 'owner' ? 'admin' : role
  return (PERMS[module] || {})[r] || []
}
```

Add `GateRole` to the existing type import at the top of `gating.ts`:

```ts
import type { Tier, Role, GateRole, Cap, UserOverrides, CellState } from '@/types'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `sms-admin`): `npm run typecheck && npm test`
Expected: typecheck passes; the two new tests pass; all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/context/AppProvider.tsx src/lib/gating.ts src/context/AppProvider.test.tsx src/lib/gating.test.ts
git commit -m "feat(roles): map school.owner to owner; owner inherits admin gating"
```

---

## Self-Review

**Spec coverage:**
- "Onboarding saves founding account as `school.owner`" → Task 3.
- "`school.owner` has same powers as `school.admin`" → Task 1 (policies) + Task 2 (inline `IsSchoolAdmin`) + Task 6 (frontend gating). The inline check in `UserEndpoints.cs` was the non-obvious gap the spec's "same powers" requirement implies; Task 2 covers it.
- "Migrate existing founding admins" → Task 4.
- "Frontend recognizes `owner`, routes to School Console" → Task 5 (type/label) + Task 6 (mapping/routing). The `AppProvider` test asserts `consoleKind: 'school'`.
- "Catre platform `owner` unaffected" → no policy or seeder change touches the `owner` (platform) string; `is_platform` routing untouched. `ROLE_MAP['owner']='owner'` only affects the displayed role, and platform owners render via the `isOwner` branch in `Topbar`.
- "Other school roles unchanged" → only `school.admin` grants gained an alternate role; no role was removed.

**Placeholder scan:** No TODO/TBD; every code step shows complete code; every run step shows the command and expected result.

**Type consistency:** `Policies.SchoolOwner` = `"school.owner"` is used identically in Tasks 1-4. Frontend `GateRole` is defined in Task 5 and consumed in Tasks 5-6. `ROLE_MAP` returns `Role`; `caps`/`can` narrow `Role`→`GateRole` consistently. `ROLE_META` is `Record<Role, RoleMeta>` (includes `owner`); `ROLES`/`PERMS`/`Matrix` are `GateRole`-keyed (exclude `owner`) — the split is applied consistently across `mockDb.ts`, `admin.tsx`, and `workspace.tsx`.

## Notes / risks carried from the spec

- The migration converts **all** current `school.admin` rows. Today that is exactly the two founding accounts (verified against the dev DB). Schools that add new `school.admin` staff after this ships keep `school.admin`; only the onboarding-created founder gets `school.owner`.
- Re-verify before shipping the migration that no sibling frontend (`sms-staff`, `sms-student`, `sms-teacher-app`, `sms-catreadmin`) hardcodes the `school.admin` string for gating (a repo-wide search during design found none).
