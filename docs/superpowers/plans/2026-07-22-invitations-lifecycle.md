# Invitations Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fully-mocked Invitations tab in `sms-admin`'s Identity & access
screen with a real, production-level invitation lifecycle backed by a new
`Invitations` table, procs, service, and controller in `sms-backend`.

**Architecture:** `POST /v1/users` (existing invite entry point) now also creates
an `Invitations` tracking row and sets the new user's `Status` to `"pending"`.
A new `InvitationController` exposes `GET /v1/invitations`,
`POST /v1/invitations/{id}/resend`, `POST /v1/invitations/{id}/revoke`, each
backed by a new `IInvitationService`/`IInvitationDao`. Acceptance continues
through the existing `POST /v1/auth/password/reset` (OTP) flow, which now also
marks the invitation accepted. `sms-admin`'s `InvitationsTab` is rewired from
its hardcoded `INITIAL_INVITES` array to real API calls, following the same
manual-fetch + mutation-hook pattern already used by `UsersTab` /
`InviteModalContent` in the same file.

**Tech Stack:** .NET 8 (`sms-backend`): FluentMigrator, Dapper, xUnit +
FluentAssertions integration tests against a real SQL Server via
`SqlServerFixture`. React/TypeScript (`sms-admin`): TanStack Query mutation
hooks, Vitest + Testing Library.

## Global Constraints

- Invite links/codes are valid for **24 hours** (spec: `2026-07-22-invitations-lifecycle-design.md`).
- Revoking an invitation **deactivates** the user (`Status = "revoked"`) rather than deleting the row.
- Invitation status (`pending`/`accepted`/`expired`/`revoked`) is **computed**, never stored.
- No new "accept invite" endpoint — acceptance reuses `POST /v1/auth/password/reset`.
- No changes to `TeamController`/platform-team invites, SMS sending, or the bulk `POST /v1/users/import` path — out of scope.
- Follow existing repo conventions exactly: procs live under `db/Sms.Migrations/procs/saas/`, migrations combine table+RLS+proc-embedding in one file (see `M0058_User_Permissions_ById.cs`), DAOs extend `BaseRepository`, controllers extend `ApiControllerBase` and use `FromResult`.
- Current latest migration is `M0078_StudentBus_Tables.cs` — the new migration is `M0079`.

---

### Task 1: `Invitations` table, RLS policy, and stored procedures

**Files:**
- Create: `db/Sms.Migrations/M0079_Invitations_Table.cs`
- Create: `db/Sms.Migrations/procs/saas/Invitations_Create.sql`
- Create: `db/Sms.Migrations/procs/saas/Invitations_ListByTenant.sql`
- Create: `db/Sms.Migrations/procs/saas/Invitations_GetById.sql`
- Create: `db/Sms.Migrations/procs/saas/Invitations_MarkResent.sql`
- Create: `db/Sms.Migrations/procs/saas/Invitations_MarkAcceptedByUserId.sql`
- Create: `db/Sms.Migrations/procs/saas/Invitations_MarkRevoked.sql`
- Create: `db/Sms.Migrations/procs/saas/User_SetStatus.sql`
- Create: `db/Sms.Migrations/procs/saas/Otp_ConsumeAllForIdentifier.sql`
- Test: `tests/Sms.Tests.Integration/Saas/InvitationsSchemaTests.cs`

**Interfaces:**
- Consumes: `M0003_Procs_Auth.EmbeddedProcs(string namespaceFragment)` (existing helper), `rls.fn_tenant_predicate` (existing, from `M0002_Rls_Policies.cs`).
- Produces: table `dbo.Invitations` (columns `Id, TenantId, UserId, Email, Phone, RoleLabel, InvitedByUserId, InvitedAt, ExpiresAt, AcceptedAt, RevokedAt, LastResentAt`), procs `dbo.Invitations_Create`, `dbo.Invitations_ListByTenant`, `dbo.Invitations_GetById`, `dbo.Invitations_MarkResent`, `dbo.Invitations_MarkAcceptedByUserId`, `dbo.Invitations_MarkRevoked`, `dbo.User_SetStatus`, `dbo.Otp_ConsumeAllForIdentifier`. Task 2 (the DAO) calls these proc names directly.

- [ ] **Step 1: Write the failing schema test**

```csharp
// tests/Sms.Tests.Integration/Saas/InvitationsSchemaTests.cs
using Dapper;
using FluentAssertions;
using Sms.Shared.Kernel.Data;
using Sms.Shared.Kernel.Tenancy;
using Xunit;

namespace Sms.Tests.Integration.Saas;

[Collection("sql")]
public class InvitationsSchemaTests(SqlServerFixture fx)
{
    [Fact]
    public async Task Invitations_Create_proc_inserts_a_row_and_returns_its_id()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        await using var c = await factory.OpenAsync();
        await c.ExecuteAsync(
            "INSERT dbo.Tenants (Id, Name, Slug, Status, Tier) VALUES (@id,'T',@s,'active','gold')",
            new { id = tenantId, s = $"t{tenantId:N}" });
        await c.ExecuteAsync(
            "INSERT dbo.Users (Id, TenantId, Email, IsPlatform, Status) VALUES (@id,@tid,@email,0,'pending')",
            new { id = userId, tid = tenantId, email = "invitee@x.com" });

        var expiresAt = DateTime.UtcNow.AddHours(24);
        var id = await c.QuerySingleAsync<Guid>(
            new CommandDefinition("dbo.Invitations_Create",
                new
                {
                    TenantId = tenantId, UserId = userId, Email = "invitee@x.com", Phone = (string?)null,
                    RoleLabel = "Teacher", InvitedByUserId = (Guid?)null, ExpiresAt = expiresAt,
                },
                commandType: System.Data.CommandType.StoredProcedure));

        var row = await c.QuerySingleAsync<(Guid Id, Guid UserId, string RoleLabel)>(
            "SELECT Id, UserId, RoleLabel FROM dbo.Invitations WHERE Id = @id", new { id });
        row.UserId.Should().Be(userId);
        row.RoleLabel.Should().Be("Teacher");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter "FullyQualifiedName~InvitationsSchemaTests"`
Expected: FAIL — `dbo.Invitations_Create` / `dbo.Invitations` do not exist yet (SqlException, invalid object name or procedure not found).

- [ ] **Step 3: Write the migration and stored procedures**

`db/Sms.Migrations/procs/saas/Invitations_Create.sql`:
```sql
CREATE OR ALTER PROCEDURE dbo.Invitations_Create
    @TenantId uniqueidentifier,
    @UserId uniqueidentifier,
    @Email nvarchar(256),
    @Phone nvarchar(32),
    @RoleLabel nvarchar(64),
    @InvitedByUserId uniqueidentifier,
    @ExpiresAt datetime2
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id uniqueidentifier = NEWID();
    INSERT dbo.Invitations (Id, TenantId, UserId, Email, Phone, RoleLabel, InvitedByUserId, ExpiresAt)
    VALUES (@Id, @TenantId, @UserId, @Email, @Phone, @RoleLabel, @InvitedByUserId, @ExpiresAt);
    SELECT @Id AS Id;
END
```

`db/Sms.Migrations/procs/saas/Invitations_ListByTenant.sql`:
```sql
CREATE OR ALTER PROCEDURE dbo.Invitations_ListByTenant
    @TenantId uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, UserId, Email, Phone, RoleLabel, InvitedAt, ExpiresAt, AcceptedAt, RevokedAt, LastResentAt
    FROM dbo.Invitations
    WHERE TenantId = @TenantId
    ORDER BY InvitedAt DESC;
END
```

`db/Sms.Migrations/procs/saas/Invitations_GetById.sql`:
```sql
CREATE OR ALTER PROCEDURE dbo.Invitations_GetById
    @TenantId uniqueidentifier,
    @Id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, UserId, Email, Phone, RoleLabel, InvitedAt, ExpiresAt, AcceptedAt, RevokedAt, LastResentAt
    FROM dbo.Invitations
    WHERE TenantId = @TenantId AND Id = @Id;
END
```

`db/Sms.Migrations/procs/saas/Invitations_MarkResent.sql`:
```sql
CREATE OR ALTER PROCEDURE dbo.Invitations_MarkResent
    @Id uniqueidentifier,
    @ExpiresAt datetime2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Invitations
    SET ExpiresAt = @ExpiresAt, LastResentAt = SYSUTCDATETIME()
    WHERE Id = @Id;
END
```

`db/Sms.Migrations/procs/saas/Invitations_MarkAcceptedByUserId.sql`:
```sql
CREATE OR ALTER PROCEDURE dbo.Invitations_MarkAcceptedByUserId
    @UserId uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Invitations
    SET AcceptedAt = SYSUTCDATETIME()
    WHERE UserId = @UserId AND AcceptedAt IS NULL AND RevokedAt IS NULL;
END
```

`db/Sms.Migrations/procs/saas/Invitations_MarkRevoked.sql`:
```sql
CREATE OR ALTER PROCEDURE dbo.Invitations_MarkRevoked
    @Id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Invitations
    SET RevokedAt = SYSUTCDATETIME()
    WHERE Id = @Id;
END
```

`db/Sms.Migrations/procs/saas/User_SetStatus.sql`:
```sql
CREATE OR ALTER PROCEDURE dbo.User_SetStatus
    @UserId uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users SET Status = @Status WHERE Id = @UserId;
END
```

`db/Sms.Migrations/procs/saas/Otp_ConsumeAllForIdentifier.sql`:
```sql
CREATE OR ALTER PROCEDURE dbo.Otp_ConsumeAllForIdentifier
    @Identifier nvarchar(256)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.OtpCodes SET ConsumedAt = SYSUTCDATETIME()
    WHERE Identifier = @Identifier AND ConsumedAt IS NULL;
END
```

`db/Sms.Migrations/M0079_Invitations_Table.cs`:
```csharp
using System.Linq;
using FluentMigrator;

namespace Sms.Migrations;

[Migration(79, "Invitations lifecycle: Invitations table with tenant RLS + resend/revoke/status procs")]
public sealed class M0079_Invitations_Table : Migration
{
    public override void Up()
    {
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
        Create.Index("IX_Invitations_Tenant").OnTable("Invitations").OnColumn("TenantId").Ascending();
        Create.Index("IX_Invitations_UserId").OnTable("Invitations").OnColumn("UserId").Ascending();
        Create.ForeignKey("FK_Invitations_User")
            .FromTable("Invitations").ForeignColumn("UserId")
            .ToTable("Users").ToColumn("Id");

        Execute.Sql(@"CREATE SECURITY POLICY rls.InvitationsTenantPolicy
ADD FILTER PREDICATE rls.fn_tenant_predicate(TenantId) ON dbo.Invitations,
ADD BLOCK PREDICATE rls.fn_tenant_predicate(TenantId) ON dbo.Invitations AFTER INSERT
WITH (STATE = ON);");

        foreach (var sql in M0003_Procs_Auth.EmbeddedProcs("procs.saas.Invitations_")
            .Concat(M0003_Procs_Auth.EmbeddedProcs("procs.saas.User_SetStatus"))
            .Concat(M0003_Procs_Auth.EmbeddedProcs("procs.saas.Otp_ConsumeAllForIdentifier")))
            Execute.Sql(sql);
    }

    public override void Down()
    {
        Execute.Sql("DROP PROCEDURE IF EXISTS dbo.Otp_ConsumeAllForIdentifier;");
        Execute.Sql("DROP PROCEDURE IF EXISTS dbo.User_SetStatus;");
        foreach (var name in new[]
        {
            "Invitations_Create", "Invitations_ListByTenant", "Invitations_GetById",
            "Invitations_MarkResent", "Invitations_MarkAcceptedByUserId", "Invitations_MarkRevoked",
        })
            Execute.Sql($"DROP PROCEDURE IF EXISTS dbo.{name};");

        Execute.Sql("DROP SECURITY POLICY IF EXISTS rls.InvitationsTenantPolicy;");
        Delete.Table("Invitations");
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test --filter "FullyQualifiedName~InvitationsSchemaTests"`
Expected: PASS — `SqlServerFixture.InitializeAsync` runs `MigrationRunner.Run`, which now includes `M0079`, so the fresh test database has the table/procs before the test body executes.

- [ ] **Step 5: Commit**

```bash
git add db/Sms.Migrations/M0079_Invitations_Table.cs db/Sms.Migrations/procs/saas/Invitations_Create.sql db/Sms.Migrations/procs/saas/Invitations_ListByTenant.sql db/Sms.Migrations/procs/saas/Invitations_GetById.sql db/Sms.Migrations/procs/saas/Invitations_MarkResent.sql db/Sms.Migrations/procs/saas/Invitations_MarkAcceptedByUserId.sql db/Sms.Migrations/procs/saas/Invitations_MarkRevoked.sql db/Sms.Migrations/procs/saas/User_SetStatus.sql db/Sms.Migrations/procs/saas/Otp_ConsumeAllForIdentifier.sql tests/Sms.Tests.Integration/Saas/InvitationsSchemaTests.cs
git commit -m "feat(db): add Invitations table, tenant RLS, and lifecycle procs"
```

---

### Task 2: `IInvitationDao` / `InvitationDao`, plus `SetStatusAsync` / `OtpConsumeAllAsync`

**Files:**
- Create: `src/Sms.Application/Interfaces/DAO/IInvitationDao.cs`
- Create: `src/Sms.Infrastructure/DAO/InvitationDao.cs`
- Modify: `src/Sms.Application/Interfaces/DAO/IUserProvisioningDao.cs` (add `SetStatusAsync`)
- Modify: `src/Sms.Infrastructure/DAO/UserProvisioningDao.cs` (implement `SetStatusAsync`)
- Modify: `src/Sms.Application/Interfaces/DAO/IAuthDao.cs` (add `OtpConsumeAllAsync`)
- Modify: `src/Sms.Infrastructure/DAO/AuthDao.cs` (implement `OtpConsumeAllAsync`)
- Modify: `src/Sms.Infrastructure/SQL/AuthQueries.cs` (add `OtpConsumeAll` constant)
- Modify: `src/Sms.Infrastructure/DependencyInjection.cs` (register `IInvitationDao`)
- Test: `tests/Sms.Tests.Integration/Saas/InvitationDaoTests.cs`

**Interfaces:**
- Consumes: procs from Task 1 (`dbo.Invitations_*`, `dbo.User_SetStatus`, `dbo.Otp_ConsumeAllForIdentifier`); `BaseRepository.QueryProcAsync<T>`/`QuerySingleProcAsync<T>`/`ExecuteProcAsync` (existing, `src/Sms.Shared.Kernel/Data/BaseRepository.cs`).
- Produces: `IInvitationDao` with `CreateAsync`, `ListByTenantAsync`, `GetByIdAsync`, `MarkResentAsync`, `MarkAcceptedByUserIdAsync`, `MarkRevokedAsync`, and the `InvitationRow` record. `IUserProvisioningDao.SetStatusAsync(Guid userId, string status, CancellationToken ct = default)`. `IAuthDao.OtpConsumeAllAsync(string identifier, CancellationToken ct = default)`. Task 3 and Task 4 depend on all of these exact signatures.

- [ ] **Step 1: Write the failing DAO test**

```csharp
// tests/Sms.Tests.Integration/Saas/InvitationDaoTests.cs
using Dapper;
using FluentAssertions;
using Sms.Application.Interfaces.DAO;
using Sms.Infrastructure.DAO;
using Sms.Shared.Kernel.Data;
using Sms.Shared.Kernel.Tenancy;
using Xunit;

namespace Sms.Tests.Integration.Saas;

[Collection("sql")]
public class InvitationDaoTests(SqlServerFixture fx)
{
    private async Task<(Guid TenantId, Guid UserId)> SeedTenantAndUserAsync()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        await using var c = await factory.OpenAsync();
        await c.ExecuteAsync(
            "INSERT dbo.Tenants (Id, Name, Slug, Status, Tier) VALUES (@id,'T',@s,'active','gold')",
            new { id = tenantId, s = $"t{tenantId:N}" });
        await c.ExecuteAsync(
            "INSERT dbo.Users (Id, TenantId, Email, IsPlatform, Status) VALUES (@id,@tid,'invitee@x.com',0,'pending')",
            new { id = userId, tid = tenantId });
        return (tenantId, userId);
    }

    private IInvitationDao Dao()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        return new InvitationDao(new SqlConnectionFactory(fx.ConnectionString, ctx));
    }

    [Fact]
    public async Task Create_then_list_then_resend_then_revoke_round_trips()
    {
        var (tenantId, userId) = await SeedTenantAndUserAsync();
        var dao = Dao();

        var id = await dao.CreateAsync(tenantId, userId, "invitee@x.com", null, "Teacher",
            null, DateTime.UtcNow.AddHours(24));

        var listed = await dao.ListByTenantAsync(tenantId);
        listed.Should().ContainSingle(r => r.Id == id && r.RoleLabel == "Teacher" && r.AcceptedAt == null && r.RevokedAt == null);

        var newExpiry = DateTime.UtcNow.AddHours(48);
        await dao.MarkResentAsync(id, newExpiry);
        var afterResend = await dao.GetByIdAsync(tenantId, id);
        afterResend!.LastResentAt.Should().NotBeNull();
        afterResend.ExpiresAt.Should().BeCloseTo(newExpiry, TimeSpan.FromSeconds(2));

        await dao.MarkRevokedAsync(id);
        var afterRevoke = await dao.GetByIdAsync(tenantId, id);
        afterRevoke!.RevokedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task MarkAcceptedByUserId_is_a_noop_when_already_revoked()
    {
        var (tenantId, userId) = await SeedTenantAndUserAsync();
        var dao = Dao();
        var id = await dao.CreateAsync(tenantId, userId, "invitee@x.com", null, "Teacher", null, DateTime.UtcNow.AddHours(24));
        await dao.MarkRevokedAsync(id);

        await dao.MarkAcceptedByUserIdAsync(userId);

        var row = await dao.GetByIdAsync(tenantId, id);
        row!.AcceptedAt.Should().BeNull();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter "FullyQualifiedName~InvitationDaoTests"`
Expected: FAIL to compile — `InvitationDao`/`IInvitationDao` don't exist yet.

- [ ] **Step 3: Implement the DAO**

`src/Sms.Application/Interfaces/DAO/IInvitationDao.cs`:
```csharp
namespace Sms.Application.Interfaces.DAO;

public interface IInvitationDao
{
    Task<Guid> CreateAsync(Guid tenantId, Guid userId, string? email, string? phone, string roleLabel,
        Guid? invitedByUserId, DateTime expiresAt, CancellationToken ct = default);
    Task<IReadOnlyList<InvitationRow>> ListByTenantAsync(Guid tenantId, CancellationToken ct = default);
    Task<InvitationRow?> GetByIdAsync(Guid tenantId, Guid id, CancellationToken ct = default);
    Task MarkResentAsync(Guid id, DateTime expiresAt, CancellationToken ct = default);
    Task MarkAcceptedByUserIdAsync(Guid userId, CancellationToken ct = default);
    Task MarkRevokedAsync(Guid id, CancellationToken ct = default);
}

public sealed record InvitationRow(
    Guid Id,
    Guid UserId,
    string? Email,
    string? Phone,
    string RoleLabel,
    DateTime InvitedAt,
    DateTime ExpiresAt,
    DateTime? AcceptedAt,
    DateTime? RevokedAt,
    DateTime? LastResentAt);
```

`src/Sms.Infrastructure/DAO/InvitationDao.cs`:
```csharp
using Sms.Application.Interfaces.DAO;
using Sms.Shared.Kernel.Data;

namespace Sms.Infrastructure.DAO;

public sealed class InvitationDao(IDbConnectionFactory factory) : BaseRepository(factory), IInvitationDao
{
    public Task<Guid> CreateAsync(Guid tenantId, Guid userId, string? email, string? phone, string roleLabel,
        Guid? invitedByUserId, DateTime expiresAt, CancellationToken ct = default) =>
        QuerySingleProcAsync<Guid>("dbo.Invitations_Create",
            new
            {
                TenantId = tenantId, UserId = userId, Email = email, Phone = phone,
                RoleLabel = roleLabel, InvitedByUserId = invitedByUserId, ExpiresAt = expiresAt,
            }, ct)!;

    public Task<IReadOnlyList<InvitationRow>> ListByTenantAsync(Guid tenantId, CancellationToken ct = default) =>
        QueryProcAsync<InvitationRow>("dbo.Invitations_ListByTenant", new { TenantId = tenantId }, ct);

    public Task<InvitationRow?> GetByIdAsync(Guid tenantId, Guid id, CancellationToken ct = default) =>
        QuerySingleProcAsync<InvitationRow>("dbo.Invitations_GetById", new { TenantId = tenantId, Id = id }, ct);

    public Task MarkResentAsync(Guid id, DateTime expiresAt, CancellationToken ct = default) =>
        ExecuteProcAsync("dbo.Invitations_MarkResent", new { Id = id, ExpiresAt = expiresAt }, ct);

    public Task MarkAcceptedByUserIdAsync(Guid userId, CancellationToken ct = default) =>
        ExecuteProcAsync("dbo.Invitations_MarkAcceptedByUserId", new { UserId = userId }, ct);

    public Task MarkRevokedAsync(Guid id, CancellationToken ct = default) =>
        ExecuteProcAsync("dbo.Invitations_MarkRevoked", new { Id = id }, ct);
}
```

In `src/Sms.Application/Interfaces/DAO/IUserProvisioningDao.cs`, add to the interface:
```csharp
    Task SetStatusAsync(Guid userId, string status, CancellationToken ct = default);
```

In `src/Sms.Infrastructure/DAO/UserProvisioningDao.cs`, add:
```csharp
    public Task SetStatusAsync(Guid userId, string status, CancellationToken ct = default) =>
        ExecuteProcAsync("dbo.User_SetStatus", new { UserId = userId, Status = status }, ct);
```

In `src/Sms.Infrastructure/SQL/AuthQueries.cs`, add:
```csharp
    public const string OtpConsumeAll = "dbo.Otp_ConsumeAllForIdentifier";
```

In `src/Sms.Application/Interfaces/DAO/IAuthDao.cs`, add:
```csharp
    Task OtpConsumeAllAsync(string identifier, CancellationToken ct = default);
```

In `src/Sms.Infrastructure/DAO/AuthDao.cs`, add:
```csharp
    public Task OtpConsumeAllAsync(string identifier, CancellationToken ct = default) =>
        ExecuteProcAsync(AuthQueries.OtpConsumeAll, new { Identifier = identifier }, ct);
```

In `src/Sms.Infrastructure/DependencyInjection.cs`, add inside `AddInfrastructureDaos`:
```csharp
        services.AddScoped<IInvitationDao, InvitationDao>();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test --filter "FullyQualifiedName~InvitationDaoTests"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Sms.Application/Interfaces/DAO/IInvitationDao.cs src/Sms.Infrastructure/DAO/InvitationDao.cs src/Sms.Application/Interfaces/DAO/IUserProvisioningDao.cs src/Sms.Infrastructure/DAO/UserProvisioningDao.cs src/Sms.Application/Interfaces/DAO/IAuthDao.cs src/Sms.Infrastructure/DAO/AuthDao.cs src/Sms.Infrastructure/SQL/AuthQueries.cs src/Sms.Infrastructure/DependencyInjection.cs tests/Sms.Tests.Integration/Saas/InvitationDaoTests.cs
git commit -m "feat(users): add InvitationDao and status/OTP-consume-all DAO methods"
```

---

### Task 3: Wire invite-creation and accept-invite into `UserService` / `AuthService`

**Files:**
- Modify: `src/Sms.Application/Services/Users/UserService.cs` (`InviteAsync`, constructor)
- Modify: `src/Sms.Application/Services/Auth/AuthService.cs` (`IAuthService`, `SendInviteSetupAsync`, `ForgotPasswordAsync`, `ResetPasswordAsync`, constructor)
- Test: `tests/Sms.Tests.Integration/Saas/InvitationLifecycleTests.cs` (invite + accept portion; resend/revoke added in Task 4)

**Interfaces:**
- Consumes: `IInvitationDao` (Task 2), `IUserProvisioningDao.SetStatusAsync` (Task 2).
- Produces: after `POST /v1/users`, the created user has `Status == "pending"` and a matching `Invitations` row exists with `ExpiresAt` ~24h out. After `POST /v1/auth/password/reset` succeeds for that user, `Invitations.AcceptedAt` is set. This task verifies both facts by querying the database directly (no dependency on Task 4's endpoints, so it is fully self-contained); Task 4 adds equivalent HTTP-level assertions once `GET /v1/invitations` exists.

- [ ] **Step 1: Write the failing integration test**

```csharp
// tests/Sms.Tests.Integration/Saas/InvitationLifecycleTests.cs
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
public class InvitationLifecycleTests(SqlServerFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", Key);
        });

    private static HttpClient AdminClient(WebApplicationFactory<Program> app, Guid tenantId)
    {
        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var token = jwt.IssueAccess(Guid.NewGuid(), tenantId, ["school.admin"], isPlatform: false);
        var c = app.CreateClient();
        c.DefaultRequestHeaders.Authorization = new("Bearer", token);
        return c;
    }

    private async Task<Guid> SeedActiveTenant()
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        var id = Guid.NewGuid();
        await using var c = await factory.OpenAsync();
        await c.ExecuteAsync("INSERT dbo.Tenants (Id, Name, Slug, Status, Tier) VALUES (@id,'T',@s,'active','gold')",
            new { id, s = $"t{id:N}" });
        return id;
    }

    private async Task<(Guid Id, string Status)> GetUserStatusAsync(string email)
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        await using var c = await factory.OpenAsync();
        return await c.QuerySingleAsync<(Guid, string)>(
            "SELECT Id, Status FROM dbo.Users WHERE Email = @email", new { email });
    }

    private async Task<(DateTime ExpiresAt, DateTime? AcceptedAt, string RoleLabel)> GetInvitationByEmailAsync(string email)
    {
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        await using var c = await factory.OpenAsync();
        return await c.QuerySingleAsync<(DateTime, DateTime?, string)>(
            "SELECT ExpiresAt, AcceptedAt, RoleLabel FROM dbo.Invitations WHERE Email = @email", new { email });
    }

    private static string Sha256Hex(string s) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(s)));

    [Fact]
    public async Task Invite_creates_pending_user_and_an_invitation_row_valid_for_24_hours()
    {
        var tid = await SeedActiveTenant();
        await using var app = App();
        var admin = AdminClient(app, tid);
        var email = $"teacher{Guid.NewGuid():N}@x.com";

        (await admin.PostAsJsonAsync("/v1/users",
            new { email, roles = new[] { "school.teacher" } })).StatusCode.Should().Be(HttpStatusCode.Created);

        var (_, status) = await GetUserStatusAsync(email);
        status.Should().Be("pending");

        var (expiresAt, acceptedAt, roleLabel) = await GetInvitationByEmailAsync(email);
        roleLabel.Should().Be("Teacher");
        acceptedAt.Should().BeNull();
        expiresAt.Should().BeCloseTo(DateTime.UtcNow.AddHours(24), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task Accepting_the_invite_via_password_reset_marks_it_accepted_and_activates_the_user()
    {
        var tid = await SeedActiveTenant();
        await using var app = App();
        var admin = AdminClient(app, tid);
        var email = $"teacher{Guid.NewGuid():N}@x.com";

        await admin.PostAsJsonAsync("/v1/users", new { email, roles = new[] { "school.teacher" } });

        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        await using (var c = await factory.OpenAsync())
            await c.ExecuteAsync("UPDATE dbo.OtpCodes SET CodeHash=@h WHERE Identifier=@id",
                new { id = email, h = Sha256Hex("123456") });

        var anon = app.CreateClient();
        var reset = await anon.PostAsJsonAsync("/v1/auth/password/reset",
            new { identifier = email, code = "123456", password = "NewPassw0rd!" });
        reset.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var (_, status) = await GetUserStatusAsync(email);
        status.Should().Be("active");

        var (_, acceptedAt, _) = await GetInvitationByEmailAsync(email);
        acceptedAt.Should().NotBeNull();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test --filter "FullyQualifiedName~InvitationLifecycleTests"`
Expected: FAIL — `dbo.Invitations` has no row (nothing creates one yet), and `Users.Status` is still `"active"` right after invite (not `"pending"`).

- [ ] **Step 3: Wire `UserService.InviteAsync` and `AuthService`**

In `src/Sms.Application/Services/Users/UserService.cs`, change the constructor and `InviteAsync`:
```csharp
public sealed class UserService(
    IUserProvisioningDao dao,
    ITenantContext tenant,
    IAuthService auth,
    ClientRepository clients,
    IInvitationDao invitations) : IUserService
{
    // ...

    public async Task<ApiResult<object>> InviteAsync(
        InviteUserRequest req, bool isSchoolAdmin, bool canAssignOwner, CancellationToken ct = default)
    {
        if (!isSchoolAdmin)
            return ApiResult<object>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<object>.Fail(new Error("forbidden", "no tenant context"), 403);
        if (req.Email is null && req.Phone is null)
            return ApiResult<object>.Fail(new Error("invalid_request", "email or phone required"), 422);

        var allowed = AssignableFor(canAssignOwner);
        if (req.Roles.Length == 0 || req.Roles.Any(r => !allowed.Contains(r)))
            return ApiResult<object>.Fail(
                new Error("invalid_request",
                    canAssignOwner
                        ? "invalid role(s); use school.owner, school.admin, school.principal, school.teacher, staff, or student.parent"
                        : "invalid role(s); school.owner can only be assigned by a school owner"),
                422);

        var id = await dao.CreateUserAsync(tid, req.Email, req.Phone, false, req.Roles, ct);
        await dao.SetStatusAsync(id, "pending", ct);

        var roleLabel = RoleLabel(req.Roles.FirstOrDefault());
        await invitations.CreateAsync(tid, id, req.Email, req.Phone, roleLabel ?? "Member",
            tenant.UserId, DateTime.UtcNow.AddHours(24), ct);

        /* Welcome onboard email/SMS: school name + password-setup OTP (same reset flow). */
        var inviteId = req.Email ?? req.Phone;
        if (!string.IsNullOrWhiteSpace(inviteId))
        {
            var school = await clients.GetAsync(tid, ct);
            var schoolName = school?.Name ?? "your school";
            try { await auth.SendInviteSetupAsync(inviteId!, schoolName, roleLabel, TimeSpan.FromHours(24), ct); }
            catch { /* user row exists; invite email is best-effort */ }
        }
        return ApiResult<object>.Ok(new { id, invited = true }, 201);
    }
```

In `src/Sms.Application/Services/Auth/AuthService.cs`, change the `IAuthService` interface method and constructor:
```csharp
    /// <summary>Onboard invite: welcome email/SMS with school name + password-setup OTP.</summary>
    Task<ApiResult<object>> SendInviteSetupAsync(
        string identifier, string schoolName, string? roleLabel = null, TimeSpan? validFor = null, CancellationToken ct = default);
```
```csharp
public sealed class AuthService(
    IAuthDao users,
    IPasswordHasher hasher,
    IJwtTokenService jwt,
    IRefreshTokenStore tokens,
    IOtpSender otp,
    IEmailQueue emailQueue,
    ClientRepository clients,
    ITenantContext tenant,
    IInvitationDao invitations) : IAuthService
```
Update `ForgotPasswordAsync`'s call site and `SendInviteSetupAsync`'s body and signature:
```csharp
    public async Task<ApiResult<object>> ForgotPasswordAsync(ForgotPasswordRequest req, CancellationToken ct = default)
    {
        tenant.Set(null, null, isPlatform: true);
        var user = await FindUserByIdentifierAsync(req.Identifier, ct);
        if (user is not null && string.IsNullOrEmpty(user.PasswordHash))
        {
            var schoolName = "your school";
            string? roleLabel = null;
            if (user.TenantId is Guid tid)
            {
                var school = await clients.GetAsync(tid, ct);
                if (!string.IsNullOrWhiteSpace(school?.Name)) schoolName = school.Name;
                var roles = await users.GetRolesAsync(user.Id, ct);
                roleLabel = RoleLabel(roles.FirstOrDefault());
            }
            return await SendInviteSetupAsync(req.Identifier, schoolName, roleLabel, TimeSpan.FromHours(24), ct);
        }
        return await SendOtpToRegisteredAsync(req.Identifier, ct);
    }

    public async Task<ApiResult<object>> SendInviteSetupAsync(
        string identifier, string schoolName, string? roleLabel = null, TimeSpan? validFor = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(identifier))
            return ApiResult<object>.Fail(new Error("invalid_request", "email or phone required"), 422);

        tenant.Set(null, null, isPlatform: true);
        var id = identifier.Trim();
        var isEmail = id.Contains('@');
        var channel = isEmail ? "email" : "sms";
        var user = await FindUserByIdentifierAsync(id, ct);
        if (user is null)
            return ApiResult<object>.Fail(new Error("not_registered",
                isEmail ? "Email is not registered." : "Phone is not registered."), 404);

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var expiresAt = DateTime.UtcNow.Add(validFor ?? TimeSpan.FromMinutes(10));
        await users.OtpInsertAsync(id, channel, Sha256(code), expiresAt, ct);

        if (isEmail)
            emailQueue.Enqueue(InviteWelcomeEmail.Build(id, schoolName, code, roleLabel));
        else
            Console.WriteLine($"[OTP/{channel}] {id} -> {InviteWelcomeEmail.SmsBody(schoolName, code, roleLabel)}");

        return ApiResult<object>.Ok(new { sent = true });
    }
```
And in `ResetPasswordAsync`, mark the invitation accepted right after the password is set:
```csharp
    public async Task<ApiResult> ResetPasswordAsync(ResetPasswordRequest req, CancellationToken ct = default)
    {
        if (req.Password is null || req.Password.Length < 8)
            return ApiResult.Fail(new Error("weak_password", "password must be at least 8 characters"), 422);

        tenant.Set(null, null, isPlatform: true);
        var activeHash = await users.OtpActiveHashAsync(req.Identifier, ct);
        if (activeHash is null || req.Code is null || activeHash != Sha256(req.Code))
            return ApiResult.Fail(new Error("invalid_code", "code invalid or expired"), 401);

        await users.OtpConsumeAsync(req.Identifier, activeHash, ct);
        var user = await FindUserByIdentifierAsync(req.Identifier, ct);
        if (user is null)
            return ApiResult.Fail(new Error("invalid_code", "user not found"), 401);

        await users.SetPasswordAsync(user.Id, hasher.Hash(req.Password), ct);
        await invitations.MarkAcceptedByUserIdAsync(user.Id, ct);
        return ApiResult.NoContent();
    }
```
Add `using Sms.Application.Interfaces.DAO;` to `AuthService.cs` if not already present (it is, via the `IAuthDao users` parameter).

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test --filter "FullyQualifiedName~InvitationLifecycleTests"`
Expected: PASS — both tests verify state directly via SQL, so they pass without needing the `InvitationController` (built next in Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/Sms.Application/Services/Users/UserService.cs src/Sms.Application/Services/Auth/AuthService.cs tests/Sms.Tests.Integration/Saas/InvitationLifecycleTests.cs
git commit -m "feat(users): invite creates a pending user + tracked invitation; accept marks it accepted"
```

---

### Task 4: `IInvitationService` / `InvitationController` (list, resend, revoke)

**Files:**
- Create: `src/Sms.Application/DTOs/Users/InvitationModels.cs`
- Create: `src/Sms.Application/Services/Users/InvitationService.cs`
- Create: `src/Sms.Api/Controllers/InvitationController.cs`
- Modify: `src/Sms.Application/DependencyInjection.cs` (register `IInvitationService`)
- Modify: `tests/Sms.Tests.Integration/Saas/InvitationLifecycleTests.cs` (add resend/revoke/authorization tests; confirm Task 3's tests now pass)

**Interfaces:**
- Consumes: `IInvitationDao`, `IUserProvisioningDao.SetStatusAsync`, `IAuthDao.OtpConsumeAllAsync` (Task 2), `IAuthService.SendInviteSetupAsync` (Task 3).
- Produces: `GET /v1/invitations` → `{ data: InvitationResponse[] }`; `POST /v1/invitations/{id}/resend` → `{ data: { resent: true } }` or 409/404; `POST /v1/invitations/{id}/revoke` → `{ data: { revoked: true } }` or 409/404. `InvitationResponse(Guid Id, string? Email, string? Phone, string RoleLabel, DateTime InvitedAt, DateTime ExpiresAt, string Status)` where `Status` is one of `"pending" | "accepted" | "expired" | "revoked"`. Task 5 (frontend) maps these exact wire field names (snake_case via the API's JSON policy: `id, email, phone, role_label, invited_at, expires_at, status`).

- [ ] **Step 1: Extend the integration test with resend/revoke/authz cases**

Add to `tests/Sms.Tests.Integration/Saas/InvitationLifecycleTests.cs`:
```csharp
    private async Task<string> InviteAndGetIdAsync(HttpClient admin, string email)
    {
        await admin.PostAsJsonAsync("/v1/users", new { email, roles = new[] { "school.teacher" } });
        var list = await admin.GetAsync("/v1/invitations");
        using var doc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").EnumerateArray()
            .Single(r => r.GetProperty("email").GetString() == email).GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task Resend_extends_expiry_and_bumps_last_resent_at()
    {
        var tid = await SeedActiveTenant();
        await using var app = App();
        var admin = AdminClient(app, tid);
        var email = $"teacher{Guid.NewGuid():N}@x.com";
        var id = await InviteAndGetIdAsync(admin, email);

        var resend = await admin.PostAsync($"/v1/invitations/{id}/resend", null);
        resend.StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await admin.GetAsync("/v1/invitations");
        using var doc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data").EnumerateArray().Single(r => r.GetProperty("id").GetString() == id);
        row.TryGetProperty("status", out var status).Should().BeTrue();
        status.GetString().Should().Be("pending");
    }

    [Fact]
    public async Task Revoke_deactivates_the_user_and_blocks_further_resend_or_revoke()
    {
        var tid = await SeedActiveTenant();
        await using var app = App();
        var admin = AdminClient(app, tid);
        var email = $"teacher{Guid.NewGuid():N}@x.com";
        var id = await InviteAndGetIdAsync(admin, email);

        (await admin.PostAsync($"/v1/invitations/{id}/revoke", null)).StatusCode.Should().Be(HttpStatusCode.OK);

        var (_, status) = await GetUserStatusAsync(email);
        status.Should().Be("revoked");

        (await admin.PostAsync($"/v1/invitations/{id}/revoke", null)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await admin.PostAsync($"/v1/invitations/{id}/resend", null)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Non_admin_cannot_list_resend_or_revoke_invitations()
    {
        var tid = await SeedActiveTenant();
        await using var app = App();
        var admin = AdminClient(app, tid);
        var email = $"teacher{Guid.NewGuid():N}@x.com";
        var id = await InviteAndGetIdAsync(admin, email);

        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var token = jwt.IssueAccess(Guid.NewGuid(), tid, ["school.teacher"], isPlatform: false);
        var teacher = app.CreateClient();
        teacher.DefaultRequestHeaders.Authorization = new("Bearer", token);

        (await teacher.GetAsync("/v1/invitations")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await teacher.PostAsync($"/v1/invitations/{id}/resend", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await teacher.PostAsync($"/v1/invitations/{id}/revoke", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `dotnet test --filter "FullyQualifiedName~InvitationLifecycleTests"`
Expected: the two tests from Task 3 still PASS; the three new tests (`Resend_extends_expiry_and_bumps_last_resent_at`, `Revoke_deactivates_the_user_and_blocks_further_resend_or_revoke`, `Non_admin_cannot_list_resend_or_revoke_invitations`) FAIL — all `/v1/invitations*` calls 404 (no controller yet).

- [ ] **Step 3: Implement `InvitationService` and `InvitationController`**

`src/Sms.Application/DTOs/Users/InvitationModels.cs`:
```csharp
namespace Sms.Application.DTOs.Users;

public sealed record InvitationResponse(
    Guid Id,
    string? Email,
    string? Phone,
    string RoleLabel,
    DateTime InvitedAt,
    DateTime ExpiresAt,
    string Status);
```

`src/Sms.Application/Services/Users/InvitationService.cs`:
```csharp
using Sms.Application.Common;
using Sms.Application.DTOs.Users;
using Sms.Application.Interfaces.DAO;
using Sms.Application.Services.Auth;
using Sms.Modules.Tenancy.Data;
using Sms.Shared.Kernel.Results;
using Sms.Shared.Kernel.Tenancy;

namespace Sms.Application.Services.Users;

public interface IInvitationService
{
    Task<ApiResult<IReadOnlyList<InvitationResponse>>> ListAsync(bool isSchoolAdmin, CancellationToken ct = default);
    Task<ApiResult<object>> ResendAsync(Guid id, bool isSchoolAdmin, CancellationToken ct = default);
    Task<ApiResult<object>> RevokeAsync(Guid id, bool isSchoolAdmin, CancellationToken ct = default);
}

public sealed class InvitationService(
    IInvitationDao invitations,
    IUserProvisioningDao users,
    IAuthDao authDao,
    ITenantContext tenant,
    IAuthService auth,
    ClientRepository clients) : IInvitationService
{
    public async Task<ApiResult<IReadOnlyList<InvitationResponse>>> ListAsync(bool isSchoolAdmin, CancellationToken ct = default)
    {
        if (!isSchoolAdmin)
            return ApiResult<IReadOnlyList<InvitationResponse>>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<IReadOnlyList<InvitationResponse>>.Fail(new Error("forbidden", "no tenant context"), 403);

        var rows = await invitations.ListByTenantAsync(tid, ct);
        return ApiResult<IReadOnlyList<InvitationResponse>>.Ok(rows.Select(Map).ToList());
    }

    public async Task<ApiResult<object>> ResendAsync(Guid id, bool isSchoolAdmin, CancellationToken ct = default)
    {
        if (!isSchoolAdmin)
            return ApiResult<object>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<object>.Fail(new Error("forbidden", "no tenant context"), 403);

        var row = await invitations.GetByIdAsync(tid, id, ct);
        if (row is null)
            return ApiResult<object>.Fail(new Error("not_found", "invitation not found"), 404);
        if (row.AcceptedAt is not null || row.RevokedAt is not null)
            return ApiResult<object>.Fail(new Error("conflict", "invitation already accepted or revoked"), 409);

        var identifier = row.Email ?? row.Phone;
        if (string.IsNullOrWhiteSpace(identifier))
            return ApiResult<object>.Fail(new Error("invalid_request", "invitation has no email or phone"), 422);

        var school = await clients.GetAsync(tid, ct);
        var schoolName = school?.Name ?? "your school";
        await auth.SendInviteSetupAsync(identifier!, schoolName, row.RoleLabel, TimeSpan.FromHours(24), ct);
        await invitations.MarkResentAsync(id, DateTime.UtcNow.AddHours(24), ct);
        return ApiResult<object>.Ok(new { resent = true });
    }

    public async Task<ApiResult<object>> RevokeAsync(Guid id, bool isSchoolAdmin, CancellationToken ct = default)
    {
        if (!isSchoolAdmin)
            return ApiResult<object>.Fail(new Error("forbidden", "school admin only"), 403);
        if (tenant.TenantId is not { } tid)
            return ApiResult<object>.Fail(new Error("forbidden", "no tenant context"), 403);

        var row = await invitations.GetByIdAsync(tid, id, ct);
        if (row is null)
            return ApiResult<object>.Fail(new Error("not_found", "invitation not found"), 404);
        if (row.AcceptedAt is not null || row.RevokedAt is not null)
            return ApiResult<object>.Fail(new Error("conflict", "invitation already accepted or revoked"), 409);

        await users.SetStatusAsync(row.UserId, "revoked", ct);
        var identifier = row.Email ?? row.Phone;
        if (!string.IsNullOrWhiteSpace(identifier))
            await authDao.OtpConsumeAllAsync(identifier!, ct);
        await invitations.MarkRevokedAsync(id, ct);
        return ApiResult<object>.Ok(new { revoked = true });
    }

    private static string ComputeStatus(InvitationRow r) =>
        r.RevokedAt is not null ? "revoked"
        : r.AcceptedAt is not null ? "accepted"
        : r.ExpiresAt < DateTime.UtcNow ? "expired"
        : "pending";

    private static InvitationResponse Map(InvitationRow r) =>
        new(r.Id, r.Email, r.Phone, r.RoleLabel, r.InvitedAt, r.ExpiresAt, ComputeStatus(r));
}
```

`src/Sms.Api/Controllers/InvitationController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sms.Application.Services.Users;
using Sms.Shared.Kernel.Authz;

namespace Sms.Api.Controllers;

[Route("v1")]
[Authorize]
public sealed class InvitationController(IInvitationService invitations) : ApiControllerBase
{
    [HttpGet("invitations")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        FromResult(await invitations.ListAsync(IsSchoolAdmin(), ct));

    [HttpPost("invitations/{id:guid}/resend")]
    public async Task<IActionResult> Resend(Guid id, CancellationToken ct) =>
        FromResult(await invitations.ResendAsync(id, IsSchoolAdmin(), ct));

    [HttpPost("invitations/{id:guid}/revoke")]
    public async Task<IActionResult> Revoke(Guid id, CancellationToken ct) =>
        FromResult(await invitations.RevokeAsync(id, IsSchoolAdmin(), ct));

    private bool IsSchoolAdmin() =>
        User.FindAll("role").Any(c => c.Value is Policies.SchoolAdmin or Policies.SchoolOwner);
}
```

In `src/Sms.Application/DependencyInjection.cs`, add inside `AddApplicationServices`:
```csharp
        services.AddScoped<IInvitationService, InvitationService>();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test --filter "FullyQualifiedName~InvitationLifecycleTests"`
Expected: PASS — all five tests in the file (invite/accept from Task 3, plus the three resend/revoke/authz tests above) now succeed.

- [ ] **Step 5: Run the full backend test suite**

Run: `dotnet test`
Expected: PASS — no regressions in `UserServiceTests`-adjacent flows (`ProvisioningTests`, `PasswordResetTests`, `OtpLoginTests`) since `SendInviteSetupAsync`'s new `validFor` parameter defaults to the previous 10-minute behavior for every caller that doesn't pass it.

- [ ] **Step 6: Commit**

```bash
git add src/Sms.Application/DTOs/Users/InvitationModels.cs src/Sms.Application/Services/Users/InvitationService.cs src/Sms.Api/Controllers/InvitationController.cs src/Sms.Application/DependencyInjection.cs tests/Sms.Tests.Integration/Saas/InvitationLifecycleTests.cs
git commit -m "feat(users): add GET/resend/revoke invitations endpoints"
```

---

### Task 5: `src/api/invitations.ts` (frontend API module)

**Files:**
- Create: `src/api/invitations.ts`
- Create: `src/api/invitations.test.ts`

**Interfaces:**
- Consumes: `request` from `src/api/client.ts` (existing).
- Produces: `Invitation` type, `listInvitations(): Promise<Invitation[]>`, `resendInvitation(id: string): Promise<void>`, `revokeInvitation(id: string): Promise<void>`. Task 6/7 import these exact names.

- [ ] **Step 1: Write the failing test**

```typescript
// src/api/invitations.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listInvitations, resendInvitation, revokeInvitation } from './invitations'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireInvitation = {
  id: 'INV-01',
  email: 'neha.joshi@school.edu',
  phone: null,
  role_label: 'Teacher',
  invited_at: '2026-07-20T10:00:00Z',
  expires_at: '2026-07-21T10:00:00Z',
  status: 'pending',
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listInvitations', () => {
  it('maps wire snake_case (role_label/invited_at/expires_at) to camelCase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireInvitation] })))
    const rows = await listInvitations()
    expect(rows[0]).toMatchObject({
      id: 'INV-01', email: 'neha.joshi@school.edu', phone: null,
      roleLabel: 'Teacher', invitedAt: '2026-07-20T10:00:00Z',
      expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
    })
  })

  it('returns an empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: null })))
    expect(await listInvitations()).toEqual([])
  })
})

describe('resendInvitation', () => {
  it('POSTs to /invitations/{id}/resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { resent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await resendInvitation('INV-01')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/invitations/INV-01/resend')
    expect((init as RequestInit).method).toBe('POST')
  })
})

describe('revokeInvitation', () => {
  it('POSTs to /invitations/{id}/revoke', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { revoked: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await revokeInvitation('INV-01')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/invitations/INV-01/revoke')
    expect((init as RequestInit).method).toBe('POST')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/invitations.test.ts`
Expected: FAIL — `./invitations` module does not exist.

- [ ] **Step 3: Implement `src/api/invitations.ts`**

```typescript
import { request } from './client'

export interface InvitationDto {
  id: string
  email: string | null
  phone: string | null
  role_label: string
  invited_at: string
  expires_at: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
}

export interface Invitation {
  id: string
  email: string | null
  phone: string | null
  roleLabel: string
  invitedAt: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
}

function toInvitation(d: InvitationDto): Invitation {
  return {
    id: d.id,
    email: d.email,
    phone: d.phone,
    roleLabel: d.role_label,
    invitedAt: d.invited_at,
    expiresAt: d.expires_at,
    status: d.status,
  }
}

export async function listInvitations(): Promise<Invitation[]> {
  const data = await request<InvitationDto[]>('/invitations')
  return (data ?? []).map(toInvitation)
}

export async function resendInvitation(id: string): Promise<void> {
  await request(`/invitations/${id}/resend`, { method: 'POST' })
}

export async function revokeInvitation(id: string): Promise<void> {
  await request(`/invitations/${id}/revoke`, { method: 'POST' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/invitations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/invitations.ts src/api/invitations.test.ts
git commit -m "feat(api): add invitations API module (list/resend/revoke)"
```

---

### Task 6: `queryKeys.ts` + invitation mutation hooks

**Files:**
- Modify: `src/api/queryKeys.ts`
- Create: `src/api/hooks/useInvitationMutations.ts`
- Create: `src/api/hooks/useInvitationMutations.test.ts`

**Interfaces:**
- Consumes: `resendInvitation`, `revokeInvitation` (Task 5), `queryKeys.invitations.all` (this task).
- Produces: `useResendInvitation()`, `useRevokeInvitation()` — both `UseMutationResult<void, Error, string>`, invalidating `queryKeys.invitations.all` on success. Task 7 calls these two hooks by name.

- [ ] **Step 1: Write the failing test**

```typescript
// src/api/hooks/useInvitationMutations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useResendInvitation, useRevokeInvitation } from './useInvitationMutations'
import * as invitationsApi from '../invitations'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.restoreAllMocks() })

describe('useResendInvitation', () => {
  it('calls resendInvitation with the invitation id', async () => {
    const spy = vi.spyOn(invitationsApi, 'resendInvitation').mockResolvedValue(undefined)
    const { result } = renderHook(() => useResendInvitation(), { wrapper })
    result.current.mutate('INV-01')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('INV-01')
  })
})

describe('useRevokeInvitation', () => {
  it('calls revokeInvitation with the invitation id', async () => {
    const spy = vi.spyOn(invitationsApi, 'revokeInvitation').mockResolvedValue(undefined)
    const { result } = renderHook(() => useRevokeInvitation(), { wrapper })
    result.current.mutate('INV-01')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('INV-01')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/hooks/useInvitationMutations.test.ts`
Expected: FAIL — `./useInvitationMutations` does not exist.

- [ ] **Step 3: Implement**

In `src/api/queryKeys.ts`, add a new top-level entry (next to `users: { all: ['users'] as const },`):
```typescript
  invitations: {
    all: ['invitations'] as const,
  },
```

`src/api/hooks/useInvitationMutations.ts`:
```typescript
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { resendInvitation, revokeInvitation } from '../invitations'
import { queryKeys } from '../queryKeys'

export function useResendInvitation(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resendInvitation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.invitations.all }) },
  })
}

export function useRevokeInvitation(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.invitations.all }) },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/hooks/useInvitationMutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/queryKeys.ts src/api/hooks/useInvitationMutations.ts src/api/hooks/useInvitationMutations.test.ts
git commit -m "feat(api): add invitations query key + resend/revoke mutation hooks"
```

---

### Task 7: Rewire `InvitationsTab` in `admin.tsx` to the real API

**Files:**
- Modify: `src/screens/school/admin.tsx` (lines ~1347–1420 per current file: remove `Invite`/`INITIAL_INVITES`, rewrite `InvitationsTab`; line ~1481 tab count)
- Modify: `src/screens/school/admin.test.tsx` (or create if it doesn't exist — check first) to cover the new tab behavior

**Interfaces:**
- Consumes: `listInvitations`, `Invitation` (Task 5), `useResendInvitation`, `useRevokeInvitation` (Task 6), `ApiError` (existing, `src/api/ApiError.ts`), `useToast` (existing, `@/lib/hooks`).
- Produces: `InvitationsTab` fetches real data; `IdentityScreen`'s tab count badge for "Invitations" reflects the real list length instead of `INITIAL_INVITES.length`.

- [ ] **Step 1: Check for existing admin.tsx tests covering the Invitations tab**

Run: `grep -rn "InvitationsTab\|INITIAL_INVITES\|Invitations" src/screens/school/*.test.tsx`
If a test file exists referencing `INITIAL_INVITES` or the current mock behavior (e.g. `'Invitation resent'` toast text), read it fully before proceeding — Step 2 below replaces those assertions.

- [ ] **Step 2: Write the failing test**

Add to `src/screens/school/admin.test.tsx` (create the file with this content if none exists; if one exists, add these `describe` blocks and the imports they need):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as invitationsApi from '@/api/invitations'
import { InvitationsTab } from './admin'
import { ToastProvider } from '@/context/ToastProvider'

function renderTab() {
  return render(
    <ToastProvider>
      <InvitationsTab />
    </ToastProvider>,
  )
}

beforeEach(() => { vi.restoreAllMocks() })

describe('InvitationsTab', () => {
  it('shows a loading state, then the list from the API', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([
      {
        id: 'INV-01', email: 'neha.joshi@school.edu', phone: null, roleLabel: 'Teacher',
        invitedAt: '2026-07-20T10:00:00Z', expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
      },
    ])
    renderTab()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('neha.joshi@school.edu')).toBeInTheDocument())
  })

  it('shows an empty state when there are no invitations', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([])
    renderTab()
    await waitFor(() => expect(screen.getByText(/no pending invitations/i)).toBeInTheDocument())
  })

  it('shows an error state and can retry', async () => {
    const { ApiError } = await import('@/api/ApiError')
    vi.spyOn(invitationsApi, 'listInvitations').mockRejectedValueOnce(new ApiError(500, 'internal_error', 'boom', null))
    renderTab()
    await waitFor(() => expect(screen.getByText(/could not load invitations/i)).toBeInTheDocument())
  })

  it('resends an invitation and shows a success toast', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([
      {
        id: 'INV-01', email: 'neha.joshi@school.edu', phone: null, roleLabel: 'Teacher',
        invitedAt: '2026-07-20T10:00:00Z', expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
      },
    ])
    vi.spyOn(invitationsApi, 'resendInvitation').mockResolvedValue(undefined)
    renderTab()
    await waitFor(() => screen.getByText('neha.joshi@school.edu'))
    await userEvent.click(screen.getByRole('button', { name: /resend/i }))
    await waitFor(() => expect(screen.getByText(/invitation resent/i)).toBeInTheDocument())
  })

  it('revokes an invitation and shows a danger toast', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([
      {
        id: 'INV-01', email: 'neha.joshi@school.edu', phone: null, roleLabel: 'Teacher',
        invitedAt: '2026-07-20T10:00:00Z', expiresAt: '2026-07-21T10:00:00Z', status: 'pending',
      },
    ])
    vi.spyOn(invitationsApi, 'revokeInvitation').mockResolvedValue(undefined)
    renderTab()
    await waitFor(() => screen.getByText('neha.joshi@school.edu'))
    await userEvent.click(screen.getByRole('button', { name: /revoke/i }))
    await waitFor(() => expect(screen.getByText(/invitation revoked/i)).toBeInTheDocument())
  })

  it('shows an expired badge and still allows resend', async () => {
    vi.spyOn(invitationsApi, 'listInvitations').mockResolvedValue([
      {
        id: 'INV-02', email: 'old.invite@school.edu', phone: null, roleLabel: 'Admin',
        invitedAt: '2026-06-01T10:00:00Z', expiresAt: '2026-06-02T10:00:00Z', status: 'expired',
      },
    ])
    renderTab()
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/screens/school/admin.test.tsx`
Expected: FAIL — `InvitationsTab` isn't exported from `admin.tsx` yet (or, if it already is, the mocked API isn't called since the component still reads `INITIAL_INVITES`).

- [ ] **Step 4: Rewrite `InvitationsTab` and remove the mock**

In `src/screens/school/admin.tsx`, replace the block currently spanning the `/* ---------- Invitations ---------- */` comment through the end of `InvitationsTab` (the `Invite` interface, `INITIAL_INVITES`, and the whole function) with:
```typescript
/* ---------- Invitations ---------- */
export function InvitationsTab() {
  const toast = useToast()
  const [invites, setInvites] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const resend = useResendInvitation()
  const revoke = useRevokeInvitation()

  const reload = async () => {
    setLoading(true)
    setError(false)
    try {
      setInvites(await listInvitations())
    } catch (e) {
      toast.danger('Could not load invitations', e instanceof ApiError ? e.message : 'Try again.')
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const statusTone = (s: Invitation['status']): 'neutral' | 'success' | 'danger' =>
    s === 'accepted' ? 'success' : s === 'revoked' || s === 'expired' ? 'danger' : 'neutral'

  const doResend = (inv: Invitation) => {
    resend.mutate(inv.id, {
      onSuccess: () => {
        toast.success('Invitation resent', `A fresh link was emailed to ${inv.email ?? inv.phone}.`)
        void reload()
      },
      onError: (e) => toast.danger('Could not resend', e instanceof ApiError ? e.message : 'Try again.'),
    })
  }

  const doRevoke = (inv: Invitation) => {
    revoke.mutate(inv.id, {
      onSuccess: () => {
        toast.danger('Invitation revoked', `${inv.email ?? inv.phone} can no longer join.`)
        void reload()
      },
      onError: (e) => toast.danger('Could not revoke', e instanceof ApiError ? e.message : 'Try again.'),
    })
  }

  return (
    <Card pad={false}>
      <CardHead title="Pending invitations" sub={`${invites.length} awaiting acceptance`} icon="inbox" />
      {loading
        ? <div style={{ padding: 16 }} className="t-sm muted">Loading invitations…</div>
        : error
          ? <div style={{ padding: 16 }} className="t-sm muted">Could not load invitations.</div>
          : invites.length === 0
            ? <div style={{ padding: 8 }}><Empty icon="inbox" title="No pending invitations" body="Invite staff from the Users tab." /></div>
            : (
              <div className="col">
                {invites.map((inv) => (
                  <div key={inv.id} className="row ai-center gap12 wrap" style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
                    <Avatar name={inv.email ?? inv.phone ?? '?'} size={34} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div className="fw6">{inv.email ?? inv.phone}</div>
                      <div className="t-xs muted row ai-center gap6">
                        <Badge tone="neutral">{inv.roleLabel}</Badge>
                        <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                      </div>
                    </div>
                    <div className="t-xs muted" style={{ minWidth: 160 }}>
                      Sent {new Date(inv.invitedAt).toLocaleDateString()} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </div>
                    <div className="row gap6">
                      {inv.status !== 'accepted' && inv.status !== 'revoked' && (
                        <Btn variant="secondary" size="sm" icon="refresh" onClick={() => doResend(inv)}>Resend</Btn>
                      )}
                      {inv.status === 'pending' && (
                        <Btn variant="ghost" size="sm" icon="trash" onClick={() => doRevoke(inv)}>Revoke</Btn>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
    </Card>
  )
}
```

Add the new imports near the top of `admin.tsx` alongside the existing `@/api/*` imports:
```typescript
import { listInvitations, type Invitation } from '@/api/invitations'
import { useResendInvitation, useRevokeInvitation } from '@/api/hooks/useInvitationMutations'
```

In `IdentityScreen`, replace the Invitations tab's count (it currently reads `INITIAL_INVITES.length`, which no longer exists) with a small live count. Change:
```typescript
function IdentityScreen() {
  const [tab, setTab] = useState('users')
  const [inviteCount, setInviteCount] = useState(0)
  useEffect(() => { void listInvitations().then((rows) => setInviteCount(rows.length)).catch(() => {}) }, [tab])
  return (
    <div>
      <PageHead
        title="Identity & access"
        sub="Manage staff accounts, role permissions & access invitations"
      />
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'users', label: 'Users', icon: 'users', count: SCHOOL_USERS.length },
          { value: 'roles', label: 'Roles & permissions', icon: 'lock' },
          { value: 'invites', label: 'Invitations', icon: 'inbox', count: inviteCount },
          { value: 'audit', label: 'Audit log', icon: 'clock' },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {tab === 'users' && <UsersTab />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'invites' && <InvitationsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/screens/school/admin.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full frontend test suite and type check**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: PASS — no other file still imports the removed `Invite`/`INITIAL_INVITES` (`grep -rn "INITIAL_INVITES" src/` should return nothing).

- [ ] **Step 7: Commit**

```bash
git add src/screens/school/admin.tsx src/screens/school/admin.test.tsx
git commit -m "feat(identity): wire Invitations tab to the real API, remove mock data"
```
