# Teacher & Staff Suspension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Owner, Admin, and Principal suspend/unsuspend a teacher or staff member's app login (reversible, not a deletion), enforced by the backend at login, with a specific user-facing message.

**Architecture:** Reuses the existing `Users.Status` `active ↔ inactive` toggle and its backend login-block (`AuthService.AccessBlockedError`) — no new status value, no migration. Backend: widen `UserService.SetActiveAsync`/`ListAsync` to also accept a Principal actor (scoped to teacher/staff targets only), and make the login-block message role-aware. Frontend: a new "App access" card on the Teacher/Staff profile drawers in `people.tsx`, visible to Owner/Admin/Principal, matching a person's email to their linked login account and calling the existing `setUserActive` API. The existing Identity & Access screen (`admin.tsx`) is not touched.

**Tech Stack:** ASP.NET Core / Dapper / FluentMigrator (backend, `D:\SMS\sms-project\sms-backend`), React / TypeScript / TanStack Query / Vitest + Testing Library (frontend, `D:\SMS\sms-project\sms-admin`).

**Spec:** `D:\SMS\sms-project\sms-admin\docs\superpowers\specs\2026-09-03-teacher-staff-suspension-design.md`

## Global Constraints

- Login-blocked message for a suspended teacher/staff account must be **exactly**: "Your account has been suspended by your school. Please contact your school administrator."
- Suspend is reversible and is NOT revoke/delete/remove — no change to `DeactivateAsync` ("Remove access") or its "removed" status/message.
- Owner and Admin's existing ability to suspend/unsuspend and remove ANY non-owner account (any role) must keep working exactly as today — no regression.
- Principal is newly authorized to suspend/unsuspend, but **only** when the target account's role is teacher or staff; targeting any other role must return 403.
- Enforcement happens in the backend (`AuthService`, `UserService`), not only the frontend — a suspended user must be blocked by the API itself.
- Tenant isolation: all of this operates within the actor's existing tenant scoping (`tenant.TenantId`) — no cross-tenant access, no change to that scoping.
- No new database migration, no fake/mock data, no production config changes, no changes to `admin.tsx` or its Identity & Access screen.

---

### Task 1: Backend — role-aware suspension login-block message

**Files:**
- Modify: `D:\SMS\sms-project\sms-backend\src\Sms.Application\Services\Auth\AuthService.cs`
- Test: `D:\SMS\sms-project\sms-backend\tests\Sms.Tests.Integration\Auth\SuspensionLoginTests.cs` (create)

**Interfaces:**
- Consumes: nothing new — reuses `IAuthDao.GetRolesAsync(Guid userId, CancellationToken ct)` (already used elsewhere in this file) and `Policies.Teacher` / `Policies.Staff` (`Sms.Shared.Kernel.Authz.Policies`).
- Produces: `AccessBlockedError(UserRecord user, IReadOnlyList<string>? roles = null)` — the second call sites (candidate ordering) keep calling it with one argument, unaffected. New error code `access_suspended` for role-aware messaging, used only by this task.

- [ ] **Step 1: Write the failing test**

Create `D:\SMS\sms-project\sms-backend\tests\Sms.Tests.Integration\Auth\SuspensionLoginTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Authz;
using Sms.Shared.Kernel.Data;
using Sms.Shared.Kernel.Tenancy;
using Xunit;

namespace Sms.Tests.Integration.Auth;

[Collection("sql")]
public class SuspensionLoginTests(SqlServerFixture fx)
{
    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", "integration-test-signing-key-32-bytes-min!!");
        });

    private SqlConnectionFactory PlatformFactory()
    {
        var ctx = new TenantContext();
        ctx.Set(null, Guid.NewGuid(), isPlatform: true);
        return new SqlConnectionFactory(fx.ConnectionString, ctx);
    }

    private async Task<string> SeedInactiveUserAsync(string role)
    {
        var hasher = new PasswordHasher();
        var tenantId = Guid.NewGuid();
        var email = $"u{Guid.NewGuid():N}@x.com";
        var factory = PlatformFactory();
        await using var c = await factory.OpenAsync();
        await c.ExecuteAsync("INSERT dbo.Tenants (Id, Name, Slug) VALUES (@t,'T',@s)",
            new { t = tenantId, s = "t-" + tenantId.ToString("N") });
        var userId = await c.QuerySingleAsync<Guid>(
            "INSERT dbo.Users (Id, TenantId, Email, PasswordHash, Status, IsPlatform) OUTPUT inserted.Id VALUES (NEWID(),@t,@e,@h,'inactive',0)",
            new { t = tenantId, e = email, h = hasher.Hash("Pass123!") });
        await c.ExecuteAsync("INSERT dbo.UserRoles (UserId, Role) VALUES (@u,@r)", new { u = userId, r = role });
        return email;
    }

    private static async Task<(HttpStatusCode Status, string Code, string Message)> LoginAsync(HttpClient client, string email)
    {
        var res = await client.PostAsJsonAsync("/v1/auth/login", new { email, password = "Pass123!" });
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var error = doc.RootElement.GetProperty("error");
        return (res.StatusCode, error.GetProperty("code").GetString()!, error.GetProperty("message").GetString()!);
    }

    [Fact]
    public async Task Inactive_teacher_sees_the_suspension_message()
    {
        var email = await SeedInactiveUserAsync(Policies.Teacher);
        await using var app = App();
        var (status, code, message) = await LoginAsync(app.CreateClient(), email);

        status.Should().Be(HttpStatusCode.Forbidden);
        code.Should().Be("access_suspended");
        message.Should().Be("Your account has been suspended by your school. Please contact your school administrator.");
    }

    [Fact]
    public async Task Inactive_staff_sees_the_suspension_message()
    {
        var email = await SeedInactiveUserAsync(Policies.Staff);
        await using var app = App();
        var (status, code, _) = await LoginAsync(app.CreateClient(), email);

        status.Should().Be(HttpStatusCode.Forbidden);
        code.Should().Be("access_suspended");
    }

    [Fact]
    public async Task Inactive_admin_keeps_the_original_deactivated_message()
    {
        var email = await SeedInactiveUserAsync(Policies.SchoolAdmin);
        await using var app = App();
        var (status, code, message) = await LoginAsync(app.CreateClient(), email);

        status.Should().Be(HttpStatusCode.Forbidden);
        code.Should().Be("access_inactive");
        message.Should().Be("Your access to this school has been deactivated by the admin.");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test D:\SMS\sms-project\sms-backend\tests\Sms.Tests.Integration\Sms.Tests.Integration.csproj --filter "FullyQualifiedName~SuspensionLoginTests"`
Expected: `Inactive_teacher_sees_the_suspension_message` and `Inactive_staff_sees_the_suspension_message` FAIL (message/code assert `access_inactive`/deactivated wording instead of `access_suspended`); `Inactive_admin_keeps_the_original_deactivated_message` already PASSES (no code change yet).

- [ ] **Step 3: Add `using Sms.Shared.Kernel.Authz;` to AuthService.cs**

In `D:\SMS\sms-project\sms-backend\src\Sms.Application\Services\Auth\AuthService.cs`, the top of the file currently reads:

```csharp
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Sms.Application.DTOs.Auth;
using Sms.Application.Common;
using Sms.Application.Interfaces.DAO;
using Sms.Modules.Tenancy.Data;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Results;
using Sms.Shared.Kernel.Tenancy;
```

Change to:

```csharp
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Sms.Application.DTOs.Auth;
using Sms.Application.Common;
using Sms.Application.Interfaces.DAO;
using Sms.Modules.Tenancy.Data;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Authz;
using Sms.Shared.Kernel.Results;
using Sms.Shared.Kernel.Tenancy;
```

- [ ] **Step 4: Make `AccessBlockedError` role-aware**

Find:

```csharp
    /// Null when the row is free to sign in; an Error when it's "removed" or "inactive"
    /// (paused/removed by the school admin) — same wording either path (password/OTP).
    private static Error? AccessBlockedError(UserRecord user) => user.Status switch
    {
        "removed" => new Error("access_removed", "Your access to this school has been removed by the admin."),
        "inactive" => new Error("access_inactive", "Your access to this school has been deactivated by the admin."),
        _ => null,
    };
```

Replace with:

```csharp
    /// Null when the row is free to sign in; an Error when it's "removed" or "inactive"
    /// (paused/removed by the school admin) — same wording either path (password/OTP).
    /// "inactive" for a teacher/staff account uses the suspension wording; every other
    /// role keeps the original "deactivated" wording unchanged. `roles` is omitted by
    /// the two candidate-ordering call sites, which only need the null/non-null result.
    private static Error? AccessBlockedError(UserRecord user, IReadOnlyList<string>? roles = null) => user.Status switch
    {
        "removed" => new Error("access_removed", "Your access to this school has been removed by the admin."),
        "inactive" when roles is not null && IsTeacherOrStaffRole(roles) =>
            new Error("access_suspended", "Your account has been suspended by your school. Please contact your school administrator."),
        "inactive" => new Error("access_inactive", "Your access to this school has been deactivated by the admin."),
        _ => null,
    };

    private static bool IsTeacherOrStaffRole(IReadOnlyList<string> roles) =>
        roles.Any(r => string.Equals(r, Policies.Teacher, StringComparison.OrdinalIgnoreCase)
                     || string.Equals(r, Policies.Staff, StringComparison.OrdinalIgnoreCase));
```

- [ ] **Step 5: Pass roles at the two real login call sites**

In `LoginAsync`, find:

```csharp
        if (AccessBlockedError(user) is { } blocked)
            return ApiResult<TokenResponse>.Fail(blocked, 403);

        return await IssueTokensAsync(user, ct);
    }

    /// Null when the row is free to sign in; an Error when it's "removed" or "inactive"
```

Replace the first three lines with:

```csharp
        var userRoles = await users.GetRolesAsync(user.Id, ct);
        if (AccessBlockedError(user, userRoles) is { } blocked)
            return ApiResult<TokenResponse>.Fail(blocked, 403);

        return await IssueTokensAsync(user, ct);
    }

    /// Null when the row is free to sign in; an Error when it's "removed" or "inactive"
```

In `VerifyOtpAsync`, find:

```csharp
        var user = await FindUserByIdentifierAsync(req.Identifier, ct);
        if (user is null)
            return ApiResult<TokenResponse>.Fail(new Error("invalid_code", "user not found"), 401);
        if (AccessBlockedError(user) is { } blocked)
            return ApiResult<TokenResponse>.Fail(blocked, 403);

        return await IssueTokensAsync(user, ct);
    }
```

Replace with:

```csharp
        var user = await FindUserByIdentifierAsync(req.Identifier, ct);
        if (user is null)
            return ApiResult<TokenResponse>.Fail(new Error("invalid_code", "user not found"), 401);
        var otpUserRoles = await users.GetRolesAsync(user.Id, ct);
        if (AccessBlockedError(user, otpUserRoles) is { } blocked)
            return ApiResult<TokenResponse>.Fail(blocked, 403);

        return await IssueTokensAsync(user, ct);
    }
```

Do **not** change the two ordering call sites (`AccessBlockedError(u)` inside `FindUserByPasswordAsync`'s `.ThenBy(...)` and inside `PickBestOrder`) — they keep compiling unchanged because `roles` now defaults to `null`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test D:\SMS\sms-project\sms-backend\tests\Sms.Tests.Integration\Sms.Tests.Integration.csproj --filter "FullyQualifiedName~SuspensionLoginTests"`
Expected: all 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd D:\SMS\sms-project\sms-backend
git add src/Sms.Application/Services/Auth/AuthService.cs tests/Sms.Tests.Integration/Auth/SuspensionLoginTests.cs
git commit -m "feat(auth): role-aware login-block message for suspended teacher/staff accounts"
```

---

### Task 2: Backend — Principal RBAC for suspend/unsuspend, scoped to teacher/staff

**Files:**
- Modify: `D:\SMS\sms-project\sms-backend\src\Sms.Application\Services\Users\UserService.cs`
- Modify: `D:\SMS\sms-project\sms-backend\src\Sms.Api\Controllers\UserController.cs`
- Test: `D:\SMS\sms-project\sms-backend\tests\Sms.Tests.Integration\Users\PrincipalSuspensionTests.cs` (create)

**Interfaces:**
- Consumes: `Policies.Principal`, `Policies.Teacher`, `Policies.Staff`, `Policies.SchoolAdmin` (`Sms.Shared.Kernel.Authz.Policies`); existing `SchoolUserListRow.Roles` (comma-separated string).
- Produces: `IUserService.ListAsync(bool isSchoolAdmin, bool isPrincipal, CancellationToken ct)` and `IUserService.SetActiveAsync(Guid userId, bool active, bool isSchoolAdmin, bool isPrincipal, CancellationToken ct)` — new required parameter on both; `UserController.IsPrincipal()` — new private helper, same shape as `IsSchoolAdmin()`/`IsSchoolOwner()`.

- [ ] **Step 1: Write the failing tests**

Create `D:\SMS\sms-project\sms-backend\tests\Sms.Tests.Integration\Users\PrincipalSuspensionTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Authz;
using Sms.Shared.Kernel.Data;
using Sms.Shared.Kernel.Tenancy;
using Sms.Shared.Kernel.Time;
using Xunit;

namespace Sms.Tests.Integration.Users;

[Collection("sql")]
public class PrincipalSuspensionTests(SqlServerFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", Key);
        });

    private static HttpClient TenantClient(WebApplicationFactory<Program> app, Guid tenantId, string[] roles)
    {
        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var token = jwt.IssueAccess(Guid.NewGuid(), tenantId, roles, isPlatform: false);
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        return client;
    }

    private SqlConnectionFactory PlatformFactory()
    {
        var ctx = new TenantContext();
        ctx.Set(null, Guid.NewGuid(), isPlatform: true);
        return new SqlConnectionFactory(fx.ConnectionString, ctx);
    }

    private async Task EnsureTenantAsync(Guid tenantId)
    {
        var factory = PlatformFactory();
        await using var c = await factory.OpenAsync();
        await c.ExecuteAsync("INSERT dbo.Tenants (Id, Name, Slug) VALUES (@t,'T',@s)",
            new { t = tenantId, s = "t-" + tenantId.ToString("N") });
    }

    private async Task<Guid> SeedUserAsync(Guid tenantId, string role, string status = "active")
    {
        var factory = PlatformFactory();
        await using var c = await factory.OpenAsync();
        var userId = await c.QuerySingleAsync<Guid>(
            "INSERT dbo.Users (Id, TenantId, Email, Status, IsPlatform) OUTPUT inserted.Id VALUES (NEWID(),@t,@e,@st,0)",
            new { t = tenantId, e = $"u{Guid.NewGuid():N}@x.com", st = status });
        await c.ExecuteAsync("INSERT dbo.UserRoles (UserId, Role) VALUES (@u,@r)", new { u = userId, r = role });
        return userId;
    }

    [Fact]
    public async Task Principal_can_suspend_a_teacher()
    {
        var tenantId = Guid.NewGuid();
        await EnsureTenantAsync(tenantId);
        var targetId = await SeedUserAsync(tenantId, Policies.Teacher);

        await using var app = App();
        var client = TenantClient(app, tenantId, [Policies.Principal]);
        var resp = await client.PutAsJsonAsync($"/v1/users/{targetId}/status", new { active = false });

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Principal_can_suspend_staff()
    {
        var tenantId = Guid.NewGuid();
        await EnsureTenantAsync(tenantId);
        var targetId = await SeedUserAsync(tenantId, Policies.Staff);

        await using var app = App();
        var client = TenantClient(app, tenantId, [Policies.Principal]);
        var resp = await client.PutAsJsonAsync($"/v1/users/{targetId}/status", new { active = false });

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Principal_cannot_suspend_an_admin()
    {
        var tenantId = Guid.NewGuid();
        await EnsureTenantAsync(tenantId);
        var targetId = await SeedUserAsync(tenantId, Policies.SchoolAdmin);

        await using var app = App();
        var client = TenantClient(app, tenantId, [Policies.Principal]);
        var resp = await client.PutAsJsonAsync($"/v1/users/{targetId}/status", new { active = false });

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Admin_can_still_suspend_an_admin_account_unchanged()
    {
        var tenantId = Guid.NewGuid();
        await EnsureTenantAsync(tenantId);
        var targetId = await SeedUserAsync(tenantId, Policies.SchoolAdmin);

        await using var app = App();
        var client = TenantClient(app, tenantId, [Policies.SchoolAdmin]);
        var resp = await client.PutAsJsonAsync($"/v1/users/{targetId}/status", new { active = false });

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Principal_listing_users_only_sees_teacher_and_staff_rows()
    {
        var tenantId = Guid.NewGuid();
        await EnsureTenantAsync(tenantId);
        await SeedUserAsync(tenantId, Policies.SchoolAdmin);
        var teacherId = await SeedUserAsync(tenantId, Policies.Teacher);

        await using var app = App();
        var client = TenantClient(app, tenantId, [Policies.Principal]);
        var resp = await client.GetAsync("/v1/users");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var ids = doc.RootElement.GetProperty("data").EnumerateArray()
            .Select(e => e.GetProperty("id").GetString()).ToArray();
        ids.Should().BeEquivalentTo([teacherId.ToString()]);
    }

    [Fact]
    public async Task Admin_listing_users_still_sees_every_role_unchanged()
    {
        var tenantId = Guid.NewGuid();
        await EnsureTenantAsync(tenantId);
        var adminId = await SeedUserAsync(tenantId, Policies.SchoolAdmin);
        var teacherId = await SeedUserAsync(tenantId, Policies.Teacher);

        await using var app = App();
        var client = TenantClient(app, tenantId, [Policies.SchoolAdmin]);
        var resp = await client.GetAsync("/v1/users");

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var ids = doc.RootElement.GetProperty("data").EnumerateArray()
            .Select(e => e.GetProperty("id").GetString()).ToArray();
        ids.Should().BeEquivalentTo([adminId.ToString(), teacherId.ToString()]);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test D:\SMS\sms-project\sms-backend\tests\Sms.Tests.Integration\Sms.Tests.Integration.csproj --filter "FullyQualifiedName~PrincipalSuspensionTests"`
Expected: compile error (`ListAsync`/`SetActiveAsync` don't accept the old 2/3-argument shape yet from the test's perspective — actually they will compile since the test calls the HTTP API, not the C# method directly; instead expect `Principal_can_suspend_a_teacher`, `Principal_can_suspend_staff`, and `Principal_listing_users_only_sees_teacher_and_staff_rows` to FAIL with 403 Forbidden, since `IsSchoolAdmin()` currently excludes Principal entirely). `Principal_cannot_suspend_an_admin` and `Admin_can_still_suspend_an_admin_account_unchanged` and `Admin_listing_users_still_sees_every_role_unchanged` already PASS.

- [ ] **Step 3: Add the teacher/staff role-check helper in `UserService.cs`**

Find:

```csharp
    private static bool IsOwnerRow(SchoolUserListRow row) =>
        row.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries).Contains(Policies.SchoolOwner, StringComparer.OrdinalIgnoreCase);
```

Replace with:

```csharp
    private static bool IsOwnerRow(SchoolUserListRow row) =>
        row.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries).Contains(Policies.SchoolOwner, StringComparer.OrdinalIgnoreCase);

    private static bool IsTeacherOrStaffRow(SchoolUserListRow row) =>
        row.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Any(r => string.Equals(r, Policies.Teacher, StringComparison.OrdinalIgnoreCase)
                   || string.Equals(r, Policies.Staff, StringComparison.OrdinalIgnoreCase));
```

- [ ] **Step 4: Update the `IUserService` interface**

Find:

```csharp
    Task<ApiResult<IReadOnlyList<SchoolUserResponse>>> ListAsync(bool isSchoolAdmin, CancellationToken ct = default);
    /// <summary>Removes a person's access to the CURRENT school only — other tenants they
    /// belong to (separate Users rows) are unaffected.</summary>
    Task<ApiResult> DeactivateAsync(Guid userId, bool isSchoolAdmin, CancellationToken ct = default);
    /// <summary>Reversible pause/resume — flips between "active" and "inactive" for an
    /// already-accepted member of the current school.</summary>
    Task<ApiResult<SchoolUserResponse>> SetActiveAsync(Guid userId, bool active, bool isSchoolAdmin, CancellationToken ct = default);
```

Replace with:

```csharp
    Task<ApiResult<IReadOnlyList<SchoolUserResponse>>> ListAsync(bool isSchoolAdmin, bool isPrincipal, CancellationToken ct = default);
    /// <summary>Removes a person's access to the CURRENT school only — other tenants they
    /// belong to (separate Users rows) are unaffected.</summary>
    Task<ApiResult> DeactivateAsync(Guid userId, bool isSchoolAdmin, CancellationToken ct = default);
    /// <summary>Reversible pause/resume — flips between "active" and "inactive" for an
    /// already-accepted member of the current school. Admin/Owner may target any
    /// non-owner row; a Principal (not Admin/Owner) may only target a teacher or
    /// staff account.</summary>
    Task<ApiResult<SchoolUserResponse>> SetActiveAsync(Guid userId, bool active, bool isSchoolAdmin, bool isPrincipal, CancellationToken ct = default);
```

- [ ] **Step 5: Update `ListAsync`**

Find:

```csharp
    public async Task<ApiResult<IReadOnlyList<SchoolUserResponse>>> ListAsync(bool isSchoolAdmin, CancellationToken ct = default)
    {
        if (!isSchoolAdmin)
            return ApiResult<IReadOnlyList<SchoolUserResponse>>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<IReadOnlyList<SchoolUserResponse>>.Fail(new Error("forbidden", "no tenant context"), 403);

        var rows = await dao.ListByTenantAsync(tid, ct);
        var list = rows.Select(MapUser).ToList();
        return ApiResult<IReadOnlyList<SchoolUserResponse>>.Ok(list);
    }
```

Replace with:

```csharp
    public async Task<ApiResult<IReadOnlyList<SchoolUserResponse>>> ListAsync(bool isSchoolAdmin, bool isPrincipal, CancellationToken ct = default)
    {
        if (!isSchoolAdmin && !isPrincipal)
            return ApiResult<IReadOnlyList<SchoolUserResponse>>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<IReadOnlyList<SchoolUserResponse>>.Fail(new Error("forbidden", "no tenant context"), 403);

        var rows = await dao.ListByTenantAsync(tid, ct);
        // A Principal (not Admin/Owner) may only see teacher/staff accounts here —
        // never Admin/Owner/other-Principal accounts.
        if (!isSchoolAdmin)
            rows = rows.Where(IsTeacherOrStaffRow).ToList();
        var list = rows.Select(MapUser).ToList();
        return ApiResult<IReadOnlyList<SchoolUserResponse>>.Ok(list);
    }
```

- [ ] **Step 6: Update `SetActiveAsync`**

Find:

```csharp
    public async Task<ApiResult<SchoolUserResponse>> SetActiveAsync(
        Guid userId, bool active, bool isSchoolAdmin, CancellationToken ct = default)
    {
        if (!isSchoolAdmin)
            return ApiResult<SchoolUserResponse>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<SchoolUserResponse>.Fail(new Error("forbidden", "no tenant context"), 403);
        var rows = await dao.ListByTenantAsync(tid, ct);
        var row = rows.FirstOrDefault(u => u.Id == userId);
        if (row is null)
            return ApiResult<SchoolUserResponse>.Fail(new Error("not_found", "user not found in this school"), 404);
        if (row.Status is not ("active" or "inactive"))
            return ApiResult<SchoolUserResponse>.Fail(
                new Error("invalid_request", "Only an already-accepted member can be activated or deactivated — resend the invite or remove and re-invite instead."), 422);
        if (userId == tenant.UserId)
            return ApiResult<SchoolUserResponse>.Fail(new Error("conflict", "You can't change your own access."), 409);
        if (IsOwnerRow(row))
            return ApiResult<SchoolUserResponse>.Fail(new Error("conflict", "An owner's access can't be paused here."), 409);

        var status = active ? "active" : "inactive";
```

Replace with:

```csharp
    public async Task<ApiResult<SchoolUserResponse>> SetActiveAsync(
        Guid userId, bool active, bool isSchoolAdmin, bool isPrincipal, CancellationToken ct = default)
    {
        if (!isSchoolAdmin && !isPrincipal)
            return ApiResult<SchoolUserResponse>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<SchoolUserResponse>.Fail(new Error("forbidden", "no tenant context"), 403);
        var rows = await dao.ListByTenantAsync(tid, ct);
        var row = rows.FirstOrDefault(u => u.Id == userId);
        if (row is null)
            return ApiResult<SchoolUserResponse>.Fail(new Error("not_found", "user not found in this school"), 404);
        if (row.Status is not ("active" or "inactive"))
            return ApiResult<SchoolUserResponse>.Fail(
                new Error("invalid_request", "Only an already-accepted member can be activated or deactivated — resend the invite or remove and re-invite instead."), 422);
        if (userId == tenant.UserId)
            return ApiResult<SchoolUserResponse>.Fail(new Error("conflict", "You can't change your own access."), 409);
        if (IsOwnerRow(row))
            return ApiResult<SchoolUserResponse>.Fail(new Error("conflict", "An owner's access can't be paused here."), 409);
        // A Principal (not Admin/Owner) may only suspend/unsuspend a teacher or staff account.
        if (!isSchoolAdmin && !IsTeacherOrStaffRow(row))
            return ApiResult<SchoolUserResponse>.Fail(
                new Error("forbidden", "Principals can only suspend teacher or staff accounts."), 403);

        var status = active ? "active" : "inactive";
```

- [ ] **Step 7: Add `IsPrincipal()` to `UserController.cs` and pass it through**

Find:

```csharp
    [HttpGet("users")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        FromResult(await users.ListAsync(IsSchoolAdmin(), ct));
```

Replace with:

```csharp
    [HttpGet("users")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        FromResult(await users.ListAsync(IsSchoolAdmin(), IsPrincipal(), ct));
```

Find:

```csharp
    [HttpPut("users/{id:guid}/status")]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] SetUserActiveRequest req, CancellationToken ct) =>
        FromResult(await users.SetActiveAsync(id, req.Active, IsSchoolAdmin(), ct));
```

Replace with:

```csharp
    [HttpPut("users/{id:guid}/status")]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] SetUserActiveRequest req, CancellationToken ct) =>
        FromResult(await users.SetActiveAsync(id, req.Active, IsSchoolAdmin(), IsPrincipal(), ct));
```

Find:

```csharp
    private bool IsSchoolAdmin() =>
        User.FindAll("role").Any(c => c.Value is Policies.SchoolAdmin or Policies.SchoolOwner);

    private bool IsSchoolOwner() =>
        User.FindAll("role").Any(c => c.Value == Policies.SchoolOwner);
}
```

Replace with:

```csharp
    private bool IsSchoolAdmin() =>
        User.FindAll("role").Any(c => c.Value is Policies.SchoolAdmin or Policies.SchoolOwner);

    private bool IsSchoolOwner() =>
        User.FindAll("role").Any(c => c.Value == Policies.SchoolOwner);

    private bool IsPrincipal() =>
        User.FindAll("role").Any(c => c.Value == Policies.Principal);
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `dotnet test D:\SMS\sms-project\sms-backend\tests\Sms.Tests.Integration\Sms.Tests.Integration.csproj --filter "FullyQualifiedName~PrincipalSuspensionTests"`
Expected: all 6 tests PASS.

- [ ] **Step 9: Run the full backend test suite to check for regressions**

Run: `dotnet test D:\SMS\sms-project\sms-backend\Sms.slnx`
Expected: no failures other than pre-existing ones unrelated to this change (note any pre-existing failures before concluding).

- [ ] **Step 10: Commit**

```bash
cd D:\SMS\sms-project\sms-backend
git add src/Sms.Application/Services/Users/UserService.cs src/Sms.Api/Controllers/UserController.cs tests/Sms.Tests.Integration/Users/PrincipalSuspensionTests.cs
git commit -m "feat(users): let Principal suspend/unsuspend teacher and staff accounts"
```

---

### Task 3: Frontend — data-layer hooks (linked account lookup + suspend mutation)

**Files:**
- Modify: `D:\SMS\sms-project\sms-admin\src\api\hooks\useUsers.ts`
- Modify: `D:\SMS\sms-project\sms-admin\src\api\hooks\useUserMutations.ts`
- Test: `D:\SMS\sms-project\sms-admin\src\api\hooks\useUsers.test.tsx` (create)
- Test: `D:\SMS\sms-project\sms-admin\src\api\hooks\useUserMutations.test.tsx` (create)

**Interfaces:**
- Consumes: `listSchoolUsers`, `setUserActive`, `SchoolUserDto` (`@/api/users`, already exist — no change to that file).
- Produces: `useSchoolUserByEmail(email: string | undefined): SchoolUserDto | undefined` (new export from `@/api/hooks/useUsers`); `useSetUserActive(): UseMutationResult<SchoolUserDto, Error, { userId: string; active: boolean }>` (new export from `@/api/hooks/useUserMutations`). Task 4 imports both by these exact names.

- [ ] **Step 1: Write the failing test for `useSchoolUserByEmail`**

Create `D:\SMS\sms-project\sms-admin\src\api\hooks\useUsers.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSchoolUserByEmail } from './useUsers'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.restoreAllMocks() })

describe('useSchoolUserByEmail', () => {
  it('matches a linked account by email, case-insensitively', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'U1', email: 'Meera@Greenwood.edu', phone: null, status: 'active', created_at: '2026-01-01', roles: ['school.teacher'] }],
    })))
    const { result } = renderHook(() => useSchoolUserByEmail('meera@greenwood.edu'), { wrapper })
    await waitFor(() => expect(result.current?.id).toBe('U1'))
    vi.unstubAllGlobals()
  })

  it('returns undefined when no account matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })))
    const { result } = renderHook(() => useSchoolUserByEmail('nobody@greenwood.edu'), { wrapper })
    await waitFor(() => expect(result.current).toBeUndefined())
    vi.unstubAllGlobals()
  })

  it('returns undefined when email is undefined', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })))
    const { result } = renderHook(() => useSchoolUserByEmail(undefined), { wrapper })
    expect(result.current).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/hooks/useUsers.test.tsx`
Expected: FAIL — `useSchoolUserByEmail` is not exported from `./useUsers`.

- [ ] **Step 3: Add `useSchoolUserByEmail` to `useUsers.ts`**

Current file:

```ts
import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listSchoolUsers, fromApiRole, leadershipRoleLabel, type SchoolUserDto } from '../users'
import { queryKeys } from '../queryKeys'

/** CRM login accounts for this school — owner/admin/principal/vice_principal, plus any
 *  teacher/staff/parent rows the identity API also surfaces. */
export function useSchoolUsers(): UseQueryResult<SchoolUserDto[]> {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: () => listSchoolUsers(),
    staleTime: 30_000,
  })
}
```

Add this function at the end of the file (after `useLeadershipRoleByEmail`):

```ts

/** Find the linked login account (if any) for a person by email — used to show and
 *  toggle app access (Suspend/Unsuspend) from a Teacher/Staff profile drawer. */
export function useSchoolUserByEmail(email: string | undefined): SchoolUserDto | undefined {
  const { data } = useSchoolUsers()
  const needle = email?.trim().toLowerCase()
  return useMemo(() => {
    if (!needle) return undefined
    return (data ?? []).find((u) => u.email?.trim().toLowerCase() === needle)
  }, [data, needle])
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/api/hooks/useUsers.test.tsx`
Expected: all 3 tests PASS.

- [ ] **Step 5: Write the failing test for `useSetUserActive`**

Create `D:\SMS\sms-project\sms-admin\src\api\hooks\useUserMutations.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSetUserActive } from './useUserMutations'
import * as usersApi from '../users'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.restoreAllMocks() })

describe('useSetUserActive', () => {
  it('calls setUserActive with the user id and active flag', async () => {
    const spy = vi.spyOn(usersApi, 'setUserActive').mockResolvedValue({
      id: 'U1', email: 'meera@greenwood.edu', phone: null, status: 'inactive', created_at: '2026-01-01', roles: ['school.teacher'],
    })
    const { result } = renderHook(() => useSetUserActive(), { wrapper })
    result.current.mutate({ userId: 'U1', active: false })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('U1', false)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/api/hooks/useUserMutations.test.tsx`
Expected: FAIL — `useSetUserActive` is not exported from `./useUserMutations`.

- [ ] **Step 7: Add `useSetUserActive` to `useUserMutations.ts`**

Current file:

```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { inviteUser } from '../users'
import { queryKeys } from '../queryKeys'

export function useInviteUser(): UseMutationResult<{ id: string }, Error, { email: string; role: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) => inviteUser(email, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.users.all }) },
  })
}
```

Replace with:

```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { inviteUser, setUserActive, type SchoolUserDto } from '../users'
import { queryKeys } from '../queryKeys'

export function useInviteUser(): UseMutationResult<{ id: string }, Error, { email: string; role: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) => inviteUser(email, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.users.all }) },
  })
}

/** Suspend (active=false) or unsuspend (active=true) a linked login account. */
export function useSetUserActive(): UseMutationResult<SchoolUserDto, Error, { userId: string; active: boolean }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) => setUserActive(userId, active),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.users.all }) },
  })
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/api/hooks/useUserMutations.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd D:\SMS\sms-project\sms-admin
git add src/api/hooks/useUsers.ts src/api/hooks/useUserMutations.ts src/api/hooks/useUsers.test.tsx src/api/hooks/useUserMutations.test.tsx
git commit -m "feat(users): add hooks to look up and toggle a linked login account"
```

---

### Task 4: Frontend — "App access" card on Teacher/Staff profile drawers

**Files:**
- Modify: `D:\SMS\sms-project\sms-admin\src\screens\school\people.tsx`
- Test: `D:\SMS\sms-project\sms-admin\src\screens\school\people.test.tsx` (create)

**Interfaces:**
- Consumes: `useSchoolUserByEmail` (`@/api/hooks/useUsers`, Task 3), `useSetUserActive` (`@/api/hooks/useUserMutations`, Task 3), `Role` type (`@/types`).
- Produces: `AccessCard({ email, name }: { email: string | undefined; name: string })` — a local component in `people.tsx`, rendered inside `TeacherProfile` and `StaffProfile`. Not exported outside this file.

- [ ] **Step 1: Write the failing tests**

Create `D:\SMS\sms-project\sms-admin\src\screens\school\people.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { peopleScreens } from './people'

const TeachersScreen = peopleScreens['school.teachers']
const TENANT_ID = 'school-1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const TEACHER = {
  id: 'T1', name: 'Meera Rao', department: 'Science', designation: 'HOD', attendance_pct: 97,
  avatar_hue: 1, subjects: [], class_teacher: null, phone: '', email: 'meera@greenwood.edu',
  exp: 5, rating: 4.5, result: 80, load: 10, status: 'active', gender: 'F', top: false,
}

type UserRow = { id: string; email: string; status: string; roles: string[] }

function authAndSchoolResponse(url: string, method: string, role: string): Response | null {
  if (url.includes('/auth/refresh')) {
    return jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })
  }
  if (url.includes('/auth/me')) {
    return jsonResponse({ data: { id: 'u1', tenant_id: TENANT_ID, roles: [role], is_platform: false } })
  }
  if (url.includes('/me/schools') && method === 'GET') {
    return jsonResponse({
      data: [{
        id: TENANT_ID, name: 'Greenwood High', slug: 'greenwood', country: 'IN', status: 'active',
        plan_id: null, plan_name: 'Platinum', tier: 'platinum', mrr: 0, students_count: 0,
        staff_count: 0, storage_gb: 0, created: '2026-01-01', contact_name: null,
        contact_email: null, contact_phone: null, address: null, health_score: 100,
      }],
      next_cursor: null,
    })
  }
  return null
}

function stubFetch(role: string, usersRows: UserRow[]) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method, role)
    if (auth) return Promise.resolve(auth)
    if (url.includes('/teachers') && method === 'GET') {
      return Promise.resolve(jsonResponse({ data: [TEACHER], next_cursor: null }))
    }
    if (url.includes('/users') && method === 'GET') {
      return Promise.resolve(jsonResponse({
        data: usersRows.map((r) => ({ id: r.id, email: r.email, phone: null, status: r.status, created_at: '2026-01-01', roles: r.roles })),
      }))
    }
    if (url.includes('/status') && method === 'PUT') {
      const body = JSON.parse(String(init?.body))
      return Promise.resolve(jsonResponse({
        data: { id: 'U1', email: TEACHER.email, phone: null, status: body.active ? 'active' : 'inactive', created_at: '2026-01-01', roles: ['school.teacher'] },
      }))
    }
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  }))
}

function renderTeachers() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <TeachersScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  tokenStore.set({ access_token: 'a', refresh_token: 'r' })
  tokenStore.setEmail('admin@greenwood.edu')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

/** With one teacher, "Meera Rao" renders twice — once in the Top performers card
 *  (not clickable) and once in the roster table row (clickable, opens the drawer).
 *  The table row is the second match in document order. */
async function openTeacherProfile() {
  await waitFor(() => expect(screen.getAllByText('Meera Rao').length).toBeGreaterThan(0))
  fireEvent.click(screen.getAllByText('Meera Rao')[1])
  await waitFor(() => expect(screen.getByText('Photo & documents')).toBeInTheDocument())
}

describe('Teacher profile — App access card', () => {
  it('shows Suspend for an active linked account (admin viewer)', async () => {
    stubFetch('school.admin', [{ id: 'U1', email: TEACHER.email, status: 'active', roles: ['school.teacher'] }])
    renderTeachers()
    await openTeacherProfile()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Suspend')).toBeInTheDocument()
  })

  it('suspends the account and flips the button to Unsuspend', async () => {
    stubFetch('school.admin', [{ id: 'U1', email: TEACHER.email, status: 'active', roles: ['school.teacher'] }])
    renderTeachers()
    await openTeacherProfile()
    fireEvent.click(screen.getByText('Suspend'))
    await waitFor(() => expect(screen.getByText('Unsuspend')).toBeInTheDocument())
    expect(screen.getByText('Suspended')).toBeInTheDocument()
  })

  it('shows "Not yet invited to the app" when no linked account matches', async () => {
    stubFetch('school.admin', [])
    renderTeachers()
    await openTeacherProfile()
    expect(screen.getByText('Not yet invited to the app.')).toBeInTheDocument()
  })

  it('hides the Access card for a teacher viewer', async () => {
    stubFetch('school.teacher', [{ id: 'U1', email: TEACHER.email, status: 'active', roles: ['school.teacher'] }])
    renderTeachers()
    await openTeacherProfile()
    expect(screen.queryByText('App access')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/people.test.tsx`
Expected: FAIL — no "App access" text exists anywhere yet (first three tests fail; the fourth may pass vacuously, which is fine at this stage).

- [ ] **Step 3: Add the `AccessCard` component and imports**

In `D:\SMS\sms-project\sms-admin\src\screens\school\people.tsx`, find the import block:

```tsx
import type { Teacher, Staff } from '@/types'
import { useTeachers } from '@/api/hooks/useTeachers'
import { normalizeSubjects } from '@/api/teachers'
import { useStaff } from '@/api/hooks/useStaff'
import { useTransportBuses } from '@/api/hooks/useOperations'
import { useStudents } from '@/api/hooks/useStudents'
import { studentParentLabel, parentMailFromStudent } from '@/api/students'
import {
  listPeopleDocs, resolvePeoplePhoto, openStoredDoc, downloadStoredDoc, isStoredImage,
} from '@/api/peopleExtras'
import { fetchTeacherExtras } from '@/api/teacherExtras'
import { fetchStaffExtras } from '@/api/staffExtras'
import { openMailCompose } from '@/lib/composeMail'
import { useLeadershipRoleByEmail } from '@/api/hooks/useUsers'
```

Replace with:

```tsx
import type { Teacher, Staff, Role } from '@/types'
import { useTeachers } from '@/api/hooks/useTeachers'
import { normalizeSubjects } from '@/api/teachers'
import { useStaff } from '@/api/hooks/useStaff'
import { useTransportBuses } from '@/api/hooks/useOperations'
import { useStudents } from '@/api/hooks/useStudents'
import { studentParentLabel, parentMailFromStudent } from '@/api/students'
import {
  listPeopleDocs, resolvePeoplePhoto, openStoredDoc, downloadStoredDoc, isStoredImage,
} from '@/api/peopleExtras'
import { fetchTeacherExtras } from '@/api/teacherExtras'
import { fetchStaffExtras } from '@/api/staffExtras'
import { openMailCompose } from '@/lib/composeMail'
import { useLeadershipRoleByEmail, useSchoolUserByEmail } from '@/api/hooks/useUsers'
import { useSetUserActive } from '@/api/hooks/useUserMutations'
```

Then, find (the start of `TeacherProfile`):

```tsx
function TeacherProfile({ teacher, onClose, onMessage }: { teacher: Teacher | null; onClose: () => void; onMessage: (t: Teacher) => void }) {
```

Insert this new component immediately **before** that line:

```tsx
const CAN_MANAGE_ACCESS: Role[] = ['owner', 'admin', 'principal', 'vice_principal']

function AccessCard({ email, name }: { email: string | undefined; name: string }) {
  const app = useApp()
  const toast = useToast()
  const account = useSchoolUserByEmail(email)
  const setActive = useSetUserActive()

  if (!CAN_MANAGE_ACCESS.includes(app.role)) return null

  if (!account) {
    return (
      <Card>
        <CardHead title="App access" icon="key" />
        <div className="t-sm muted" style={{ marginTop: 8 }}>Not yet invited to the app.</div>
      </Card>
    )
  }

  const suspended = account.status === 'inactive'
  const toggle = () => {
    setActive.mutate({ userId: account.id, active: suspended }, {
      onSuccess: () => toast.success(
        suspended ? 'Access restored' : 'Account suspended',
        `${name} ${suspended ? 'can sign in again' : 'can no longer sign in'}.`,
      ),
      onError: (err) => toast.danger('Could not update access', err instanceof Error ? err.message : 'Try again.'),
    })
  }

  return (
    <Card>
      <CardHead title="App access" icon="key" />
      <div className="row ai-center jc-between" style={{ marginTop: 8 }}>
        <Badge tone={suspended ? 'danger' : 'success'}>{suspended ? 'Suspended' : 'Active'}</Badge>
        <Btn
          variant="secondary"
          size="sm"
          icon={suspended ? 'checkCircle' : 'lock'}
          onClick={toggle}
          disabled={setActive.isPending}
        >
          {setActive.isPending ? 'Saving…' : suspended ? 'Unsuspend' : 'Suspend'}
        </Btn>
      </div>
    </Card>
  )
}

```

- [ ] **Step 4: Wire `AccessCard` into `TeacherProfile`**

Find:

```tsx
            <StatRow label="Teaching load" value={`${teacher.load} periods/wk`} />
          </div>
        </Card>

        <Card>
          <CardHead title="Photo & documents" sub="Stored on this device" icon="doc" />
          <div style={{ marginTop: 8 }}>
            <PeopleDocsList kind="teacher" personId={teacher.id} toast={toast} />
          </div>
        </Card>
      </div>
    </Drawer>
  )
}
```

Replace with:

```tsx
            <StatRow label="Teaching load" value={`${teacher.load} periods/wk`} />
          </div>
        </Card>

        <AccessCard email={teacher.email} name={teacher.name} />

        <Card>
          <CardHead title="Photo & documents" sub="Stored on this device" icon="doc" />
          <div style={{ marginTop: 8 }}>
            <PeopleDocsList kind="teacher" personId={teacher.id} toast={toast} />
          </div>
        </Card>
      </div>
    </Drawer>
  )
}
```

- [ ] **Step 5: Wire `AccessCard` into `StaffProfile`**

Find:

```tsx
        <DriverSection staff={staff} />
        <Card>
          <CardHead title="Photo & documents" sub="Stored on this device" icon="doc" />
          <div style={{ marginTop: 8 }}>
            <PeopleDocsList kind="staff" personId={staff.id} toast={toast} />
          </div>
        </Card>
      </div>
    </Drawer>
  )
}
```

Replace with:

```tsx
        <DriverSection staff={staff} />
        <AccessCard email={staff.email} name={staff.name} />
        <Card>
          <CardHead title="Photo & documents" sub="Stored on this device" icon="doc" />
          <div style={{ marginTop: 8 }}>
            <PeopleDocsList kind="staff" personId={staff.id} toast={toast} />
          </div>
        </Card>
      </div>
    </Drawer>
  )
}
```

- [ ] **Step 6: Run the test file to verify it passes**

Run: `npx vitest run src/screens/school/people.test.tsx`
Expected: all 4 tests PASS.

- [ ] **Step 7: Run the full frontend test suite and typecheck to check for regressions**

Run: `cd D:\SMS\sms-project\sms-admin && npx vitest run`
Expected: no new failures compared to the pre-existing baseline.

Run: `cd D:\SMS\sms-project\sms-admin && npx tsc -b`
Expected: no new errors compared to the pre-existing baseline (this repo has some pre-existing unrelated errors in other files — confirm the count/set is unchanged, not that it's zero).

- [ ] **Step 8: Commit**

```bash
cd D:\SMS\sms-project\sms-admin
git add src/screens/school/people.tsx src/screens/school/people.test.tsx
git commit -m "feat(people): add App access card to suspend/unsuspend teacher and staff logins"
```

---

### Task 5: Manual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the backend**

Run (background): `cd D:\SMS\sms-project\sms-backend\src\Sms.Api && dotnet run`
Expected: listens on `http://localhost:5162` (per `D:\SMS\sms-project\sms-admin\src\api\config.ts`'s default).

- [ ] **Step 2: Start the frontend**

Run (background): `cd D:\SMS\sms-project\sms-admin && npm run dev`
Expected: Vite dev server on `http://localhost:5173`.

- [ ] **Step 3: Walk through the flow in Chrome**

Open `http://localhost:5173`, log in as a Principal (or Admin/Owner) of a school that has at least one teacher with a linked login account. Open People → Teachers, click that teacher, confirm the "App access" card shows "Active" and a "Suspend" button. Click it, confirm the toast and the card flipping to "Suspended" / "Unsuspend". Log out, attempt to log in as that teacher, and confirm the exact message "Your account has been suspended by your school. Please contact your school administrator." appears. Click "Unsuspend" as the Principal, confirm the teacher can log in again.

- [ ] **Step 4: Confirm unrelated flows are untouched**

As an Admin or Owner, open Settings → Identity & access → Users, confirm Deactivate/Activate/Remove access still work exactly as before for an Admin/Principal-role account, with the original "deactivated"/"removed" wording (not the new suspension wording).
