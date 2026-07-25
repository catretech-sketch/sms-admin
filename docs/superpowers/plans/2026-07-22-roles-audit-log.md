# Role-Permission Templates + School Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back the Identity & access screen's `RolesTab` (tenant-level role→capability
overrides) and `AuditTab` (school-scoped activity trail) with real, tested
backend endpoints instead of mock/local-only state.

**Architecture:** Two additive backend features sharing the existing
Dapper/FluentMigrator/stored-proc layering (migration → proc → DAO → service →
controller), plus frontend API modules/hooks/tab rewires in `sms-admin`. Role
templates reuse the exact `UserPermissions_Get`/`Set` delete-then-insert proc
pattern, keyed by `Role` instead of `UserId`. Audit reuses the existing
`AuditLog` table/`AuditRepository`/`Audit_Insert` proc — no new table.

**Tech Stack:** .NET (Dapper, FluentMigrator, xUnit) in `sms-backend`; React +
TypeScript + Vitest + React Query in `sms-admin`.

## Global Constraints

- Backend: `sms-backend` repo, path `D:\SMS\sms-project\sms-backend`.
- Frontend: `sms-admin` repo, path `D:\SMS\sms-project\sms-admin` (this repo).
- Backend tenant scoping: `TenantId` passed explicitly from `ITenantContext`
  into every service/DAO call, plus RLS as defense in depth — same convention
  as `Users`/`UserPermissions`.
- Backend snake_case JSON envelope `{ data }` (`FromResult`) or
  `{ data, next_cursor }` (`CursorOk`/`FromCursorResult`); errors `{ error:
  {code, message, details} }`.
- Role-template rows are restricted to `admin`, `principal`, `vice_principal`,
  `teacher`, `staff` — **never** `owner** (Owner is a system role; see spec
  Rules section). Enforced at both the proc (`OPENJSON` filter whitelist) and
  service layer (`AssignableRoleTemplateRoles` set) — defense in depth.
- Frontend: run `npx tsc -b --noEmit` after each UI task; run the specific
  vitest file after each task that adds/changes tests.
- Frequent small commits — one per task, per repo.
- Full spec: `docs/superpowers/specs/2026-07-22-roles-audit-design.md` (this
  repo). Read it before Task 1 if anything below is ambiguous.

---

## File Map

| File | Repo | Change |
|---|---|---|
| `db/Sms.Migrations/M0080_RoleTemplateOverrides_Table.cs` | backend | New migration |
| `db/Sms.Migrations/procs/saas/RoleTemplate_Get.sql`, `RoleTemplate_Set.sql` | backend | New procs |
| `src/Sms.Application/DTOs/Users/RoleTemplateModels.cs` | backend | New DTOs |
| `src/Sms.Application/Interfaces/DAO/IRoleTemplateDao.cs`, `src/Sms.Infrastructure/DAO/RoleTemplateDao.cs` | backend | New DAO |
| `src/Sms.Infrastructure/DependencyInjection.cs` | backend | Register `IRoleTemplateDao` |
| `src/Sms.Application/Services/Users/UserService.cs` | backend | Add role-template methods; audit instrumentation on 3 methods |
| `src/Sms.Api/Controllers/UserController.cs` | backend | Add `GET/PUT roles/permissions` |
| `src/Sms.Modules.Tenancy/Data/CatreOpsRepositories.cs` | backend | Add `AuditRepository.ListForSchoolAsync` |
| `src/Sms.Api/Controllers/SchoolAuditController.cs` | backend | New controller, `GET v1/school/audit` |
| `src/api/roleTemplates.ts` (+ test) | frontend | New API module |
| `src/api/audit.ts` (+ test) | frontend | New API module |
| `src/api/hooks/useRoleTemplates.ts`, `src/api/hooks/useAudit.ts` | frontend | New hooks |
| `src/api/queryKeys.ts` | frontend | Add `roleTemplate`, `audit` keys |
| `src/lib/gating.ts` (+ test) | frontend | `effectiveCaps` tenant-override param |
| `src/screens/school/admin.tsx` | frontend | Rewire `RolesTab`, `AuditTab` |

---

## Task 1: Role-template table migration

**Files:**
- Create: `db/Sms.Migrations/M0080_RoleTemplateOverrides_Table.cs`

**Interfaces:**
- Produces: table `dbo.RoleTemplateOverrides(Id, TenantId, Role, Module, Cap,
  Effect, UpdatedAt, UpdatedByUserId)`, unique on `(TenantId, Role, Module,
  Cap)`, RLS via `rls.fn_tenant_predicate`.

- [ ] **Step 1: Write the migration**

```csharp
using FluentMigrator;

namespace Sms.Migrations;

[Migration(80, "Role-permission template overrides, tenant-scoped")]
public sealed class M0080_RoleTemplateOverrides_Table : Migration
{
    public override void Up()
    {
        Create.Table("RoleTemplateOverrides")
            .WithColumn("Id").AsGuid().PrimaryKey().WithDefault(SystemMethods.NewSequentialId)
            .WithColumn("TenantId").AsGuid().NotNullable()
            .WithColumn("Role").AsString(32).NotNullable()
            .WithColumn("Module").AsString(64).NotNullable()
            .WithColumn("Cap").AsString(1).NotNullable()
            .WithColumn("Effect").AsString(8).NotNullable()
            .WithColumn("UpdatedAt").AsDateTime2().NotNullable().WithDefault(SystemMethods.CurrentUTCDateTime)
            .WithColumn("UpdatedByUserId").AsGuid().Nullable();

        Create.Index("IX_RoleTemplateOverrides_Tenant")
            .OnTable("RoleTemplateOverrides").OnColumn("TenantId").Ascending();

        Execute.Sql(
            "CREATE UNIQUE INDEX UX_RoleTemplateOverrides_Cell ON dbo.RoleTemplateOverrides " +
            "(TenantId, Role, Module, Cap);");

        Execute.Sql(
            "CREATE SECURITY POLICY rls.RoleTemplateOverridesTenantPolicy " +
            "ADD FILTER PREDICATE rls.fn_tenant_predicate(TenantId) ON dbo.RoleTemplateOverrides, " +
            "ADD BLOCK PREDICATE rls.fn_tenant_predicate(TenantId) ON dbo.RoleTemplateOverrides AFTER INSERT " +
            "WITH (STATE = ON);");
    }

    public override void Down()
    {
        Execute.Sql("DROP SECURITY POLICY IF EXISTS rls.RoleTemplateOverridesTenantPolicy;");
        Delete.Table("RoleTemplateOverrides");
    }
}
```

- [ ] **Step 2: Confirm the migration applies cleanly**

`db/Sms.Migrations/MigrateCli.cs` requires an explicit connection string
argument — there is no bare `-- up` form. The simplest way to confirm this
migration applies without error is to run any existing integration test in
the `"sql"` collection: `SqlServerFixture.InitializeAsync()` (in
`tests/Sms.Tests.Integration/SqlServerFixture.cs`) creates a fresh ephemeral
database and calls `MigrationRunner.Run(ConnectionString)` — which runs
**every** migration, including this new one — before each test class in that
collection.

```
dotnet test --filter FullyQualifiedName~InvitationDaoTests
```
Expected: PASS (this also proves migration 80 applied with no error — if it
had failed, `MigrationRunner.Run` would throw during test setup and the whole
run would error out, not just fail assertions).

- [ ] **Step 3: Commit**

```bash
git add db/Sms.Migrations/M0080_RoleTemplateOverrides_Table.cs
git commit -m "feat(identity): add RoleTemplateOverrides table migration"
```

---

## Task 2: Role-template procs

**Files:**
- Create: `db/Sms.Migrations/procs/saas/RoleTemplate_Get.sql`
- Create: `db/Sms.Migrations/procs/saas/RoleTemplate_Set.sql`
- Create: `db/Sms.Migrations/M0081_Procs_RoleTemplate.cs`

**Interfaces:**
- Produces: `dbo.RoleTemplate_Get(@TenantId)` → rows `(Role, Module, Cap,
  Effect)`; `dbo.RoleTemplate_Set(@TenantId, @Json)` → replace-style write,
  consumed by Task 4's `RoleTemplateDao`.

`.sql` files under `procs/` are NOT auto-discovered — the `.csproj` embeds
them as resources (`<EmbeddedResource Include="procs/**/*.sql" />`), but each
one only actually gets `CREATE OR ALTER`'d against the database when a
migration explicitly loads it via `M0003_Procs_Auth.EmbeddedProcs("procs.saas.<Name>")`
and executes the result. `M0058_User_Permissions_ById.cs` is the exact model
for this task — mirror it precisely.

- [ ] **Step 1: Write `RoleTemplate_Get.sql`**

```sql
CREATE OR ALTER PROCEDURE dbo.RoleTemplate_Get
    @TenantId uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Role, Module, Cap, Effect
    FROM dbo.RoleTemplateOverrides
    WHERE TenantId = @TenantId
    ORDER BY Role, Module, Cap;
END
```

- [ ] **Step 2: Write `RoleTemplate_Set.sql`**

```sql
CREATE OR ALTER PROCEDURE dbo.RoleTemplate_Set
    @TenantId uniqueidentifier,
    @Json nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.RoleTemplateOverrides WHERE TenantId = @TenantId;

    IF @Json IS NULL OR LTRIM(RTRIM(@Json)) IN (N'', N'[]')
        RETURN;

    INSERT INTO dbo.RoleTemplateOverrides (TenantId, Role, Module, Cap, Effect)
    SELECT @TenantId, j.role, j.module, j.cap, j.effect
    FROM OPENJSON(@Json)
    WITH (
        role nvarchar(32) '$.role',
        module nvarchar(64) '$.module',
        cap char(1) '$.cap',
        effect nvarchar(8) '$.effect'
    ) j
    WHERE j.role IN ('admin', 'principal', 'vice_principal', 'teacher', 'staff')
      AND j.module IS NOT NULL
      AND j.cap IN ('V', 'E', 'A')
      AND j.effect IN ('grant', 'revoke');
END
```

- [ ] **Step 3: Write the migration that loads and executes both procs**

```csharp
using System.Linq;
using FluentMigrator;

namespace Sms.Migrations;

[Migration(81, "Role-template get/set procs (embedded CREATE OR ALTER)")]
public sealed class M0081_Procs_RoleTemplate : Migration
{
    public override void Up()
    {
        foreach (var sql in M0003_Procs_Auth.EmbeddedProcs("procs.saas.RoleTemplate_Get")
            .Concat(M0003_Procs_Auth.EmbeddedProcs("procs.saas.RoleTemplate_Set")))
            Execute.Sql(sql);
    }

    public override void Down()
    {
        Execute.Sql("DROP PROCEDURE IF EXISTS dbo.RoleTemplate_Get;");
        Execute.Sql("DROP PROCEDURE IF EXISTS dbo.RoleTemplate_Set;");
    }
}
```

- [ ] **Step 4: Confirm the procs apply cleanly**

```
dotnet test --filter FullyQualifiedName~InvitationDaoTests
```
Expected: PASS. `SqlServerFixture.InitializeAsync()` runs every migration
(including 80 and 81) against a fresh ephemeral database before any test in
the `"sql"` collection runs, so a pass here proves both procs parse and apply
with no SQL syntax error. Full behavioral verification of
`RoleTemplate_Get`/`RoleTemplate_Set` (including that an `owner` row is
silently dropped) happens in Task 3's automated DAO tests, which call these
procs directly.

- [ ] **Step 5: Commit**

```bash
git add db/Sms.Migrations/procs/saas/RoleTemplate_Get.sql \
        db/Sms.Migrations/procs/saas/RoleTemplate_Set.sql \
        db/Sms.Migrations/M0081_Procs_RoleTemplate.cs
git commit -m "feat(identity): add RoleTemplate_Get/Set stored procedures"
```

---

## Task 3: Role-template DTOs and DAO

**Files:**
- Create: `src/Sms.Application/DTOs/Users/RoleTemplateModels.cs`
- Create: `src/Sms.Application/Interfaces/DAO/IRoleTemplateDao.cs`
- Create: `src/Sms.Infrastructure/DAO/RoleTemplateDao.cs`
- Modify: `src/Sms.Infrastructure/DependencyInjection.cs`
- Test: `tests/Sms.Tests.Integration/Saas/RoleTemplateDaoTests.cs`

**Interfaces:**
- Produces: `RoleTemplateOverrideDto(Role, Module, Cap, Effect)`,
  `IRoleTemplateDao.GetAsync(tenantId)`, `IRoleTemplateDao.SetAsync(tenantId,
  overrides)` — consumed by Task 4 (`UserService`).

This backend has no mocking framework — every DAO/service is tested against a
real SQL Server via `SqlServerFixture` (`[Collection("sql")]`), exactly as
`tests/Sms.Tests.Integration/Saas/InvitationDaoTests.cs` does. Match that file
verbatim in structure.

- [ ] **Step 1: Write `RoleTemplateModels.cs`**

```csharp
namespace Sms.Application.DTOs.Users;

public sealed record RoleTemplateOverrideDto(string Role, string Module, string Cap, string Effect);
public sealed record SetRoleTemplateRequest(RoleTemplateOverrideDto[] Overrides);
```

- [ ] **Step 2: Write `IRoleTemplateDao.cs`**

```csharp
using Sms.Application.DTOs.Users;

namespace Sms.Application.Interfaces.DAO;

public interface IRoleTemplateDao
{
    Task<IReadOnlyList<RoleTemplateOverrideDto>> GetAsync(Guid tenantId, CancellationToken ct = default);
    Task SetAsync(Guid tenantId, IReadOnlyList<RoleTemplateOverrideDto> overrides, CancellationToken ct = default);
}
```

- [ ] **Step 3: Write failing DAO test**

```csharp
using Dapper;
using FluentAssertions;
using Sms.Application.DTOs.Users;
using Sms.Application.Interfaces.DAO;
using Sms.Infrastructure.DAO;
using Sms.Shared.Kernel.Data;
using Sms.Shared.Kernel.Tenancy;
using Xunit;

namespace Sms.Tests.Integration.Saas;

[Collection("sql")]
public class RoleTemplateDaoTests(SqlServerFixture fx)
{
    private async Task<Guid> SeedTenantAsync()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        var tenantId = Guid.NewGuid();
        await using var c = await factory.OpenAsync();
        await c.ExecuteAsync(
            "INSERT dbo.Tenants (Id, Name, Slug, Status, Tier) VALUES (@id,'T',@s,'active','gold')",
            new { id = tenantId, s = $"t{tenantId:N}" });
        return tenantId;
    }

    private IRoleTemplateDao Dao()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        return new RoleTemplateDao(new SqlConnectionFactory(fx.ConnectionString, ctx));
    }

    [Fact]
    public async Task SetAsync_then_GetAsync_round_trips_overrides()
    {
        var tenantId = await SeedTenantAsync();
        var dao = Dao();

        await dao.SetAsync(tenantId, [new RoleTemplateOverrideDto("teacher", "fees", "E", "grant")]);
        var rows = await dao.GetAsync(tenantId);

        rows.Should().ContainSingle(r =>
            r.Role == "teacher" && r.Module == "fees" && r.Cap == "E" && r.Effect == "grant");
    }

    [Fact]
    public async Task SetAsync_replaces_the_full_set_for_a_tenant()
    {
        var tenantId = await SeedTenantAsync();
        var dao = Dao();

        await dao.SetAsync(tenantId, [
            new RoleTemplateOverrideDto("teacher", "fees", "E", "grant"),
            new RoleTemplateOverrideDto("staff", "sis", "V", "grant"),
        ]);
        await dao.SetAsync(tenantId, [new RoleTemplateOverrideDto("teacher", "fees", "E", "grant")]);

        var rows = await dao.GetAsync(tenantId);
        rows.Should().ContainSingle();
    }
}
```

- [ ] **Step 4: Run to confirm failure**

```
dotnet test --filter RoleTemplateDaoTests
```
Expected: FAIL — `RoleTemplateDao` does not exist.

- [ ] **Step 5: Write `RoleTemplateDao.cs`**

```csharp
using System.Text.Json;
using Sms.Application.DTOs.Users;
using Sms.Application.Interfaces.DAO;
using Sms.Shared.Kernel.Data;

namespace Sms.Infrastructure.DAO;

public sealed class RoleTemplateDao(IDbConnectionFactory factory) : BaseRepository(factory), IRoleTemplateDao
{
    public async Task<IReadOnlyList<RoleTemplateOverrideDto>> GetAsync(Guid tenantId, CancellationToken ct = default)
    {
        var rows = await QueryProcAsync<RoleTemplateRow>("dbo.RoleTemplate_Get", new { TenantId = tenantId }, ct);
        return rows.Select(r => new RoleTemplateOverrideDto(r.Role, r.Module, r.Cap, r.Effect)).ToList();
    }

    public Task SetAsync(Guid tenantId, IReadOnlyList<RoleTemplateOverrideDto> overrides, CancellationToken ct = default)
    {
        var json = JsonSerializer.Serialize(
            overrides.Select(o => new { role = o.Role, module = o.Module, cap = o.Cap, effect = o.Effect }));
        return ExecuteProcAsync("dbo.RoleTemplate_Set", new { TenantId = tenantId, Json = json }, ct);
    }

    private sealed record RoleTemplateRow(string Role, string Module, string Cap, string Effect);
}
```

- [ ] **Step 6: Register in DI**

Modify `src/Sms.Infrastructure/DependencyInjection.cs`:

```csharp
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureDaos(this IServiceCollection services)
    {
        services.AddScoped<IAuthDao, AuthDao>();
        services.AddScoped<IUserProvisioningDao, UserProvisioningDao>();
        services.AddScoped<IInvitationDao, InvitationDao>();
        services.AddScoped<IRoleTemplateDao, RoleTemplateDao>();   // ← ADD THIS LINE
        return services;
    }
}
```

- [ ] **Step 7: Run tests**

```
dotnet test --filter RoleTemplateDaoTests
```
Expected: both tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/Sms.Application/DTOs/Users/RoleTemplateModels.cs \
        src/Sms.Application/Interfaces/DAO/IRoleTemplateDao.cs \
        src/Sms.Infrastructure/DAO/RoleTemplateDao.cs \
        src/Sms.Infrastructure/DependencyInjection.cs \
        tests/Sms.Tests.Integration/Saas/RoleTemplateDaoTests.cs
git commit -m "feat(identity): add RoleTemplateDao with get/set round-trip tests"
```

---

## Task 4: Service methods + audit instrumentation on `UserService`

**Files:**
- Modify: `src/Sms.Application/Services/Users/UserService.cs`

**Interfaces:**
- Consumes: `IRoleTemplateDao` (Task 3), `AuditRepository.InsertAsync` (already
  exists in `src/Sms.Modules.Tenancy/Data/CatreOpsRepositories.cs`).
- Produces: `IUserService.GetRoleTemplateAsync(isSchoolAdmin, ct)`,
  `IUserService.SetRoleTemplateAsync(req, isSchoolAdmin, ct)` — consumed by
  Task 5 (`UserController`).

This backend has no isolated service-layer unit tests anywhere (confirmed: no
file under `tests/` references `UserService` directly) — every service is
verified through real HTTP calls against a real DB (`InvitationLifecycleTests.cs`
is the model). This task is implementation-only; Task 5 adds the HTTP-level
test that exercises everything written here (and can't go green until Task
5's controller routes exist, so red/green happens at that boundary instead).

- [ ] **Step 1: Extend `IUserService` and constructor**

```csharp
public interface IUserService
{
    // ...existing members unchanged...
    Task<ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>> GetRoleTemplateAsync(bool isSchoolAdmin, CancellationToken ct = default);
    Task<ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>> SetRoleTemplateAsync(SetRoleTemplateRequest req, bool isSchoolAdmin, CancellationToken ct = default);
}

public sealed class UserService(
    IUserProvisioningDao dao,
    ITenantContext tenant,
    IAuthService auth,
    ClientRepository clients,
    IInvitationDao invitations,
    IRoleTemplateDao roleTemplates,      // ← ADD
    AuditRepository audit) : IUserService  // ← ADD
{
    private static readonly HashSet<string> AssignableRoleTemplateRoles = new(
        ["admin", "principal", "vice_principal", "teacher", "staff"], StringComparer.OrdinalIgnoreCase);

    // ...BaseAssignableRoles / AssignableFor unchanged...
```

- [ ] **Step 2: Add the two role-template methods**

Add after `SetPermissionsAsync`:

```csharp
    public async Task<ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>> GetRoleTemplateAsync(
        bool isSchoolAdmin, CancellationToken ct = default)
    {
        if (!isSchoolAdmin)
            return ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>.Fail(new Error("forbidden", "no tenant context"), 403);

        return ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>.Ok(await roleTemplates.GetAsync(tid, ct));
    }

    public async Task<ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>> SetRoleTemplateAsync(
        SetRoleTemplateRequest req, bool isSchoolAdmin, CancellationToken ct = default)
    {
        if (!isSchoolAdmin)
            return ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>.Fail(new Error("forbidden", "no tenant context"), 403);

        var cleaned = (req.Overrides ?? [])
            .Where(o => AssignableRoleTemplateRoles.Contains(o.Role)
                        && !string.IsNullOrWhiteSpace(o.Module)
                        && o.Cap is "V" or "E" or "A"
                        && o.Effect is "grant" or "revoke")
            .Select(o => new RoleTemplateOverrideDto(
                o.Role.Trim().ToLowerInvariant(), o.Module.Trim().ToLowerInvariant(), o.Cap, o.Effect))
            .ToList();

        await roleTemplates.SetAsync(tid, cleaned, ct);
        await audit.InsertAsync(tenant.UserId, null, null, "role_template.updated",
            $"{cleaned.Count} override(s)", "identity", tid, ct);

        return ApiResult<IReadOnlyList<RoleTemplateOverrideDto>>.Ok(await roleTemplates.GetAsync(tid, ct));
    }
```

- [ ] **Step 3: Instrument `SetRolesAsync` and `SetPermissionsAsync`**

In `SetRolesAsync`, right after `await dao.ReplaceRolesAsync(userId, req.Roles, ct);`:

```csharp
        await dao.ReplaceRolesAsync(userId, req.Roles, ct);
        await audit.InsertAsync(tenant.UserId, null, null, "user.role_changed",
            $"{userId}: {string.Join(",", req.Roles)}", "identity", tid, ct);   // ← ADD
        var row = (await dao.ListByTenantAsync(tid, ct)).FirstOrDefault(u => u.Id == userId);
```

In `SetPermissionsAsync`, right after `await dao.SetPermissionsAsync(userId, cleaned, ct);`:

```csharp
        await dao.SetPermissionsAsync(userId, cleaned, ct);
        await audit.InsertAsync(tenant.UserId, null, null, "user.permissions_changed",
            userId.ToString(), "identity", tid, ct);   // ← ADD
        return ApiResult<IReadOnlyList<PermissionOverrideDto>>.Ok(await dao.GetPermissionsAsync(userId, ct));
```

- [ ] **Step 4: Build**

```
dotnet build
```
Expected: 0 errors. (No test run here by design — see the note above; Task 5
verifies this task's behavior end-to-end over HTTP.)

- [ ] **Step 5: Commit**

```bash
git add src/Sms.Application/Services/Users/UserService.cs
git commit -m "feat(identity): role-template service methods + audit instrumentation on role/permission changes"
```

---

## Task 5: Role-template controller routes + end-to-end lifecycle test

**Files:**
- Modify: `src/Sms.Api/Controllers/UserController.cs`
- Create: `tests/Sms.Tests.Integration/Saas/RoleTemplateLifecycleTests.cs`

**Interfaces:**
- Consumes: `IUserService.GetRoleTemplateAsync`/`SetRoleTemplateAsync` (Task 4).
- Produces: `GET v1/roles/permissions`, `PUT v1/roles/permissions`.

This is where Task 4's service methods and audit instrumentation actually get
exercised — following the `WebApplicationFactory<Program>` +
`SqlServerFixture` + real-JWT-client pattern in
`tests/Sms.Tests.Integration/Saas/InvitationLifecycleTests.cs`.

- [ ] **Step 1: Write the failing test**

```csharp
using System.Net;
using System.Net.Http.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Data;
using Sms.Shared.Kernel.Time;
using Sms.Shared.Kernel.Tenancy;
using Xunit;

namespace Sms.Tests.Integration.Saas;

[Collection("sql")]
public class RoleTemplateLifecycleTests(SqlServerFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", Key);
        });

    private static HttpClient AdminClient(WebApplicationFactory<Program> app, Guid tenantId, Guid userId)
    {
        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var token = jwt.IssueAccess(userId, tenantId, ["school.admin"], isPlatform: false);
        var c = app.CreateClient();
        c.DefaultRequestHeaders.Authorization = new("Bearer", token);
        return c;
    }

    private async Task<Guid> SeedActiveTenantAsync()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        var id = Guid.NewGuid();
        await using var c = await factory.OpenAsync();
        await c.ExecuteAsync("INSERT dbo.Tenants (Id, Name, Slug, Status, Tier) VALUES (@id,'T',@s,'active','gold')",
            new { id, s = $"t{id:N}" });
        return id;
    }

    private async Task<int> CountAuditRowsAsync(Guid tenantId, string action)
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        await using var c = await factory.OpenAsync();
        return await c.QuerySingleAsync<int>(
            "SELECT COUNT(*) FROM dbo.AuditLog WHERE TenantId = @tenantId AND Action = @action",
            new { tenantId, action });
    }

    [Fact]
    public async Task Set_then_get_round_trips_and_writes_an_audit_row()
    {
        var tenantId = await SeedActiveTenantAsync();
        await using var app = App();
        var admin = AdminClient(app, tenantId, Guid.NewGuid());

        var put = await admin.PutAsJsonAsync("/v1/roles/permissions", new
        {
            overrides = new[] { new { role = "teacher", module = "fees", cap = "E", effect = "grant" } },
        });
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var get = await admin.GetFromJsonAsync<RoleTemplateEnvelope>("/v1/roles/permissions");
        get!.Data.Should().ContainSingle(r => r.Role == "teacher" && r.Module == "fees" && r.Cap == "E" && r.Effect == "grant");

        (await CountAuditRowsAsync(tenantId, "role_template.updated")).Should().Be(1);
    }

    [Fact]
    public async Task Owner_role_rows_are_silently_dropped()
    {
        var tenantId = await SeedActiveTenantAsync();
        await using var app = App();
        var admin = AdminClient(app, tenantId, Guid.NewGuid());

        await admin.PutAsJsonAsync("/v1/roles/permissions", new
        {
            overrides = new[] { new { role = "owner", module = "fees", cap = "A", effect = "grant" } },
        });

        var get = await admin.GetFromJsonAsync<RoleTemplateEnvelope>("/v1/roles/permissions");
        get!.Data.Should().BeEmpty();
    }

    private sealed record RoleTemplateOverrideWire(string Role, string Module, string Cap, string Effect);
    private sealed record RoleTemplateEnvelope(RoleTemplateOverrideWire[] Data);
}
```

- [ ] **Step 2: Run to confirm failure**

```
dotnet test --filter RoleTemplateLifecycleTests
```
Expected: FAIL — 404 Not Found (`/v1/roles/permissions` doesn't exist yet).

- [ ] **Step 3: Add the two actions**

```csharp
    [HttpGet("roles/permissions")]
    public async Task<IActionResult> GetRoleTemplate(CancellationToken ct) =>
        FromResult(await users.GetRoleTemplateAsync(IsSchoolAdmin(), ct));

    [HttpPut("roles/permissions")]
    public async Task<IActionResult> SetRoleTemplate([FromBody] SetRoleTemplateRequest req, CancellationToken ct) =>
        FromResult(await users.SetRoleTemplateAsync(req, IsSchoolAdmin(), ct));
```

Add these directly after the existing `SetPermissions` action and before the
`private bool IsSchoolAdmin()` helper at the bottom of the class.

- [ ] **Step 4: Run tests**

```
dotnet test --filter RoleTemplateLifecycleTests
```
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Sms.Api/Controllers/UserController.cs \
        tests/Sms.Tests.Integration/Saas/RoleTemplateLifecycleTests.cs
git commit -m "feat(identity): add GET/PUT v1/roles/permissions endpoints with lifecycle test"
```

---

## Task 6: School-scoped audit read — repository method

**Files:**
- Modify: `src/Sms.Modules.Tenancy/Data/CatreOpsRepositories.cs`
- Create: `tests/Sms.Tests.Integration/Tenancy/AuditRepositoryTests.cs`

**Interfaces:**
- Produces: `AuditRepository.ListForSchoolAsync(tenantId, action, actorId,
  from, to, cursor, pageSize, ct) → (IReadOnlyList<AuditEntry> Data, string?
  NextCursor)` — consumed by Task 7 (`SchoolAuditController`).

No existing test file covers `AuditRepository` (confirmed by search). Follow
the same `SqlServerFixture` pattern as `RoleTemplateDaoTests.cs` (Task 3) and
`InvitationDaoTests.cs`.

- [ ] **Step 1: Write failing test**

```csharp
using Dapper;
using FluentAssertions;
using Sms.Modules.Tenancy.Data;
using Sms.Shared.Kernel.Data;
using Sms.Shared.Kernel.Tenancy;
using Xunit;

namespace Sms.Tests.Integration.Tenancy;

[Collection("sql")]
public class AuditRepositoryTests(SqlServerFixture fx)
{
    private async Task<Guid> SeedTenantAsync()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        var id = Guid.NewGuid();
        await using var c = await factory.OpenAsync();
        await c.ExecuteAsync("INSERT dbo.Tenants (Id, Name, Slug, Status, Tier) VALUES (@id,'T',@s,'active','gold')",
            new { id, s = $"t{id:N}" });
        return id;
    }

    private AuditRepository Repo()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        return new AuditRepository(new SqlConnectionFactory(fx.ConnectionString, ctx));
    }

    [Fact]
    public async Task ListForSchoolAsync_filters_by_tenant_and_paginates()
    {
        var tenantId = await SeedTenantAsync();
        var otherTenantId = await SeedTenantAsync();
        var repo = Repo();

        for (var i = 0; i < 3; i++)
            await repo.InsertAsync(Guid.NewGuid(), "Actor", "school.admin", "user.role_changed", $"target-{i}", "identity", tenantId);
        await repo.InsertAsync(Guid.NewGuid(), "Other", "school.admin", "user.role_changed", "other-target", "identity", otherTenantId);

        var (page1, cursor1) = await repo.ListForSchoolAsync(tenantId, null, null, null, null, null, pageSize: 2);
        page1.Should().HaveCount(2);
        cursor1.Should().NotBeNull();

        var (page2, cursor2) = await repo.ListForSchoolAsync(tenantId, null, null, null, null, cursor1, pageSize: 2);
        page2.Should().ContainSingle();
        cursor2.Should().BeNull();
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```
dotnet test --filter ListForSchoolAsync_filters_by_tenant_and_paginates
```
Expected: FAIL — `ListForSchoolAsync` does not exist.

- [ ] **Step 3: Implement `ListForSchoolAsync`**

Add to the `AuditRepository` class in `CatreOpsRepositories.cs`, directly
after the existing `InsertAsync`:

```csharp
    public async Task<(IReadOnlyList<AuditEntry> Data, string? NextCursor)> ListForSchoolAsync(
        Guid tenantId, string? action, Guid? actorId, DateTime? from, DateTime? to,
        string? cursor, int pageSize, CancellationToken ct = default)
    {
        DateTime? cursorAt = cursor is null ? null : DateTime.Parse(cursor, null, System.Globalization.DateTimeStyles.RoundtripKind);

        var rows = await QueryInlineAsync<AuditEntry>(
            "SELECT TOP (@take) Id, ActorId, ActorName, Role, Action, Target, Kind, At AS [Time] " +
            "FROM dbo.AuditLog WHERE TenantId = @tenantId " +
            "AND (@action IS NULL OR Action = @action) " +
            "AND (@actorId IS NULL OR ActorId = @actorId) " +
            "AND (@from IS NULL OR At >= @from) AND (@to IS NULL OR At <= @to) " +
            "AND (@cursorAt IS NULL OR At < @cursorAt) " +
            "ORDER BY At DESC",
            new { tenantId, action, actorId, from, to, cursorAt, take = pageSize + 1 }, ct);

        var hasMore = rows.Count > pageSize;
        var page = hasMore ? rows.Take(pageSize).ToList() : (IReadOnlyList<AuditEntry>)rows;
        var nextCursor = hasMore ? page[^1].Time.ToString("O") : null;
        return (page, nextCursor);
    }
```

- [ ] **Step 4: Run tests**

```
dotnet test --filter ListForSchoolAsync_filters_by_tenant_and_paginates
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Sms.Modules.Tenancy/Data/CatreOpsRepositories.cs \
        tests/Sms.Tests.Integration/Tenancy/AuditRepositoryTests.cs
git commit -m "feat(identity): add AuditRepository.ListForSchoolAsync with tenant-scoped cursor pagination"
```

---

## Task 7: School-scoped audit controller

**Files:**
- Create: `src/Sms.Api/Controllers/SchoolAuditController.cs`
- Modify: `tests/Sms.Tests.Integration/Saas/RoleTemplateLifecycleTests.cs`
  (add one test to the existing file from Task 5 — it already has the
  `App()`/`AdminClient()`/`SeedActiveTenantAsync()` scaffolding this needs)

**Interfaces:**
- Consumes: `AuditRepository.ListForSchoolAsync` (Task 6), `ITenantContext`.
- Produces: `GET v1/school/audit` — consumed by frontend Task 12
  (`src/api/audit.ts`).

- [ ] **Step 1: Write the failing test**

Add to `RoleTemplateLifecycleTests.cs` (from Task 5), reusing its
`App`/`AdminClient`/`SeedActiveTenantAsync` helpers:

```csharp
    [Fact]
    public async Task School_audit_endpoint_returns_only_the_caller_tenants_rows()
    {
        var tenantId = await SeedActiveTenantAsync();
        var otherTenantId = await SeedActiveTenantAsync();
        await using var app = App();
        var admin = AdminClient(app, tenantId, Guid.NewGuid());

        await admin.PutAsJsonAsync("/v1/roles/permissions", new
        {
            overrides = new[] { new { role = "teacher", module = "fees", cap = "E", effect = "grant" } },
        });

        var otherAdmin = AdminClient(app, otherTenantId, Guid.NewGuid());
        await otherAdmin.PutAsJsonAsync("/v1/roles/permissions", new
        {
            overrides = new[] { new { role = "staff", module = "sis", cap = "V", effect = "grant" } },
        });

        var res = await admin.GetFromJsonAsync<AuditEnvelope>("/v1/school/audit?action=role_template.updated");
        res!.Data.Should().ContainSingle();
    }

    private sealed record AuditRow(string Id, string? ActorId, string? ActorName, string Action, string? Target, string At);
    private sealed record AuditEnvelope(AuditRow[] Data, string? NextCursor);
```

- [ ] **Step 2: Run to confirm failure**

```
dotnet test --filter School_audit_endpoint_returns_only_the_caller_tenants_rows
```
Expected: FAIL — 404 Not Found (`/v1/school/audit` doesn't exist yet).

- [ ] **Step 3: Write the controller**

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sms.Modules.Tenancy.Data;
using Sms.Shared.Kernel.Authz;
using Sms.Shared.Kernel.Tenancy;

namespace Sms.Api.Controllers;

[Route("v1/school")]
[Authorize]
public sealed class SchoolAuditController(AuditRepository audit, ITenantContext tenant) : ApiControllerBase
{
    [HttpGet("audit")]
    public async Task<IActionResult> List(
        string? action, [FromQuery(Name = "actor_id")] Guid? actorId,
        DateTime? from, DateTime? to, string? cursor, CancellationToken ct)
    {
        if (!IsSchoolAdmin())
            return ForbiddenResult("school admin only");
        if (tenant.TenantId is not { } tid)
            return ForbiddenResult("no tenant context");

        var (data, nextCursor) = await audit.ListForSchoolAsync(tid, action, actorId, from, to, cursor, pageSize: 50, ct);
        return CursorOk(data, nextCursor);
    }

    private bool IsSchoolAdmin() =>
        User.FindAll("role").Any(c => c.Value is Policies.SchoolAdmin or Policies.SchoolOwner);
}
```

- [ ] **Step 4: Build**

```
dotnet build
```
Expected: 0 errors.

- [ ] **Step 5: Run tests**

```
dotnet test --filter School_audit_endpoint_returns_only_the_caller_tenants_rows
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Sms.Api/Controllers/SchoolAuditController.cs \
        tests/Sms.Tests.Integration/Saas/RoleTemplateLifecycleTests.cs
git commit -m "feat(identity): add GET v1/school/audit endpoint, school-admin scoped"
```

---

## Task 8: `src/api/roleTemplates.ts` (frontend)

**Files:**
- Create: `src/api/roleTemplates.ts`
- Create: `src/api/roleTemplates.test.ts`

**Interfaces:**
- Produces: `RoleTemplateOverride { role: GateRole; module: string; cap: Cap;
  effect: 'grant' | 'revoke' }`, `getRoleTemplate(): Promise<RoleTemplateOverride[]>`,
  `setRoleTemplate(overrides): Promise<RoleTemplateOverride[]>` — consumed by
  Task 9 (hooks) and Task 11 (`RolesTab`).

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getRoleTemplate, setRoleTemplate } from './roleTemplates'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('getRoleTemplate', () => {
  it('GETs /roles/permissions and returns the override list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await getRoleTemplate()
    expect(rows).toEqual([{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }])
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/roles\/permissions$/)
  })

  it('returns an empty array when the API returns null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null })))
    expect(await getRoleTemplate()).toEqual([])
  })
})

describe('setRoleTemplate', () => {
  it('PUTs the overrides and returns the saved list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ role: 'staff', module: 'sis', cap: 'V', effect: 'grant' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await setRoleTemplate([{ role: 'staff', module: 'sis', cap: 'V', effect: 'grant' }])
    expect(rows).toEqual([{ role: 'staff', module: 'sis', cap: 'V', effect: 'grant' }])
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/roles\/permissions$/)
    expect(opts.method).toBe('PUT')
    const body = JSON.parse(opts.body as string)
    expect(body).toEqual({ overrides: [{ role: 'staff', module: 'sis', cap: 'V', effect: 'grant' }] })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```
npx vitest run src/api/roleTemplates.test.ts
```
Expected: FAIL — module `./roleTemplates` not found.

- [ ] **Step 3: Write `roleTemplates.ts`**

```typescript
import { request } from './client'
import type { Cap, GateRole } from '@/types'

export interface RoleTemplateOverride {
  role: GateRole
  module: string
  cap: Cap
  effect: 'grant' | 'revoke'
}

export async function getRoleTemplate(): Promise<RoleTemplateOverride[]> {
  const data = await request<RoleTemplateOverride[]>('/roles/permissions')
  return data ?? []
}

export async function setRoleTemplate(overrides: RoleTemplateOverride[]): Promise<RoleTemplateOverride[]> {
  const data = await request<RoleTemplateOverride[]>('/roles/permissions', {
    method: 'PUT',
    body: { overrides },
  })
  return data ?? []
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/api/roleTemplates.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/roleTemplates.ts src/api/roleTemplates.test.ts
git commit -m "feat(identity): add roleTemplates API module"
```

---

## Task 9: `useRoleTemplates` hooks + query key

**Files:**
- Modify: `src/api/queryKeys.ts`
- Create: `src/api/hooks/useRoleTemplates.ts`

**Interfaces:**
- Consumes: `getRoleTemplate`/`setRoleTemplate` (Task 8).
- Produces: `useRoleTemplate(): UseQueryResult<RoleTemplateOverride[]>`,
  `useSetRoleTemplate(): UseMutationResult<RoleTemplateOverride[], Error,
  RoleTemplateOverride[]>` — consumed by Task 11 (`RolesTab`).

- [ ] **Step 1: Add the query key**

In `src/api/queryKeys.ts`, add after the `users` block:

```typescript
  roleTemplate: {
    all: ['roleTemplate'] as const,
  },
```

- [ ] **Step 2: Write the hooks**

```typescript
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { getRoleTemplate, setRoleTemplate, type RoleTemplateOverride } from '../roleTemplates'
import { queryKeys } from '../queryKeys'

export function useRoleTemplate(): UseQueryResult<RoleTemplateOverride[]> {
  return useQuery({
    queryKey: queryKeys.roleTemplate.all,
    queryFn: getRoleTemplate,
  })
}

export function useSetRoleTemplate(): UseMutationResult<RoleTemplateOverride[], Error, RoleTemplateOverride[]> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (overrides: RoleTemplateOverride[]) => setRoleTemplate(overrides),
    onSuccess: (data) => { qc.setQueryData(queryKeys.roleTemplate.all, data) },
  })
}
```

- [ ] **Step 3: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/api/queryKeys.ts src/api/hooks/useRoleTemplates.ts
git commit -m "feat(identity): add useRoleTemplate/useSetRoleTemplate hooks"
```

---

## Task 10: `gating.ts` — tenant-override layer in `effectiveCaps`

**Files:**
- Modify: `src/lib/gating.ts`
- Modify: `src/lib/gating.test.ts`

**Interfaces:**
- Consumes: `RoleTemplateOverride[]` (Task 8's type).
- Produces: `effectiveCaps(role, module, overrides, tenantOverrides?):
  Cap[]` — 4th param optional, defaults to `[]`, no behavior change for
  existing 3-arg callers. Consumed by Task 11 (`RolesTab` display) — note the
  screen's only other caller, `admin.tsx:1250` in `UsersTab`, keeps working
  unchanged since the param is optional (see spec's non-goal: this is NOT
  wired into app-wide `can()`/`caps()`).

- [ ] **Step 1: Write failing tests**

Add to `src/lib/gating.test.ts`, inside the `describe('per-user overrides', ...)`
block (or a new adjacent `describe`):

```typescript
describe('tenant role-template overrides', () => {
  it('a tenant grant adds a capability the static default lacks', () => {
    const tenantOv: RoleTemplateOverride[] = [{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }]
    expect(effectiveCaps('teacher', 'fees', {}, tenantOv)).toEqual(['E'])
  })
  it('a tenant revoke removes a capability the static default has', () => {
    const tenantOv: RoleTemplateOverride[] = [{ role: 'admin', module: 'sis', cap: 'E', effect: 'revoke' }]
    expect(effectiveCaps('admin', 'sis', {}, tenantOv)).toEqual([])
  })
  it('a per-user override still wins over a tenant override on the same cell', () => {
    const tenantOv: RoleTemplateOverride[] = [{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }]
    const userOv: UserOverrides = { fees: { E: 'revoke' } }
    expect(effectiveCaps('teacher', 'fees', userOv, tenantOv)).toEqual([])
  })
  it('defaults to no tenant overrides when the 4th arg is omitted', () => {
    expect(effectiveCaps('admin', 'sis', {})).toEqual(['E'])
  })
})
```

Add the import at the top of the test file:

```typescript
import type { RoleTemplateOverride } from '@/api/roleTemplates'
```

- [ ] **Step 2: Run to confirm failure**

```
npx vitest run src/lib/gating.test.ts
```
Expected: FAIL — tenant-revoke and win-precedence tests fail (grant test may
accidentally pass no-op since `effectiveCaps` currently ignores the 4th arg
entirely — the revoke test is the one that proves it's wired).

- [ ] **Step 3: Update `effectiveCaps` in `gating.ts`**

```typescript
import type { Tier, Role, GateRole, Cap, UserOverrides, CellState } from '@/types'
import type { RoleTemplateOverride } from '@/api/roleTemplates'
import { TIERS, FEATURE_TIER, PERMS } from '@/data/mockDb'

// ... tierIncludes, requiredTier, gateRole, can, caps unchanged ...

/** Effective caps for a user = role caps + tenant template overrides + per-user grants/revokes,
 *  ordered V→E→A. `tenantOverrides` defaults to none — existing 3-arg callers are unaffected. */
export function effectiveCaps(
  role: Role,
  module: string,
  overrides: UserOverrides,
  tenantOverrides: RoleTemplateOverride[] = [],
): Cap[] {
  const set = new Set<Cap>(caps(role, module))
  const gr = gateRole(role)
  for (const t of tenantOverrides) {
    if (t.role !== gr || t.module !== module) continue
    if (t.effect === 'grant') set.add(t.cap)
    else if (t.effect === 'revoke') set.delete(t.cap)
  }
  const mod = overrides[module]
  if (mod) {
    for (const cap of CAP_ORDER) {
      if (mod[cap] === 'grant') set.add(cap)
      else if (mod[cap] === 'revoke') set.delete(cap)
    }
  }
  return CAP_ORDER.filter((c) => set.has(c))
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/lib/gating.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gating.ts src/lib/gating.test.ts
git commit -m "feat(identity): effectiveCaps gains an optional tenant role-template override layer"
```

---

## Task 11: Rewire `RolesTab`

**Files:**
- Modify: `src/screens/school/admin.tsx`

**Interfaces:**
- Consumes: `useRoleTemplate`/`useSetRoleTemplate` (Task 9),
  `RoleTemplateOverride` type (Task 8).

- [ ] **Step 1: Confirm typecheck baseline**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Add imports**

Add near the other hook imports at the top of `admin.tsx`:

```typescript
import { useRoleTemplate, useSetRoleTemplate } from '@/api/hooks/useRoleTemplates'
import type { RoleTemplateOverride } from '@/api/roleTemplates'
```

- [ ] **Step 3: Add a merge helper next to `clonePerms`**

In the `/* ---------- Roles & permissions matrix ---------- */` block (around
line 1124), add directly after `clonePerms`:

```typescript
function applyTenantOverrides(base: Matrix, tenantOv: RoleTemplateOverride[]): Matrix {
  const out: Matrix = {}
  for (const mod of Object.keys(base)) {
    out[mod] = { admin: [...base[mod].admin], principal: [...base[mod].principal], vice_principal: [...base[mod].vice_principal], teacher: [...base[mod].teacher], staff: [...base[mod].staff] }
  }
  for (const t of tenantOv) {
    const row = out[t.module]?.[t.role]
    if (!row) continue
    if (t.effect === 'grant' && !row.includes(t.cap)) row.push(t.cap)
    if (t.effect === 'revoke') out[t.module][t.role] = row.filter((c) => c !== t.cap)
  }
  return out
}

function matrixToOverrides(matrix: Matrix): RoleTemplateOverride[] {
  const out: RoleTemplateOverride[] = []
  for (const mod of Object.keys(matrix)) {
    for (const role of ROLES) {
      for (const cap of matrix[mod][role]) out.push({ role, module: mod, cap, effect: 'grant' })
      for (const cap of PERMS[mod][role]) {
        if (!matrix[mod][role].includes(cap)) out.push({ role, module: mod, cap, effect: 'revoke' })
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Replace `RolesTab`**

Replace the whole function (currently lines 1285–1373) with:

```tsx
function RolesTab() {
  const toast = useToast()
  const templateQ = useRoleTemplate()
  const setTemplate = useSetRoleTemplate()
  const [matrix, setMatrix] = useState<Matrix>(clonePerms)
  const [loadedFromServer, setLoadedFromServer] = useState(false)

  useEffect(() => {
    if (templateQ.data && !loadedFromServer) {
      setMatrix(applyTenantOverrides(clonePerms(), templateQ.data))
      setLoadedFromServer(true)
    }
  }, [templateQ.data, loadedFromServer])

  const toggle = (mod: string, role: GateRole, cap: Cap) => {
    setMatrix((m) => {
      const cur = m[mod][role]
      const next = cur.includes(cap) ? cur.filter((c) => c !== cap) : [...cur, cap]
      return { ...m, [mod]: { ...m[mod], [role]: next } }
    })
  }

  const reset = () => {
    setMatrix(applyTenantOverrides(clonePerms(), templateQ.data ?? []))
    toast.info('Matrix reset', 'Reverted to the saved permission set.')
  }

  const save = () => {
    setTemplate.mutate(matrixToOverrides(matrix), {
      onSuccess: () => toast.success('Permissions saved', 'Role access updated for this school.'),
      onError: (e) => toast.danger('Could not save', e instanceof ApiError ? e.message : 'Try again.'),
    })
  }

  if (templateQ.isLoading) {
    return <Card><Spinner /></Card>
  }
  if (templateQ.isError) {
    return (
      <Card>
        <Empty icon="alert" title="Could not load permissions" body="Try again." />
        <div className="row jc-center" style={{ marginTop: 12 }}>
          <Btn variant="secondary" onClick={() => templateQ.refetch()}>Retry</Btn>
        </div>
      </Card>
    )
  }

  return (
    <div className="col gap16">
      <Card>
        <div className="row ai-center gap12 wrap">
          <span className="sm-kpi-ic" style={{ color: 'var(--brand-600)' }}><Icon name="shield" size={18} /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="fw7">Owner is a super-role</div>
            <div className="t-sm muted">
              Owner sits above the school and has full access to every module. It grants the four
              school roles their access below and <strong>cannot itself be restricted</strong>.
            </div>
          </div>
          <div className="row gap6 wrap">
            {CAPS.map((c) => <Badge key={c} tone={CAP_TONE[c]}>{c} · {CAP_LABEL[c]}</Badge>)}
          </div>
        </div>
      </Card>

      <Card pad={false}>
        <CardHead
          title="Permission matrix"
          sub="Tap V / E / A to grant or revoke per module, per role"
          icon="lock"
          action={
            <div className="row gap8">
              <Btn variant="ghost" size="sm" icon="refresh" onClick={reset}>Reset</Btn>
              <Btn variant="primary" size="sm" icon="check" disabled={setTemplate.isPending} onClick={save}>
                {setTemplate.isPending ? 'Saving…' : 'Save changes'}
              </Btn>
            </div>
          }
        />
        <div style={{ overflowX: 'auto' }}>
          <table className="sm-table">
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Module</th>
                <th className="ta-center">
                  <span className="row ai-center gap4" style={{ justifyContent: 'center' }}>
                    <Icon name="shield" size={13} /> Owner
                  </span>
                </th>
                {ROLES.map((r) => <th key={r} className="ta-center">{ROLE_META[r].label}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.keys(matrix).map((mod) => (
                <tr key={mod}>
                  <td>
                    <div className="fw6">{MODULE_LABEL[mod] ?? mod}</div>
                    <div className="t-xs muted">{mod}</div>
                  </td>
                  <td className="ta-center">
                    <div className="row gap4" style={{ justifyContent: 'center' }}>
                      {CAPS.map((c) => <CapChip key={c} cap={c} active locked />)}
                      <span style={{ color: 'var(--text-2)', alignSelf: 'center', marginLeft: 2 }}><Icon name="lock" size={13} /></span>
                    </div>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className="ta-center">
                      <div className="row gap4" style={{ justifyContent: 'center' }}>
                        {CAPS.map((c) => (
                          <CapChip key={c} cap={c} active={matrix[mod][r].includes(c)} onClick={() => toggle(mod, r, c)} />
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Update existing `admin.tsx` tests for `RolesTab`**

Find the test file covering `admin.tsx` (grep for `RolesTab` or `'Roles &
permissions'` in test files under `src/screens/school/`), add a case
mocking `useRoleTemplate`/`useSetRoleTemplate` (or stubbing `fetch` for
`/roles/permissions`, matching whatever mocking style that test file already
uses for other tabs in this same screen) and asserting `save()` calls the PUT
endpoint and shows a success toast.

- [ ] **Step 7: Manual browser test**

Identity & access → Roles & permissions tab → toggle a cap → Save changes →
refresh the page → confirm the toggle persisted (now reads from the API
instead of resetting to the static default).

- [ ] **Step 8: Commit**

```bash
git add src/screens/school/admin.tsx
git commit -m "feat(identity): wire RolesTab to real role-template API"
```

---

## Task 12: `src/api/audit.ts` (frontend)

**Files:**
- Create: `src/api/audit.ts`
- Create: `src/api/audit.test.ts`

**Interfaces:**
- Produces: `AuditEntry { id; actorId: string | null; actorName: string |
  null; action: string; target: string | null; at: string }`,
  `listAuditLog(params?): Promise<{ data: AuditEntry[]; nextCursor: string |
  null }>` — consumed by Task 13 (hooks) and Task 14 (`AuditTab`).

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listAuditLog } from './audit'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listAuditLog', () => {
  it('GETs /school/audit and maps the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'A-1', actor_id: 'U-1', actor_name: 'Ravi', action: 'user.role_changed', target: 'U-2', at: '2026-07-22T10:00:00Z' }],
      next_cursor: '2026-07-22T10:00:00Z',
    }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await listAuditLog()
    expect(result.data).toEqual([{ id: 'A-1', actorId: 'U-1', actorName: 'Ravi', action: 'user.role_changed', target: 'U-2', at: '2026-07-22T10:00:00Z' }])
    expect(result.nextCursor).toBe('2026-07-22T10:00:00Z')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/school\/audit/)
  })

  it('forwards filter params as query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listAuditLog({ action: 'user.role_changed', actorId: 'U-1', cursor: 'C-1' })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('action=user.role_changed')
    expect(url).toContain('actor_id=U-1')
    expect(url).toContain('cursor=C-1')
  })

  it('defaults to an empty page when the API returns null data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null, next_cursor: null })))
    const result = await listAuditLog()
    expect(result.data).toEqual([])
    expect(result.nextCursor).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```
npx vitest run src/api/audit.test.ts
```
Expected: FAIL — module `./audit` not found.

- [ ] **Step 3: Write `audit.ts`**

```typescript
import { listRequest } from './client'

export interface AuditEntry {
  id: string
  actorId: string | null
  actorName: string | null
  action: string
  target: string | null
  at: string
}

interface AuditEntryWire {
  id: string
  actor_id: string | null
  actor_name: string | null
  action: string
  target: string | null
  at: string
}

interface AuditEnvelope {
  data: AuditEntryWire[] | null
  next_cursor: string | null
}

export interface AuditParams {
  action?: string
  actorId?: string
  from?: string
  to?: string
  cursor?: string
}

export async function listAuditLog(params: AuditParams = {}): Promise<{ data: AuditEntry[]; nextCursor: string | null }> {
  const env = await listRequest<AuditEnvelope>('/school/audit', {
    query: {
      action: params.action,
      actor_id: params.actorId,
      from: params.from,
      to: params.to,
      cursor: params.cursor,
    },
  })
  return {
    data: (env.data ?? []).map((r) => ({
      id: r.id, actorId: r.actor_id, actorName: r.actor_name, action: r.action, target: r.target, at: r.at,
    })),
    nextCursor: env.next_cursor,
  }
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run src/api/audit.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/audit.ts src/api/audit.test.ts
git commit -m "feat(identity): add audit API module"
```

---

## Task 13: `useAuditLog` hook + query key

**Files:**
- Modify: `src/api/queryKeys.ts`
- Create: `src/api/hooks/useAudit.ts`

**Interfaces:**
- Consumes: `listAuditLog` (Task 12).
- Produces: `useAuditLog(params): UseQueryResult<{ data: AuditEntry[];
  nextCursor: string | null }>` — consumed by Task 14 (`AuditTab`).

- [ ] **Step 1: Add the query key**

In `src/api/queryKeys.ts`, add after the `roleTemplate` block:

```typescript
  audit: {
    list: (params: import('./audit').AuditParams = {}) => ['audit', 'list', params] as const,
  },
```

- [ ] **Step 2: Write the hook**

```typescript
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listAuditLog, type AuditEntry, type AuditParams } from '../audit'
import { queryKeys } from '../queryKeys'

export function useAuditLog(params: AuditParams = {}): UseQueryResult<{ data: AuditEntry[]; nextCursor: string | null }> {
  return useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => listAuditLog(params),
  })
}
```

- [ ] **Step 3: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/api/queryKeys.ts src/api/hooks/useAudit.ts
git commit -m "feat(identity): add useAuditLog hook"
```

---

## Task 14: Rewire `AuditTab`

**Files:**
- Modify: `src/screens/school/admin.tsx`

**Interfaces:**
- Consumes: `useAuditLog` (Task 13), `AuditEntry` type (Task 12).

- [ ] **Step 1: Add imports**

```typescript
import { useAuditLog } from '@/api/hooks/useAudit'
import type { AuditEntry } from '@/api/audit'
```

- [ ] **Step 2: Replace `AuditTab`**

Remove the `AUDIT` constant (lines 1422–1431) and replace the whole
`AuditTab` function (1433–1468) with:

```tsx
const AUDIT_ACTION_LABEL: Record<string, string> = {
  'user.role_changed': 'Changed role',
  'user.permissions_changed': 'Changed permissions',
  'role_template.updated': 'Updated role template',
}

function AuditTab() {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [rows, setRows] = useState<AuditEntry[]>([])
  const action = q.trim() || undefined
  const auditQ = useAuditLog({ action, cursor })

  useEffect(() => { setCursor(undefined); setRows([]) }, [action])
  useEffect(() => {
    if (!auditQ.data) return
    setRows((prev) => (cursor ? [...prev, ...auditQ.data.data] : auditQ.data.data))
  }, [auditQ.data, cursor])

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <Search value={q} onChange={setQ} placeholder="Filter by action, e.g. user.role_changed…" style={{ flex: 1, minWidth: 220 }} />
        <Badge tone="neutral" icon="clock">Recent activity</Badge>
      </div>
      {auditQ.isLoading && rows.length === 0 ? (
        <div style={{ padding: 24 }}><Spinner /></div>
      ) : auditQ.isError ? (
        <div style={{ padding: 8 }}>
          <Empty icon="alert" title="Could not load activity" body="Try again." />
          <div className="row jc-center" style={{ marginTop: 12 }}>
            <Btn variant="secondary" onClick={() => auditQ.refetch()}>Retry</Btn>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 8 }}><Empty icon="doc" title="No activity yet" body="Nothing matches that search." /></div>
      ) : (
        <div className="col">
          {rows.map((a) => (
            <div key={a.id} className="row ai-center gap12 wrap" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <Avatar name={a.actorName ?? 'System'} size={32} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="t-sm">
                  <span className="fw6">{a.actorName ?? 'System'}</span>{' '}
                  <span className="muted">{(AUDIT_ACTION_LABEL[a.action] ?? a.action).toLowerCase()}</span>{' '}
                  {a.target && <span className="fw6">{a.target}</span>}
                </div>
              </div>
              <Badge tone="info">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</Badge>
              <div className="t-xs muted" style={{ minWidth: 140, textAlign: 'right' }}>{new Date(a.at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      {auditQ.data?.nextCursor && (
        <div className="row jc-center" style={{ padding: 16 }}>
          <Btn variant="ghost" size="sm" disabled={auditQ.isFetching} onClick={() => setCursor(auditQ.data!.nextCursor!)}>
            {auditQ.isFetching ? 'Loading…' : 'Load more'}
          </Btn>
        </div>
      )}
    </Card>
  )
}
```

`rows` accumulates pages locally (React Query re-fetches per distinct
`{ action, cursor }` query key rather than appending on its own); changing the
search filter resets both `cursor` and the accumulated `rows`.

- [ ] **Step 3: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Update existing `admin.tsx` tests for `AuditTab`**

In the same test file touched in Task 11 Step 6, add cases for `AuditTab`:
loading state renders a spinner, error state shows a retry button that
refetches, empty state shows "No activity yet", and typing in the search box
re-queries with the typed text as the `action` filter (mock
`listAuditLog`/`fetch` accordingly, matching the file's existing mocking
style).

- [ ] **Step 5: Manual browser test**

Identity & access → Audit log tab → change a user's role from the Users tab →
switch to Audit log → confirm the new `user.role_changed` entry appears.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/admin.tsx
git commit -m "feat(identity): wire AuditTab to real school-scoped audit API"
```

---

## Task 15: Full verification

- [ ] **Step 1: Backend full test suite**

```
dotnet test
```
Expected: all PASS, including every new test added in Tasks 3, 4, 6.

- [ ] **Step 2: Frontend full test suite**

```
npx vitest run
```
Expected: all PASS.

- [ ] **Step 3: Frontend typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: End-to-end manual pass**

1. As a school admin: Identity & access → Roles & permissions → toggle a cap
   for Teacher → Save changes → reload the page → confirm it persisted.
2. Same session → Users tab → open a user's Permissions editor → confirm the
   "effective" caps shown reflect the tenant template change from step 1 for
   modules with no per-user override.
3. Same session → Audit log tab → confirm entries exist for the role-template
   save and any role/permission changes made during this pass, each showing
   the correct actor, action label, and target.
4. As a non-admin (teacher) role: confirm the Identity & access screen is
   still blocked entirely (`RestrictedScreen`) — this plan must not have
   changed `router.tsx`'s existing gate.

## Self-Review Checklist

| Requirement (from spec) | Covered |
|---|---|
| Owner/admin can override role capabilities, persisted per school | Tasks 1–5, 8–9, 11 |
| `effectiveCaps` layers static → tenant → per-user | Task 10 |
| Owner role is never editable (proc + service whitelist) | Tasks 2, 4 |
| Admin cannot assign/remove Owner role | Unchanged — `assignableSchoolRoles` (no code touched, confirmed by Task 15 Step 4.4 sibling check via existing gate) |
| School-scoped audit trail, readable by owner/admin only | Tasks 6–7, 12–14 |
| Audit entries for role/permission/role-template changes | Task 4 Step 5 |
| No new audit table | Task 6 (reuses `AuditLog`/`AuditRepository`) |
| `RolesTab`/`AuditTab` loading/empty/error states | Tasks 11, 14 |
| No app-wide `can()`/`caps()` rewiring (explicit non-goal) | Task 10 (optional 4th param only) |
| Tests for all new backend + frontend code | Every task has a test step |
| Frequent commits | One commit per task (14 commits total across both repos) |
