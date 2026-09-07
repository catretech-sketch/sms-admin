# Student Transport Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin opt a student into school transport (fee head tag, route, stop) during Student Add/Edit, with best-effort bus auto-assignment that never blocks student admission, plus a new Transport Students list to see and act on mapping status.

**Architecture:** Two repos. `sms-backend` (.NET 8, Dapper + stored procs, FluentMigrator) gets a migration widening `StudentBusAssignments` and `FeeHeads`, a new `StudentTransportService`/`StudentController` endpoint, a least-loaded auto-assign query on `BusRepository`, and a new filtered list query for Transport Students. `sms-admin` (React 19 + Vite + TanStack Query) gets a new Transport section in `studentAdd.tsx`, new API functions in `transport.ts`/`feeHeads.ts`, new hooks in `useOperations.ts`/`useFeeHeads.ts`, and a new Transport Students list screen.

**Tech Stack:** C#/.NET 8, Dapper, FluentMigrator, xUnit + FluentAssertions (integration tests against a real SQL Server via `SqlServerFixture`) — React 19, TypeScript, TanStack Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-student-transport-mapping-design.md`

## Global Constraints

- Reuse `FeeHeads` as-is (no new Transport Fee Plan entity, no pickable amounts) — only add a boolean flag.
- `StudentBusAssignments.BusId` becomes nullable; `RouteId` is a **new nullable column** (nullability enforced only in application code by the new endpoint — the existing legacy per-bus assign endpoint is untouched and keeps writing `RouteId = NULL`).
- Student admission (`POST/PATCH /students`) must never fail because of transport/bus capacity — the transport call is always a separate, best-effort step after the core student save succeeds.
- No `toast.warning` exists in this codebase (`ToastApi` only has `success`/`info`/`danger` — see `src/context/ToastProvider.tsx:7-14`). Use `toast.info(...)` for the "pending bus assignment" case.
- Least-loaded bus selection: highest `Capacity - Occupied` (a `NULL` capacity bus is unlimited and always outranks any bus with a numeric capacity); ties broken by ascending `BusId`.
- Do not modify the existing `dbo.StudentBus_Assign` proc's column-touching behavior — it must keep working unchanged for the legacy `PUT /transport/buses/{busId}/students/{studentId}` flow and its existing integration tests.

---

## Part A — Backend (`sms-backend`)

### Task 1: Migration — `FeeHeads.IsTransportFeeHead`

**Files:**
- Create: `db/Sms.Migrations/M0184_FeeHeads_TransportFlag.cs`
- Modify: `src/Sms.Modules.Finance/FinanceModule.cs:634-665` (add `IsTransportFeeHead` to `FeeHeadResponse`, `CreateFeeHeadRequest`, `UpdateFeeHeadRequest`, and to `FeeHeadRepository.CreateAsync`/`UpdateAsync`)
- Modify: `src/Sms.Application/Services/Finance/FeeService.cs` (no logic change needed — `CreateHeadAsync`/`UpdateHeadAsync` already pass `req` straight through to the repository)
- Modify: `src/Sms.Api/Controllers/FeeController.cs` (no change needed — it already binds `CreateFeeHeadRequest`/`UpdateFeeHeadRequest` from the body)
- Test: `tests/Sms.Tests.Integration/Finance/FeeHeadsTests.cs` (create if it doesn't exist — check first with a glob for `FeeHead*Tests.cs` under `tests/`)

**Interfaces:**
- Produces: `FeeHeadResponse(Guid Id, Guid TenantId, string Name, string? Code, bool Active, bool IsSystem, bool IsTransportFeeHead)`, `CreateFeeHeadRequest(string Name, string? Code, bool IsTransportFeeHead = false)`, `UpdateFeeHeadRequest(string? Name, string? Code, bool? Active, bool? IsTransportFeeHead = null)` — used by Task 3's `IStudentTransportService` to validate a fee head, and by Part B's frontend `FeeHead` type.

- [ ] **Step 1: Write the failing integration test**

Create `tests/Sms.Tests.Integration/Finance/FeeHeadsTests.cs` (if a fee-heads test file already exists under `tests/Sms.Tests.Integration/Finance/`, add this test to it instead of creating a new file):

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Authz;
using Sms.Shared.Kernel.Time;
using Sms.Tests.Integration;

namespace Sms.Tests.Integration.Finance;

[Collection("sql")]
public class FeeHeadsTests(SqlServerFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", Key);
        });

    private static HttpClient PrincipalClient(WebApplicationFactory<Program> app, Guid tenantId)
    {
        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var token = jwt.IssueAccess(Guid.NewGuid(), tenantId, [Policies.Principal], isPlatform: false);
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        return client;
    }

    [Fact]
    public async Task Create_head_with_transport_flag_then_list_returns_it_flagged()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var client = PrincipalClient(app, tenantId);

        var created = await client.PostAsJsonAsync("/v1/fees/heads",
            new { name = "Transport", isTransportFeeHead = true });
        created.StatusCode.Should().Be(HttpStatusCode.Created);

        var list = await client.GetAsync("/v1/fees/heads");
        using var doc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        var rows = doc.RootElement.GetProperty("data");
        rows.GetArrayLength().Should().Be(1);
        rows[0].GetProperty("is_transport_fee_head").GetBoolean().Should().BeTrue();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~FeeHeadsTests.Create_head_with_transport_flag_then_list_returns_it_flagged`
Expected: FAIL — `is_transport_fee_head` property not present in the response (column/field doesn't exist yet).

- [ ] **Step 3: Write the migration**

Create `db/Sms.Migrations/M0184_FeeHeads_TransportFlag.cs`:

```csharp
using FluentMigrator;

namespace Sms.Migrations;

[Migration(184, "Finance: FeeHeads.IsTransportFeeHead flag for Student transport mapping")]
public sealed class M0184_FeeHeads_TransportFlag : Migration
{
    public override void Up()
    {
        Execute.Sql(@"
IF COL_LENGTH('dbo.FeeHeads', 'IsTransportFeeHead') IS NULL
    ALTER TABLE dbo.FeeHeads ADD IsTransportFeeHead bit NOT NULL DEFAULT 0;");

        Execute.Sql(@"
CREATE OR ALTER PROCEDURE dbo.FeeHead_List
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, TenantId, Name, Code, Active, IsSystem, IsTransportFeeHead
    FROM dbo.FeeHeads
    ORDER BY Name;
END;");

        Execute.Sql(@"
CREATE OR ALTER PROCEDURE dbo.FeeHead_Create
    @TenantId uniqueidentifier,
    @Name nvarchar(120),
    @Code nvarchar(40) = NULL,
    @Active bit = 1,
    @IsSystem bit = 0,
    @IsTransportFeeHead bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id uniqueidentifier = NEWID();
    INSERT dbo.FeeHeads (Id, TenantId, Name, Code, Active, IsSystem, IsTransportFeeHead)
    VALUES (@Id, @TenantId, @Name, @Code, @Active, @IsSystem, @IsTransportFeeHead);
    SELECT Id, TenantId, Name, Code, Active, IsSystem, IsTransportFeeHead
    FROM dbo.FeeHeads WHERE Id = @Id;
END;");

        Execute.Sql(@"
CREATE OR ALTER PROCEDURE dbo.FeeHead_Update
    @Id uniqueidentifier,
    @TenantId uniqueidentifier,
    @Name nvarchar(120) = NULL,
    @Code nvarchar(40) = NULL,
    @CodeSpecified bit = 0,
    @Active bit = NULL,
    @IsTransportFeeHead bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.FeeHeads
    SET Name = COALESCE(@Name, Name),
        Code = CASE WHEN @CodeSpecified = 1 THEN @Code ELSE Code END,
        Active = COALESCE(@Active, Active),
        IsTransportFeeHead = COALESCE(@IsTransportFeeHead, IsTransportFeeHead)
    WHERE Id = @Id AND TenantId = @TenantId;
    SELECT Id, TenantId, Name, Code, Active, IsSystem, IsTransportFeeHead
    FROM dbo.FeeHeads WHERE Id = @Id AND TenantId = @TenantId;
END;");
    }

    public override void Down()
    {
        Execute.Sql("IF COL_LENGTH('dbo.FeeHeads', 'IsTransportFeeHead') IS NOT NULL ALTER TABLE dbo.FeeHeads DROP COLUMN IsTransportFeeHead;");
    }
}
```

- [ ] **Step 4: Update `FinanceModule.cs` records and repository methods**

In `src/Sms.Modules.Finance/FinanceModule.cs`, replace lines 634-638:

```csharp
public sealed record FeeHeadResponse(
    Guid Id, Guid TenantId, string Name, string? Code, bool Active, bool IsSystem, bool IsTransportFeeHead);

public sealed record CreateFeeHeadRequest(string Name, string? Code, bool IsTransportFeeHead = false);
public sealed record UpdateFeeHeadRequest(string? Name, string? Code, bool? Active, bool? IsTransportFeeHead = null);
```

Replace the `CreateAsync` method (lines 645-653):

```csharp
    public Task<FeeHeadResponse?> CreateAsync(Guid tenantId, CreateFeeHeadRequest r, CancellationToken ct = default) =>
        QuerySingleProcAsync<FeeHeadResponse>("dbo.FeeHead_Create", new
        {
            TenantId = tenantId,
            Name = r.Name.Trim(),
            Code = string.IsNullOrWhiteSpace(r.Code) ? null : r.Code.Trim(),
            Active = true,
            IsSystem = false,
            r.IsTransportFeeHead,
        }, ct);
```

Replace the `UpdateAsync` method (lines 655-665):

```csharp
    public Task<FeeHeadResponse?> UpdateAsync(
        Guid id, Guid tenantId, UpdateFeeHeadRequest r, CancellationToken ct = default) =>
        QuerySingleProcAsync<FeeHeadResponse>("dbo.FeeHead_Update", new
        {
            Id = id,
            TenantId = tenantId,
            Name = string.IsNullOrWhiteSpace(r.Name) ? null : r.Name.Trim(),
            Code = r.Code is null ? null : (string.IsNullOrWhiteSpace(r.Code) ? null : r.Code.Trim()),
            CodeSpecified = r.Code is not null,
            r.Active,
            r.IsTransportFeeHead,
        }, ct);
```

Add a new method right after `UpdateAsync` (before `DeleteAsync`), used by Task 3's validation:

```csharp
    public async Task<bool> IsTransportFeeHeadAsync(Guid id, Guid tenantId, CancellationToken ct = default) =>
        (await QueryInlineAsync<int>(
            "SELECT COUNT(1) FROM dbo.FeeHeads WHERE Id = @id AND TenantId = @tenantId AND IsTransportFeeHead = 1",
            new { id, tenantId }, ct)).First() > 0;
```

- [ ] **Step 5: Run the migration against the test database and re-run the test**

Run: `dotnet run --project db/Sms.Migrations -- migrate` (or the project's existing migration-runner command — check `db/Sms.Migrations/MigrateCli.cs` usage in `README.md` / CI scripts if this command differs)
Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~FeeHeadsTests.Create_head_with_transport_flag_then_list_returns_it_flagged`
Expected: PASS

- [ ] **Step 6: Run the full existing FeeHead/Finance test suite to confirm no regression**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~FeeHead`
Expected: All PASS (existing create/update/list tests must still pass with the new optional field defaulting to `false`)

- [ ] **Step 7: Commit**

```bash
git add db/Sms.Migrations/M0184_FeeHeads_TransportFlag.cs src/Sms.Modules.Finance/FinanceModule.cs tests/Sms.Tests.Integration/Finance/FeeHeadsTests.cs
git commit -m "feat(fees): add IsTransportFeeHead flag to FeeHeads"
```

---

### Task 2: Migration — `StudentBusAssignments` nullable `BusId` + new `RouteId`/`FeeHeadId` columns + `StudentTransport_Upsert` proc

**Files:**
- Create: `db/Sms.Migrations/M0185_StudentBusAssignments_TransportMapping.cs`
- Modify: `src/Sms.Modules.Transport/StudentBusModule.cs` (add `UpsertTransportAsync`, `OptInAsync`, `OptOutAsync`, `GetTransportStatusAsync` to `StudentBusRepository`)
- Test: `tests/Sms.Tests.Integration/Transport/StudentTransportMappingTests.cs` (new file — schema-level test only; the service-level behavior is tested in Task 3)

**Interfaces:**
- Consumes: nothing new.
- Produces: `dbo.StudentTransport_Upsert` proc (`@TenantId, @StudentId, @RouteId, @StopId = NULL, @FeeHeadId = NULL, @BusId = NULL`); `StudentBusRepository.UpsertTransportAsync(Guid tenantId, Guid studentId, Guid routeId, Guid? stopId, Guid? feeHeadId, Guid? busId, CancellationToken ct)`; `StudentBusRepository.OptInAsync(Guid tenantId, Guid studentId, CancellationToken ct)`; `StudentBusRepository.OptOutAsync(Guid tenantId, Guid studentId, CancellationToken ct)`; `StudentBusRepository.GetTransportStatusAsync(Guid studentId, CancellationToken ct) : Task<TransportStatusRow?>` where `TransportStatusRow(Guid? BusId, Guid? RouteId, Guid? StopId, Guid? FeeHeadId)` — consumed by Task 3's `StudentTransportService`.

- [ ] **Step 1: Write the failing test (schema + proc smoke test)**

Create `tests/Sms.Tests.Integration/Transport/StudentTransportMappingTests.cs`:

```csharp
using Dapper;
using FluentAssertions;
using Microsoft.Data.SqlClient;
using Sms.Tests.Integration;

namespace Sms.Tests.Integration.Transport;

[Collection("sql")]
public class StudentTransportMappingTests(SqlServerFixture fx)
{
    private static async Task Seed(string cs, Guid tenantId, Func<SqlConnection, Task> work)
    {
        await using var conn = new SqlConnection(cs);
        await conn.OpenAsync();
        await conn.ExecuteAsync("EXEC sp_set_session_context @key=N'TenantId', @value=@t", new { t = tenantId });
        await work(conn);
    }

    [Fact]
    public async Task StudentTransport_Upsert_creates_pending_row_with_null_bus()
    {
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var studentId = Guid.NewGuid();
        var routeId = Guid.NewGuid();

        await Seed(fx.ConnectionString, tenantId, async conn =>
        {
            await conn.ExecuteAsync(
                "INSERT dbo.Students (Id, TenantId, AdmissionNo, Name) VALUES (@Id, @TenantId, @A, @N)",
                new { Id = studentId, TenantId = tenantId, A = "T-001", N = "Test Student" });
            await conn.ExecuteAsync(
                "INSERT dbo.TransportRoutes (Id, TenantId, Name) VALUES (@Id, @TenantId, @Name)",
                new { Id = routeId, TenantId = tenantId, Name = "Route Pending" });

            await conn.ExecuteAsync("dbo.StudentTransport_Upsert",
                new { TenantId = tenantId, StudentId = studentId, RouteId = routeId, StopId = (Guid?)null, FeeHeadId = (Guid?)null, BusId = (Guid?)null },
                commandType: System.Data.CommandType.StoredProcedure);
        });

        await using var conn = new SqlConnection(fx.ConnectionString);
        await conn.OpenAsync();
        await conn.ExecuteAsync("EXEC sp_set_session_context @key=N'TenantId', @value=@t", new { t = tenantId });
        var row = await conn.QuerySingleAsync<(Guid? BusId, Guid RouteId)>(
            "SELECT BusId, RouteId FROM dbo.StudentBusAssignments WHERE StudentId = @studentId", new { studentId });

        row.BusId.Should().BeNull();
        row.RouteId.Should().Be(routeId);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~StudentTransportMappingTests`
Expected: FAIL — `dbo.StudentTransport_Upsert` does not exist, and `BusId`/`RouteId` may reject a NULL insert (`BusId NOT NULL` constraint violation).

- [ ] **Step 3: Write the migration**

Create `db/Sms.Migrations/M0185_StudentBusAssignments_TransportMapping.cs`:

```csharp
using FluentMigrator;

namespace Sms.Migrations;

[Migration(185, "Transport: StudentBusAssignments nullable BusId + RouteId/FeeHeadId for opt-in mapping ahead of bus assignment")]
public sealed class M0185_StudentBusAssignments_TransportMapping : Migration
{
    public override void Up()
    {
        Alter.Column("BusId").OnTable("StudentBusAssignments").AsGuid().Nullable();

        Execute.Sql(@"
IF COL_LENGTH('dbo.StudentBusAssignments', 'RouteId') IS NULL
    ALTER TABLE dbo.StudentBusAssignments ADD RouteId uniqueidentifier NULL;");
        Execute.Sql(@"
IF COL_LENGTH('dbo.StudentBusAssignments', 'FeeHeadId') IS NULL
    ALTER TABLE dbo.StudentBusAssignments ADD FeeHeadId uniqueidentifier NULL;");

        // Distinct from dbo.StudentBus_Assign (legacy per-bus "add a student" flow, unchanged):
        // this proc is the only writer of RouteId/FeeHeadId, called by the new opt-in endpoint.
        // BusId may be NULL here ("Pending Bus Assignment" — route/stop chosen, no bus available yet).
        Execute.Sql(@"
CREATE OR ALTER PROCEDURE dbo.StudentTransport_Upsert
    @TenantId uniqueidentifier, @StudentId uniqueidentifier,
    @RouteId uniqueidentifier, @StopId uniqueidentifier = NULL,
    @FeeHeadId uniqueidentifier = NULL, @BusId uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.StudentBusAssignments AS tgt
    USING (SELECT @TenantId AS TenantId, @StudentId AS StudentId) AS src
        ON tgt.TenantId = src.TenantId AND tgt.StudentId = src.StudentId
    WHEN MATCHED THEN
        UPDATE SET RouteId = @RouteId, StopId = @StopId, FeeHeadId = @FeeHeadId, BusId = @BusId, CreatedAt = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (TenantId, StudentId, RouteId, StopId, FeeHeadId, BusId)
        VALUES (@TenantId, @StudentId, @RouteId, @StopId, @FeeHeadId, @BusId);
END");
    }

    public override void Down()
    {
        Execute.Sql("DROP PROCEDURE IF EXISTS dbo.StudentTransport_Upsert;");
        Execute.Sql("IF COL_LENGTH('dbo.StudentBusAssignments', 'FeeHeadId') IS NOT NULL ALTER TABLE dbo.StudentBusAssignments DROP COLUMN FeeHeadId;");
        Execute.Sql("IF COL_LENGTH('dbo.StudentBusAssignments', 'RouteId') IS NOT NULL ALTER TABLE dbo.StudentBusAssignments DROP COLUMN RouteId;");
        Alter.Column("BusId").OnTable("StudentBusAssignments").AsGuid().NotNullable();
    }
}
```

- [ ] **Step 4: Add repository methods**

In `src/Sms.Modules.Transport/StudentBusModule.cs`, add this record near the top (after `ChildBusRow`, before `StudentBusRepository`):

```csharp
public sealed record TransportStatusRow(Guid? BusId, Guid? RouteId, Guid? StopId, Guid? FeeHeadId);
```

Add these methods to `StudentBusRepository`, right after `UnassignAsync` (after line 35):

```csharp
    public Task OptInAsync(Guid tenantId, Guid studentId, CancellationToken ct = default) =>
        ExecuteProcAsync("dbo.StudentTransport_OptIn", new { TenantId = tenantId, StudentId = studentId }, ct);

    public Task OptOutAsync(Guid tenantId, Guid studentId, CancellationToken ct = default) =>
        ExecuteProcAsync("dbo.StudentTransport_OptOut", new { TenantId = tenantId, StudentId = studentId }, ct);

    public Task UpsertTransportAsync(
        Guid tenantId, Guid studentId, Guid routeId, Guid? stopId, Guid? feeHeadId, Guid? busId,
        CancellationToken ct = default) =>
        ExecuteProcAsync("dbo.StudentTransport_Upsert",
            new { TenantId = tenantId, StudentId = studentId, RouteId = routeId, StopId = stopId, FeeHeadId = feeHeadId, BusId = busId },
            ct);

    public async Task<TransportStatusRow?> GetTransportStatusAsync(Guid studentId, CancellationToken ct = default) =>
        (await QueryInlineAsync<TransportStatusRow>(
            "SELECT BusId, RouteId, StopId, FeeHeadId FROM dbo.StudentBusAssignments WHERE StudentId = @studentId",
            new { studentId }, ct)).FirstOrDefault();
```

- [ ] **Step 5: Run the migration and re-run the test**

Run: `dotnet run --project db/Sms.Migrations -- migrate`
Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~StudentTransportMappingTests`
Expected: PASS

- [ ] **Step 6: Run the existing StudentBus/BusCapacity suites to confirm no regression**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~StudentBusTests|FullyQualifiedName~BusCapacityTests`
Expected: All PASS — the legacy `StudentBus_Assign`/`StudentBus_Unassign` procs are untouched, and `BusId` nullable doesn't affect a legacy caller that always supplies a real bus id.

- [ ] **Step 7: Commit**

```bash
git add db/Sms.Migrations/M0185_StudentBusAssignments_TransportMapping.cs src/Sms.Modules.Transport/StudentBusModule.cs tests/Sms.Tests.Integration/Transport/StudentTransportMappingTests.cs
git commit -m "feat(transport): nullable StudentBusAssignments.BusId + RouteId/FeeHeadId columns"
```

---

### Task 3: `BusRepository.ListBusesForRouteAsync` — least-loaded bus selection query

**Files:**
- Modify: `src/Sms.Modules.Transport/BusModule.cs` (add record + repository method, near `GetCapacityAndOccupancyAsync` at line 197)
- Test: `tests/Sms.Tests.Integration/Transport/BusCapacityTests.cs` (add to the existing file)

**Interfaces:**
- Produces: `RouteBusCandidate(Guid BusId, int? Capacity, int Occupied)`; `BusRepository.ListBusesForRouteAsync(Guid routeId, CancellationToken ct = default) : Task<IReadOnlyList<RouteBusCandidate>>`, ordered by `Id` ascending — consumed by Task 4's `StudentTransportService` for least-loaded selection.

- [ ] **Step 1: Write the failing test**

Add to `tests/Sms.Tests.Integration/Transport/BusCapacityTests.cs` (append a new `[Fact]` after `AssignStudent_reassigning_seated_student_to_same_bus_never_false_blocks`):

```csharp
    [Fact]
    public async Task ListBusesForRoute_orders_by_id_and_reports_occupancy()
    {
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var routeId = Guid.NewGuid();
        Guid busA = Guid.NewGuid(), busB = Guid.NewGuid();
        // Force a deterministic ascending order regardless of NEWSEQUENTIALID generation order.
        if (busB.CompareTo(busA) < 0) (busA, busB) = (busB, busA);

        await Seed(fx.ConnectionString, tenantId, async conn =>
        {
            await conn.ExecuteAsync(
                "INSERT dbo.TransportRoutes (Id, TenantId, Name) VALUES (@Id, @TenantId, @Name)",
                new { Id = routeId, TenantId = tenantId, Name = "Occupancy Route" });
            await conn.ExecuteAsync(
                "INSERT dbo.Buses (Id, TenantId, BusNo, RouteId, Capacity) VALUES (@Id, @TenantId, 'OCC-A', @RouteId, 2)",
                new { Id = busA, TenantId = tenantId, RouteId = routeId });
            await conn.ExecuteAsync(
                "INSERT dbo.Buses (Id, TenantId, BusNo, RouteId, Capacity) VALUES (@Id, @TenantId, 'OCC-B', @RouteId, 5)",
                new { Id = busB, TenantId = tenantId, RouteId = routeId });
            var seated = Guid.NewGuid();
            await conn.ExecuteAsync(
                "INSERT dbo.Students (Id, TenantId, AdmissionNo, Name) VALUES (@Id, @TenantId, 'OCC-S', 'Seated')",
                new { Id = seated, TenantId = tenantId });
            await conn.ExecuteAsync(
                "INSERT dbo.StudentBusAssignments (Id, TenantId, StudentId, BusId) VALUES (@Id, @TenantId, @S, @B)",
                new { Id = Guid.NewGuid(), TenantId = tenantId, S = seated, B = busA });
        });

        using var scope = App().Services.CreateScope();
        // Resolved directly (not over HTTP) since this is a repository-level query, not an endpoint.
        var repo = scope.ServiceProvider.GetRequiredService<Sms.Modules.Transport.BusRepository>();
        var candidates = await repo.ListBusesForRouteAsync(routeId);

        candidates.Should().HaveCount(2);
        candidates.Should().BeInAscendingOrder(c => c.BusId);
        candidates.Single(c => c.BusId == busA).Occupied.Should().Be(1);
        candidates.Single(c => c.BusId == busB).Occupied.Should().Be(0);
    }
```

Add these two `using` lines to the top of the file if not already present: `using Microsoft.Extensions.DependencyInjection;` and `using System.Linq;`.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~ListBusesForRoute_orders_by_id_and_reports_occupancy`
Expected: FAIL with a compile error — `ListBusesForRouteAsync` does not exist on `BusRepository`.

- [ ] **Step 3: Implement the repository method**

In `src/Sms.Modules.Transport/BusModule.cs`, add this record near the top of the file (alongside `TransportRouteListItem` at line 34):

```csharp
public sealed record RouteBusCandidate(Guid BusId, int? Capacity, int Occupied);
```

Add this method to `BusRepository`, immediately after `GetCapacityAndOccupancyAsync` (after line 204):

```csharp
    public async Task<IReadOnlyList<RouteBusCandidate>> ListBusesForRouteAsync(Guid routeId, CancellationToken ct = default) =>
        await QueryInlineAsync<RouteBusCandidate>(
            @"SELECT b.Id AS BusId, b.Capacity,
                     (SELECT COUNT(*) FROM dbo.StudentBusAssignments sba WHERE sba.BusId = b.Id) AS Occupied
              FROM dbo.Buses b
              WHERE b.RouteId = @routeId
              ORDER BY b.Id", new { routeId }, ct);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~ListBusesForRoute_orders_by_id_and_reports_occupancy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Sms.Modules.Transport/BusModule.cs tests/Sms.Tests.Integration/Transport/BusCapacityTests.cs
git commit -m "feat(transport): add ListBusesForRouteAsync for least-loaded bus selection"
```

---

### Task 4: `IStudentTransportService` — opt-in/opt-out + least-loaded auto-assign

**Files:**
- Create: `src/Sms.Application/Services/Transport/StudentTransportService.cs`
- Modify: `src/Sms.Application/DependencyInjection.cs` (register the new service, near line 53)
- Test: `tests/Sms.Tests.Integration/Transport/StudentTransportServiceTests.cs`

**Interfaces:**
- Consumes: `StudentBusRepository.{OptInAsync, OptOutAsync, UpsertTransportAsync, GetTransportStatusAsync, StudentExistsAsync}` (Task 2), `BusRepository.ListBusesForRouteAsync` (Task 3), `FeeHeadRepository.IsTransportFeeHeadAsync` (Task 1).
- Produces: `IStudentTransportService` with `SetAsync(Guid studentId, SetStudentTransportRequest req, CancellationToken ct = default) : Task<ApiResult<StudentTransportResponse>>` and `GetAsync(Guid studentId, CancellationToken ct = default) : Task<ApiResult<StudentTransportResponse>>` — consumed by Task 5's `StudentController` endpoints.
- `SetStudentTransportRequest(bool OptedIn, Guid? RouteId, Guid? StopId, Guid? FeeHeadId)`
- `StudentTransportPendingReason(string Code, string Message)`
- `StudentTransportResponse(bool OptedIn, bool Assigned, string Status, Guid? BusId, Guid? RouteId, Guid? StopId, Guid? FeeHeadId, StudentTransportPendingReason? PendingReason)` — `Status` is one of `"assigned"`, `"pending"`, `"opted_out"`, `"not_mapped"` (the last is `GetAsync`'s result when no row exists at all, e.g. a brand-new student).

- [ ] **Step 1: Write the failing tests**

Create `tests/Sms.Tests.Integration/Transport/StudentTransportServiceTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Authz;
using Sms.Shared.Kernel.Time;
using Sms.Tests.Integration;

namespace Sms.Tests.Integration.Transport;

[Collection("sql")]
public class StudentTransportServiceTests(SqlServerFixture fx)
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
        var token = jwt.IssueAccess(Guid.NewGuid(), tenantId, [Policies.Principal], isPlatform: false);
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        return client;
    }

    private static async Task Seed(string cs, Guid tenantId, Func<SqlConnection, Task> work)
    {
        await using var conn = new SqlConnection(cs);
        await conn.OpenAsync();
        await conn.ExecuteAsync("EXEC sp_set_session_context @key=N'TenantId', @value=@t", new { t = tenantId });
        await work(conn);
    }

    private static async Task<Guid> SeedStudentAsync(string cs, Guid tenantId, string adm)
    {
        var id = Guid.NewGuid();
        await Seed(cs, tenantId, conn => conn.ExecuteAsync(
            "INSERT dbo.Students (Id, TenantId, AdmissionNo, Name) VALUES (@Id, @TenantId, @Adm, 'Test Student')",
            new { Id = id, TenantId = tenantId, Adm = adm }));
        return id;
    }

    private static async Task<Guid> SeedRouteAsync(string cs, Guid tenantId, string name)
    {
        var id = Guid.NewGuid();
        await Seed(cs, tenantId, conn => conn.ExecuteAsync(
            "INSERT dbo.TransportRoutes (Id, TenantId, Name) VALUES (@Id, @TenantId, @Name)",
            new { Id = id, TenantId = tenantId, Name = name }));
        return id;
    }

    private static async Task<Guid> SeedBusOnRouteAsync(string cs, Guid tenantId, Guid routeId, string busNo, int? capacity)
    {
        var id = Guid.NewGuid();
        await Seed(cs, tenantId, conn => conn.ExecuteAsync(
            "INSERT dbo.Buses (Id, TenantId, BusNo, RouteId, Capacity) VALUES (@Id, @TenantId, @BusNo, @RouteId, @Capacity)",
            new { Id = id, TenantId = tenantId, BusNo = busNo, RouteId = routeId, Capacity = capacity }));
        return id;
    }

    [Fact]
    public async Task Opt_in_with_available_bus_assigns_immediately()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var studentId = await SeedStudentAsync(fx.ConnectionString, tenantId, "TS-001");
        var routeId = await SeedRouteAsync(fx.ConnectionString, tenantId, "Route Avail");
        var busId = await SeedBusOnRouteAsync(fx.ConnectionString, tenantId, routeId, "AVAIL-1", capacity: 2);

        var res = await AdminClient(app, tenantId).PutAsJsonAsync($"/v1/students/{studentId}/transport",
            new { optedIn = true, routeId });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        data.GetProperty("assigned").GetBoolean().Should().BeTrue();
        data.GetProperty("status").GetString().Should().Be("assigned");
        data.GetProperty("bus_id").GetGuid().Should().Be(busId);
    }

    [Fact]
    public async Task Opt_in_with_no_capacity_saves_as_pending_never_fails()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var studentId = await SeedStudentAsync(fx.ConnectionString, tenantId, "TS-002");
        var routeId = await SeedRouteAsync(fx.ConnectionString, tenantId, "Route Full");
        var busId = await SeedBusOnRouteAsync(fx.ConnectionString, tenantId, routeId, "FULL-1", capacity: 1);
        var seated = await SeedStudentAsync(fx.ConnectionString, tenantId, "TS-SEAT");
        await Seed(fx.ConnectionString, tenantId, conn => conn.ExecuteAsync(
            "INSERT dbo.StudentBusAssignments (Id, TenantId, StudentId, BusId) VALUES (@Id, @TenantId, @S, @B)",
            new { Id = Guid.NewGuid(), TenantId = tenantId, S = seated, B = busId }));

        var res = await AdminClient(app, tenantId).PutAsJsonAsync($"/v1/students/{studentId}/transport",
            new { optedIn = true, routeId });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        data.GetProperty("assigned").GetBoolean().Should().BeFalse();
        data.GetProperty("status").GetString().Should().Be("pending");
        data.GetProperty("bus_id").ValueKind.Should().Be(JsonValueKind.Null);
        data.GetProperty("pending_reason").GetProperty("code").GetString().Should().Be("no_capacity");
    }

    [Fact]
    public async Task Opt_in_without_route_returns_400()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var studentId = await SeedStudentAsync(fx.ConnectionString, tenantId, "TS-003");

        var res = await AdminClient(app, tenantId).PutAsJsonAsync($"/v1/students/{studentId}/transport",
            new { optedIn = true });

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Opt_in_with_fee_head_not_flagged_as_transport_returns_400()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var studentId = await SeedStudentAsync(fx.ConnectionString, tenantId, "TS-004");
        var routeId = await SeedRouteAsync(fx.ConnectionString, tenantId, "Route FH");
        var feeHeadId = Guid.NewGuid();
        await Seed(fx.ConnectionString, tenantId, conn => conn.ExecuteAsync(
            "INSERT dbo.FeeHeads (Id, TenantId, Name, IsTransportFeeHead) VALUES (@Id, @TenantId, 'Tuition', 0)",
            new { Id = feeHeadId, TenantId = tenantId }));

        var res = await AdminClient(app, tenantId).PutAsJsonAsync($"/v1/students/{studentId}/transport",
            new { optedIn = true, routeId, feeHeadId });

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("error").GetProperty("code").GetString().Should().Be("invalid_fee_head");
    }

    [Fact]
    public async Task Opt_out_removes_assignment_row()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var studentId = await SeedStudentAsync(fx.ConnectionString, tenantId, "TS-005");
        var routeId = await SeedRouteAsync(fx.ConnectionString, tenantId, "Route Out");
        var busId = await SeedBusOnRouteAsync(fx.ConnectionString, tenantId, routeId, "OUT-1", capacity: 5);
        var client = AdminClient(app, tenantId);
        await client.PutAsJsonAsync($"/v1/students/{studentId}/transport", new { optedIn = true, routeId });

        var res = await client.PutAsJsonAsync($"/v1/students/{studentId}/transport", new { optedIn = false });

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        await using var conn = new SqlConnection(fx.ConnectionString);
        await conn.OpenAsync();
        await conn.ExecuteAsync("EXEC sp_set_session_context @key=N'TenantId', @value=@t", new { t = tenantId });
        var count = await conn.QuerySingleAsync<int>(
            "SELECT COUNT(*) FROM dbo.StudentBusAssignments WHERE StudentId = @studentId", new { studentId });
        count.Should().Be(0);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~StudentTransportServiceTests`
Expected: FAIL — `/v1/students/{id}/transport` doesn't exist yet (404 on every request).

- [ ] **Step 3: Implement the service**

Create `src/Sms.Application/Services/Transport/StudentTransportService.cs`:

```csharp
using Sms.Modules.Transport;
using Sms.Shared.Kernel.Results;
using Sms.Shared.Kernel.Tenancy;

namespace Sms.Application.Services.Transport;

public sealed record SetStudentTransportRequest(bool OptedIn, Guid? RouteId = null, Guid? StopId = null, Guid? FeeHeadId = null);
public sealed record StudentTransportPendingReason(string Code, string Message);
public sealed record StudentTransportResponse(
    bool OptedIn, bool Assigned, string Status, Guid? BusId, Guid? RouteId, Guid? StopId, Guid? FeeHeadId,
    StudentTransportPendingReason? PendingReason);

public interface IStudentTransportService
{
    Task<ApiResult<StudentTransportResponse>> SetAsync(Guid studentId, SetStudentTransportRequest req, CancellationToken ct = default);
    Task<ApiResult<StudentTransportResponse>> GetAsync(Guid studentId, CancellationToken ct = default);
}

public sealed class StudentTransportService(
    StudentBusRepository busAssignRepo, BusRepository busRepo, FeeHeadRepository feeHeadRepo, ITenantContext tenant)
    : IStudentTransportService
{
    private static readonly StudentTransportResponse NotMapped =
        new(false, false, "not_mapped", null, null, null, null, null);

    public async Task<ApiResult<StudentTransportResponse>> GetAsync(Guid studentId, CancellationToken ct = default)
    {
        if (!await busAssignRepo.StudentExistsAsync(studentId, ct))
            return ApiResult<StudentTransportResponse>.Fail(new Error("not_found", "student not found"), 404);

        var row = await busAssignRepo.GetTransportStatusAsync(studentId, ct);
        if (row is null)
            return ApiResult<StudentTransportResponse>.Ok(NotMapped);

        return ApiResult<StudentTransportResponse>.Ok(row.BusId is { } busId
            ? new StudentTransportResponse(true, true, "assigned", busId, row.RouteId, row.StopId, row.FeeHeadId, null)
            : new StudentTransportResponse(true, false, "pending", null, row.RouteId, row.StopId, row.FeeHeadId,
                new StudentTransportPendingReason("no_capacity", "No bus currently has available capacity on this route.")));
    }

    public async Task<ApiResult<StudentTransportResponse>> SetAsync(
        Guid studentId, SetStudentTransportRequest req, CancellationToken ct = default)
    {
        if (tenant.TenantId is not { } tid)
            return ApiResult<StudentTransportResponse>.Fail(new Error("forbidden", "no tenant context"), 403);
        if (!await busAssignRepo.StudentExistsAsync(studentId, ct))
            return ApiResult<StudentTransportResponse>.Fail(new Error("not_found", "student not found"), 404);

        if (!req.OptedIn)
        {
            await busAssignRepo.OptOutAsync(tid, studentId, ct);
            return ApiResult<StudentTransportResponse>.Ok(
                new StudentTransportResponse(false, false, "opted_out", null, null, null, null, null));
        }

        if (req.RouteId is not { } routeId)
            return ApiResult<StudentTransportResponse>.Fail(
                new Error("validation_error", "Route is required to opt in to transport"), 400);

        if (req.FeeHeadId is { } feeHeadId && !await feeHeadRepo.IsTransportFeeHeadAsync(feeHeadId, tid, ct))
            return ApiResult<StudentTransportResponse>.Fail(
                new Error("invalid_fee_head", "Selected fee head is not marked as the transport fee head"), 400);

        await busAssignRepo.OptInAsync(tid, studentId, ct);

        var candidates = await busRepo.ListBusesForRouteAsync(routeId, ct);
        Guid? busId = null;
        var bestFree = int.MinValue;
        foreach (var c in candidates)
        {
            int free;
            if (c.Capacity is not { } cap) { free = int.MaxValue; }
            else
            {
                free = cap - c.Occupied;
                if (free <= 0) continue;
            }
            if (free > bestFree) { bestFree = free; busId = c.BusId; }
        }

        await busAssignRepo.UpsertTransportAsync(tid, studentId, routeId, req.StopId, req.FeeHeadId, busId, ct);

        if (busId is null)
            return ApiResult<StudentTransportResponse>.Ok(new StudentTransportResponse(
                true, false, "pending", null, routeId, req.StopId, req.FeeHeadId,
                new StudentTransportPendingReason("no_capacity", "No bus currently has available capacity on this route.")));

        return ApiResult<StudentTransportResponse>.Ok(
            new StudentTransportResponse(true, true, "assigned", busId, routeId, req.StopId, req.FeeHeadId, null));
    }
}
```

- [ ] **Step 4: Register the service**

In `src/Sms.Application/DependencyInjection.cs`, add immediately after line 53 (`services.AddScoped<IStudentBusService, StudentBusService>();`):

```csharp
        services.AddScoped<IStudentTransportService, StudentTransportService>();
```

- [ ] **Step 5: Wire the endpoint (minimal, to make the tests runnable) — see Task 5 for the full controller change**

This step is intentionally deferred to Task 5, which adds the controller endpoint these tests call. Skip running the tests again until Task 5, Step 4 is done — go to Task 5 now.

- [ ] **Step 6: Commit** (after Task 5 makes the endpoint reachable — combine into Task 5's commit; do not commit Task 4 in isolation)

---

### Task 5: `StudentController` — `PUT`/`GET /v1/students/{id}/transport`

**Files:**
- Modify: `src/Sms.Api/Controllers/StudentController.cs`

**Interfaces:**
- Consumes: `IStudentTransportService` (Task 4).
- Produces: `PUT /v1/students/{id}/transport` (body: `{ optedIn, routeId?, stopId?, feeHeadId? }`), `GET /v1/students/{id}/transport` — both staff-only, matching the existing `Create`/`Update` guard pattern in this controller.

- [ ] **Step 1: Modify the controller**

In `src/Sms.Api/Controllers/StudentController.cs`, change the class declaration (line 12):

```csharp
public sealed class StudentController(ISisService sis, IAcademicsService academics, IStudentTransportService transport) : ApiControllerBase
```

Add `using Sms.Application.Services.Transport;` to the top of the file (after line 5).

Add these two endpoints immediately after the `Update` method (after line 43, before `ListByClass`):

```csharp
    [HttpPut("students/{id:guid}/transport")]
    public async Task<IActionResult> SetTransport(Guid id, [FromBody] SetStudentTransportRequest req, CancellationToken ct)
    {
        if (!RoleChecks.IsStaff(User))
            return ForbiddenResult("staff only");
        return FromResult(await transport.SetAsync(id, req, ct));
    }

    [HttpGet("students/{id:guid}/transport")]
    public async Task<IActionResult> GetTransport(Guid id, CancellationToken ct)
    {
        if (!RoleChecks.IsStaff(User))
            return ForbiddenResult("staff only");
        return FromResult(await transport.GetAsync(id, ct));
    }
```

- [ ] **Step 2: Run Task 4's tests — they should now pass**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~StudentTransportServiceTests`
Expected: PASS (all 5 tests)

- [ ] **Step 3: Run the full backend test suite to confirm no regression**

Run: `dotnet test tests/Sms.Tests.Integration`
Expected: All PASS

- [ ] **Step 4: Commit (Task 4 + 5 together)**

```bash
git add src/Sms.Application/Services/Transport/StudentTransportService.cs src/Sms.Application/DependencyInjection.cs src/Sms.Api/Controllers/StudentController.cs tests/Sms.Tests.Integration/Transport/StudentTransportServiceTests.cs
git commit -m "feat(transport): student opt-in/opt-out endpoint with best-effort least-loaded bus assignment"
```

---

### Task 6: Transport Students list — backend query + endpoint

**Files:**
- Modify: `src/Sms.Modules.Transport/StudentBusModule.cs` (add `ListMappedAsync` + filter record)
- Modify: `src/Sms.Application/Services/Transport/StudentBusService.cs` (add `ListMappedAsync` to `IStudentBusService`)
- Modify: `src/Sms.Api/Controllers/TransportController.cs` (add `GET /v1/transport/students`)
- Test: `tests/Sms.Tests.Integration/Transport/TransportStudentsListTests.cs`

**Interfaces:**
- Consumes: nothing new (reads `StudentBusAssignments` joined with `Students`, `TransportRoutes`, `RouteStops`, `BusStops`, `Buses`, `Staff`, `FeeHeads`).
- Produces: `TransportMappedStudentResponse(Guid StudentId, string StudentName, string AdmissionNo, string? Grade, string? Section, Guid? FeeHeadId, string? FeeHeadName, Guid RouteId, string? RouteName, Guid? StopId, string? StopName, Guid? BusId, string? BusNo, string? Driver, string? ConductorName, int? Capacity, int BusOccupied, string MappingStatus)` where `MappingStatus` is `"mapped"` or `"pending"`; `GET /v1/transport/students?routeId=&stopId=&busId=&grade=&feeHeadId=&status=` (staff-only, `Policies.Principal`).

- [ ] **Step 1: Write the failing test**

Create `tests/Sms.Tests.Integration/Transport/TransportStudentsListTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Sms.Shared.Kernel.Auth;
using Sms.Shared.Kernel.Authz;
using Sms.Shared.Kernel.Time;
using Sms.Tests.Integration;

namespace Sms.Tests.Integration.Transport;

[Collection("sql")]
public class TransportStudentsListTests(SqlServerFixture fx)
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
        var token = jwt.IssueAccess(Guid.NewGuid(), tenantId, [Policies.Principal], isPlatform: false);
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        return client;
    }

    private static async Task Seed(string cs, Guid tenantId, Func<SqlConnection, Task> work)
    {
        await using var conn = new SqlConnection(cs);
        await conn.OpenAsync();
        await conn.ExecuteAsync("EXEC sp_set_session_context @key=N'TenantId', @value=@t", new { t = tenantId });
        await work(conn);
    }

    [Fact]
    public async Task List_returns_mapped_and_pending_with_status_filter()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        await TestTenancy.EnsureTenantAsync(fx.ConnectionString, tenantId, tier: "platinum");
        var routeId = Guid.NewGuid();
        var busId = Guid.NewGuid();
        var mappedStudent = Guid.NewGuid();
        var pendingStudent = Guid.NewGuid();

        await Seed(fx.ConnectionString, tenantId, async conn =>
        {
            await conn.ExecuteAsync(
                "INSERT dbo.TransportRoutes (Id, TenantId, Name) VALUES (@Id, @TenantId, 'List Route')",
                new { Id = routeId, TenantId = tenantId });
            await conn.ExecuteAsync(
                "INSERT dbo.Buses (Id, TenantId, BusNo, RouteId, Capacity) VALUES (@Id, @TenantId, 'LIST-1', @RouteId, 10)",
                new { Id = busId, TenantId = tenantId, RouteId = routeId });
            await conn.ExecuteAsync(
                "INSERT dbo.Students (Id, TenantId, AdmissionNo, Name, Grade) VALUES (@Id, @TenantId, 'M-1', 'Mapped Kid', '5')",
                new { Id = mappedStudent, TenantId = tenantId });
            await conn.ExecuteAsync(
                "INSERT dbo.Students (Id, TenantId, AdmissionNo, Name, Grade) VALUES (@Id, @TenantId, 'P-1', 'Pending Kid', '6')",
                new { Id = pendingStudent, TenantId = tenantId });
            await conn.ExecuteAsync(
                "INSERT dbo.StudentBusAssignments (Id, TenantId, StudentId, RouteId, BusId) VALUES (@Id, @TenantId, @S, @R, @B)",
                new { Id = Guid.NewGuid(), TenantId = tenantId, S = mappedStudent, R = routeId, B = busId });
            await conn.ExecuteAsync(
                "INSERT dbo.StudentBusAssignments (Id, TenantId, StudentId, RouteId, BusId) VALUES (@Id, @TenantId, @S, @R, NULL)",
                new { Id = Guid.NewGuid(), TenantId = tenantId, S = pendingStudent, R = routeId });
        });

        var client = AdminClient(app, tenantId);
        var all = await client.GetAsync("/v1/transport/students");
        using var allDoc = JsonDocument.Parse(await all.Content.ReadAsStringAsync());
        allDoc.RootElement.GetProperty("data").GetArrayLength().Should().Be(2);

        var pendingOnly = await client.GetAsync("/v1/transport/students?status=pending");
        using var pendingDoc = JsonDocument.Parse(await pendingOnly.Content.ReadAsStringAsync());
        var rows = pendingDoc.RootElement.GetProperty("data");
        rows.GetArrayLength().Should().Be(1);
        rows[0].GetProperty("student_name").GetString().Should().Be("Pending Kid");
        rows[0].GetProperty("mapping_status").GetString().Should().Be("pending");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~TransportStudentsListTests`
Expected: FAIL — `GET /v1/transport/students` returns 404 (route doesn't exist).

- [ ] **Step 3: Implement the repository query**

In `src/Sms.Modules.Transport/StudentBusModule.cs`, add this record near `AssignmentRow` (before `StudentBusRepository`, or alongside `TransportStatusRow` from Task 2):

```csharp
public sealed record TransportMappedStudentResponse(
    Guid StudentId, string StudentName, string AdmissionNo, string? Grade, string? Section,
    Guid? FeeHeadId, string? FeeHeadName, Guid? RouteId, string? RouteName, Guid? StopId, string? StopName,
    Guid? BusId, string? BusNo, string? Driver, string? ConductorName, int? Capacity, int BusOccupied,
    string MappingStatus);

public sealed record TransportStudentsFilter(
    Guid? RouteId, Guid? StopId, Guid? BusId, string? Grade, Guid? FeeHeadId, string? Status);
```

Add this method to `StudentBusRepository`, after `GetTransportStatusAsync` (from Task 2):

```csharp
    public async Task<IReadOnlyList<TransportMappedStudentResponse>> ListMappedAsync(
        TransportStudentsFilter filter, CancellationToken ct = default)
    {
        var rows = await QueryInlineAsync<TransportMappedStudentResponse>(
            @"SELECT s.Id AS StudentId, s.Name AS StudentName, s.AdmissionNo, s.Grade, s.Section,
                     sba.FeeHeadId, fh.Name AS FeeHeadName,
                     sba.RouteId, r.Name AS RouteName,
                     sba.StopId, COALESCE(rs.Name, bs.Name) AS StopName,
                     sba.BusId, b.BusNo, b.Driver, cs.Name AS ConductorName, b.Capacity,
                     ISNULL((SELECT COUNT(*) FROM dbo.StudentBusAssignments x WHERE x.BusId = b.Id), 0) AS BusOccupied,
                     CASE WHEN sba.BusId IS NOT NULL THEN 'mapped' ELSE 'pending' END AS MappingStatus
              FROM dbo.StudentBusAssignments sba
              JOIN dbo.Students s ON s.Id = sba.StudentId
              LEFT JOIN dbo.TransportRoutes r ON r.Id = sba.RouteId
              LEFT JOIN dbo.RouteStops rs ON rs.Id = sba.StopId
              LEFT JOIN dbo.BusStops bs ON bs.Id = sba.StopId
              LEFT JOIN dbo.Buses b ON b.Id = sba.BusId
              LEFT JOIN dbo.Staff cs ON cs.Id = b.ConductorStaffId
              LEFT JOIN dbo.FeeHeads fh ON fh.Id = sba.FeeHeadId
              WHERE (@RouteId IS NULL OR sba.RouteId = @RouteId)
                AND (@StopId IS NULL OR sba.StopId = @StopId)
                AND (@BusId IS NULL OR sba.BusId = @BusId)
                AND (@Grade IS NULL OR s.Grade = @Grade)
                AND (@FeeHeadId IS NULL OR sba.FeeHeadId = @FeeHeadId)
                AND (@Status IS NULL
                     OR (@Status = 'mapped' AND sba.BusId IS NOT NULL)
                     OR (@Status = 'pending' AND sba.BusId IS NULL))
              ORDER BY s.Name",
            new
            {
                filter.RouteId, filter.StopId, filter.BusId, filter.Grade, filter.FeeHeadId, filter.Status,
            }, ct);
        return rows;
    }
```

- [ ] **Step 4: Wire the service + controller**

In `src/Sms.Application/Services/Transport/StudentBusService.cs`, add to the `IStudentBusService` interface (after line 15, `ListByBusAsync`):

```csharp
    Task<ApiResult<IReadOnlyList<TransportMappedStudentResponse>>> ListMappedAsync(
        TransportStudentsFilter filter, CancellationToken ct = default);
```

Add the implementation right after `ListByBusAsync`'s implementation (after line 61):

```csharp
    public async Task<ApiResult<IReadOnlyList<TransportMappedStudentResponse>>> ListMappedAsync(
        TransportStudentsFilter filter, CancellationToken ct = default)
    {
        if (!FeatureGate.Allowed(tenant, features, FeatureCatalog.Operations))
            return FeatureGate.Locked<IReadOnlyList<TransportMappedStudentResponse>>(FeatureCatalog.Operations);
        return ApiResult<IReadOnlyList<TransportMappedStudentResponse>>.Ok(await repo.ListMappedAsync(filter, ct));
    }
```

In `src/Sms.Api/Controllers/TransportController.cs`, add this endpoint after `BusStudents` (after line 85):

```csharp
    [HttpGet("students")]
    public async Task<IActionResult> ListMappedStudents(
        [FromQuery] Guid? routeId, [FromQuery] Guid? stopId, [FromQuery] Guid? busId,
        [FromQuery] string? grade, [FromQuery] Guid? feeHeadId, [FromQuery] string? status,
        CancellationToken ct) =>
        FromResult(await studentBus.ListMappedAsync(
            new TransportStudentsFilter(routeId, stopId, busId, grade, feeHeadId, status), ct));
```

Add `using Sms.Modules.Transport;` alongside the existing `using` block if not already present (it already is, per line 4).

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test tests/Sms.Tests.Integration --filter FullyQualifiedName~TransportStudentsListTests`
Expected: PASS

- [ ] **Step 6: Run the full backend suite**

Run: `dotnet test tests/Sms.Tests.Integration`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/Sms.Modules.Transport/StudentBusModule.cs src/Sms.Application/Services/Transport/StudentBusService.cs src/Sms.Api/Controllers/TransportController.cs tests/Sms.Tests.Integration/Transport/TransportStudentsListTests.cs
git commit -m "feat(transport): add GET /v1/transport/students mapped-students list with filters"
```

---

## Part B — Frontend (`sms-admin`)

### Task 7: `FeeHead` type + API + admin toggle

**Files:**
- Modify: `src/types/index.ts:24-30` (add `isTransportFeeHead` to `FeeHead`)
- Modify: `src/api/feeHeads.ts` (map/send the new field)
- Modify: `src/api/hooks/useFeeHeads.ts` (accept the field in create/update input types)
- Test: `src/api/feeHeads.test.ts`

**Interfaces:**
- Produces: `FeeHead.isTransportFeeHead?: boolean`; `createFeeHead(input: { name; code?; isTransportFeeHead?: boolean })`; `updateFeeHead(id, patch: Partial<Pick<FeeHead, 'name'|'code'|'active'|'isTransportFeeHead'>>)` — consumed by Task 9's Student Add Transport section (to filter the dropdown) and by the existing Fee settings screen (not otherwise modified in this plan — the toggle just becomes selectable wherever `createFeeHead`/`updateFeeHead` are already called from a form, since this plan doesn't touch that screen's UI beyond the type/API layer already covering it).

- [ ] **Step 1: Write the failing test**

Read `src/api/feeHeads.test.ts` first to see its existing structure and add a test in the same style (matching its existing `describe` blocks). Add:

```typescript
it('sends isTransportFeeHead on create and reads it back on list', async () => {
  const calls: Array<{ url: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (String(url).includes('/fees/heads') && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({
        data: [{ id: '1', name: 'Transport', code: null, active: true, is_system: false, is_transport_fee_head: true }],
        next_cursor: null,
      }), { status: 200 })
    }
    return new Response(JSON.stringify({
      id: '1', name: 'Transport', code: null, active: true, is_system: false, is_transport_fee_head: true,
    }), { status: 201 })
  }))

  const created = await createFeeHead({ name: 'Transport', isTransportFeeHead: true })
  expect(created.isTransportFeeHead).toBe(true)
  expect(calls[0].body).toMatchObject({ is_transport_fee_head: true })

  const list = await listFeeHeads()
  expect(list[0].isTransportFeeHead).toBe(true)
})
```

(Adjust the `vi.stubGlobal`/import names to match whatever mocking convention the existing file already uses — read the file's top imports and existing tests before writing this, since the exact fetch-stub helper name may already exist in that file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/feeHeads.test.ts`
Expected: FAIL — `isTransportFeeHead` is `undefined` on the returned object, and the request body has no `is_transport_fee_head` key.

- [ ] **Step 3: Implement**

In `src/types/index.ts`, replace lines 24-30:

```typescript
export interface FeeHead {
  id: string
  name: string
  code?: string
  active: boolean
  isSystem?: boolean
  isTransportFeeHead?: boolean
}
```

In `src/api/feeHeads.ts`, replace `toHead` (lines 14-23):

```typescript
function toHead(wire: Record<string, unknown>): FeeHead {
  const h = snakeToCamel<FeeHead>(wire)
  return {
    id: String(h.id ?? ''),
    name: String(h.name ?? '').trim(),
    code: h.code ? String(h.code) : undefined,
    active: h.active !== false,
    isSystem: Boolean(h.isSystem),
    isTransportFeeHead: Boolean(h.isTransportFeeHead),
  }
}
```

Replace `createFeeHead` (lines 36-45):

```typescript
export async function createFeeHead(input: { name: string; code?: string; isTransportFeeHead?: boolean }): Promise<FeeHead> {
  const name = input.name.trim()
  if (!name) throw new Error('Fee type name is required')
  const wire = await request<Record<string, unknown>>('/fees/heads', {
    method: 'POST',
    body: camelToSnake({
      name,
      ...(input.code?.trim() ? { code: input.code.trim() } : {}),
      isTransportFeeHead: input.isTransportFeeHead ?? false,
    }),
  })
  clearLegacy()
  return toHead(wire)
}
```

Replace `updateFeeHead` (lines 47-53):

```typescript
export async function updateFeeHead(id: string, patch: Partial<Pick<FeeHead, 'name' | 'code' | 'active' | 'isTransportFeeHead'>>): Promise<FeeHead> {
  const wire = await request<Record<string, unknown>>(`/fees/heads/${id}`, {
    method: 'PATCH',
    body: camelToSnake(patch),
  })
  return toHead(wire)
}
```

In `src/api/hooks/useFeeHeads.ts`, update the two mutation type signatures (lines 10 and 18) to match:

```typescript
export function useCreateFeeHead(): UseMutationResult<FeeHead, Error, { name: string; code?: string; isTransportFeeHead?: boolean }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; code?: string; isTransportFeeHead?: boolean }) => createFeeHead(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feeHeads.all }) },
  })
}

export function useUpdateFeeHead(): UseMutationResult<FeeHead, Error, { id: string; patch: Partial<Pick<FeeHead, 'name' | 'code' | 'active' | 'isTransportFeeHead'>> }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateFeeHead(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feeHeads.all }) },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/feeHeads.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full existing feeHeads test file to confirm no regression**

Run: `npx vitest run src/api/feeHeads.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/api/feeHeads.ts src/api/hooks/useFeeHeads.ts src/api/feeHeads.test.ts
git commit -m "feat(fees): add isTransportFeeHead to FeeHead type and API"
```

---

### Task 8: `transport.ts` — student transport mapping API

**Files:**
- Modify: `src/api/transport.ts` (add types + functions)
- Modify: `src/api/operations.ts` (re-export the new functions/types, matching the existing re-export pattern at line 37)
- Modify: `src/api/queryKeys.ts` (add `operations.studentTransport(studentId)` and `operations.transportStudentsList(filters)` keys)
- Test: `src/api/transport.test.ts` (create if it doesn't exist — check first; if there's no existing `transport.test.ts`, model it on `src/api/students.test.ts`'s fetch-stub style)

**Interfaces:**
- Produces:
  - `interface StudentTransportStatus { optedIn: boolean; assigned: boolean; status: 'assigned'|'pending'|'opted_out'|'not_mapped'; busId?: string | null; routeId?: string | null; stopId?: string | null; feeHeadId?: string | null; pendingReason?: { code: string; message: string } | null }`
  - `getStudentTransport(studentId: string): Promise<StudentTransportStatus>`
  - `setStudentTransport(studentId: string, input: { optedIn: boolean; routeId?: string | null; stopId?: string | null; feeHeadId?: string | null }): Promise<StudentTransportStatus>`
  - `interface TransportMappedStudent { studentId: string; studentName: string; admissionNo: string; grade?: string | null; section?: string | null; feeHeadId?: string | null; feeHeadName?: string | null; routeId?: string | null; routeName?: string | null; stopId?: string | null; stopName?: string | null; busId?: string | null; busNo?: string | null; driver?: string | null; conductorName?: string | null; capacity?: number | null; busOccupied: number; mappingStatus: 'mapped' | 'pending' }`
  - `interface TransportStudentsFilter { routeId?: string; stopId?: string; busId?: string; grade?: string; feeHeadId?: string; status?: 'mapped' | 'pending' }`
  - `listTransportStudents(filter?: TransportStudentsFilter): Promise<TransportMappedStudent[]>`

  Consumed by Task 9 (Student Add) and Task 10 (Transport Students list screen).

- [ ] **Step 1: Write the failing test**

Create `src/api/transport.test.ts` (or add to it if it exists):

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getStudentTransport, setStudentTransport, listTransportStudents } from './transport'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('student transport mapping API', () => {
  it('setStudentTransport sends snake_case body and maps a pending response', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return jsonResponse({
        data: {
          opted_in: true, assigned: false, status: 'pending', bus_id: null,
          route_id: 'r1', stop_id: 's1', fee_head_id: 'f1',
          pending_reason: { code: 'no_capacity', message: 'No bus currently has available capacity on this route.' },
        },
      })
    }))

    const result = await setStudentTransport('stu1', { optedIn: true, routeId: 'r1', stopId: 's1', feeHeadId: 'f1' })

    expect(calls[0].url).toContain('/students/stu1/transport')
    expect(calls[0].init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ opted_in: true, route_id: 'r1', stop_id: 's1', fee_head_id: 'f1' })
    expect(result.status).toBe('pending')
    expect(result.pendingReason?.code).toBe('no_capacity')
  })

  it('getStudentTransport GETs the current status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: { opted_in: false, assigned: false, status: 'not_mapped', bus_id: null, route_id: null, stop_id: null, fee_head_id: null, pending_reason: null },
    })))
    const result = await getStudentTransport('stu2')
    expect(result.status).toBe('not_mapped')
  })

  it('listTransportStudents applies filters as query params', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      return jsonResponse({ data: [], next_cursor: null })
    }))
    await listTransportStudents({ status: 'pending', routeId: 'r1' })
    expect(calls[0]).toContain('status=pending')
    expect(calls[0]).toContain('route_id=r1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/transport.test.ts`
Expected: FAIL — `getStudentTransport`/`setStudentTransport`/`listTransportStudents` are not exported.

- [ ] **Step 3: Implement**

In `src/api/transport.ts`, add these types after `RouteStop` (after line 87):

```typescript
export interface StudentTransportStatus {
  optedIn: boolean
  assigned: boolean
  status: 'assigned' | 'pending' | 'opted_out' | 'not_mapped'
  busId?: string | null
  routeId?: string | null
  stopId?: string | null
  feeHeadId?: string | null
  pendingReason?: { code: string; message: string } | null
}

export interface SetStudentTransportInput {
  optedIn: boolean
  routeId?: string | null
  stopId?: string | null
  feeHeadId?: string | null
}

export interface TransportMappedStudent {
  studentId: string
  studentName: string
  admissionNo: string
  grade?: string | null
  section?: string | null
  feeHeadId?: string | null
  feeHeadName?: string | null
  routeId?: string | null
  routeName?: string | null
  stopId?: string | null
  stopName?: string | null
  busId?: string | null
  busNo?: string | null
  driver?: string | null
  conductorName?: string | null
  capacity?: number | null
  busOccupied: number
  mappingStatus: 'mapped' | 'pending'
}

export interface TransportStudentsFilter {
  routeId?: string
  stopId?: string
  busId?: string
  grade?: string
  feeHeadId?: string
  status?: 'mapped' | 'pending'
}
```

Add these functions at the end of the file (after `reorderRouteStops`):

```typescript
export async function getStudentTransport(studentId: string): Promise<StudentTransportStatus> {
  if (!studentId) throw new Error('Student ID required')
  return asObj<StudentTransportStatus>(await request<Record<string, unknown>>(`/students/${studentId}/transport`))
}

export async function setStudentTransport(studentId: string, input: SetStudentTransportInput): Promise<StudentTransportStatus> {
  if (!studentId) throw new Error('Student ID required')
  const body = camelToSnake({
    optedIn: input.optedIn,
    routeId: input.optedIn ? (input.routeId || null) : null,
    stopId: input.optedIn ? (input.stopId || null) : null,
    feeHeadId: input.optedIn ? (input.feeHeadId || null) : null,
  })
  return asObj<StudentTransportStatus>(
    await request<Record<string, unknown>>(`/students/${studentId}/transport`, { method: 'PUT', body }),
  )
}

export async function listTransportStudents(filter: TransportStudentsFilter = {}): Promise<TransportMappedStudent[]> {
  const query: Record<string, string> = {}
  if (filter.routeId) query.route_id = filter.routeId
  if (filter.stopId) query.stop_id = filter.stopId
  if (filter.busId) query.bus_id = filter.busId
  if (filter.grade) query.grade = filter.grade
  if (filter.feeHeadId) query.fee_head_id = filter.feeHeadId
  if (filter.status) query.status = filter.status
  const qs = new URLSearchParams(query).toString()
  return asList<TransportMappedStudent>(
    await request<Record<string, unknown>[]>(`/transport/students${qs ? `?${qs}` : ''}`),
  )
}
```

In `src/api/operations.ts`, find the existing re-export block at line 37 (`export { ... } from './transport'`) — read it first, then add `getStudentTransport, setStudentTransport, listTransportStudents,` to the named export list, and add a `export type { StudentTransportStatus, SetStudentTransportInput, TransportMappedStudent, TransportStudentsFilter } from './transport'` line alongside wherever the file's other `export type { ... } from './transport'` line is (check if one already exists before adding a duplicate).

In `src/api/queryKeys.ts`, add to the `operations` object (after `transportRouteStops`, line 133):

```typescript
    studentTransport: (studentId: string) => ['operations', 'transport', 'studentTransport', studentId] as const,
    transportStudentsList: (filters: import('./transport').TransportStudentsFilter = {}) =>
      ['operations', 'transport', 'studentsList', filters] as const,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/transport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/transport.ts src/api/operations.ts src/api/queryKeys.ts src/api/transport.test.ts
git commit -m "feat(transport): add student transport mapping API functions"
```

---

### Task 9: `useOperations.ts` — hooks for the new API

**Files:**
- Modify: `src/api/hooks/useOperations.ts`

**Interfaces:**
- Consumes: Task 8's `getStudentTransport`, `setStudentTransport`, `listTransportStudents`.
- Produces: `useStudentTransport(studentId: string | null): UseQueryResult<StudentTransportStatus>`; `useSetStudentTransport(): UseMutationResult<StudentTransportStatus, Error, { studentId: string; input: SetStudentTransportInput }>`; `useTransportStudentsList(filter?: TransportStudentsFilter): UseQueryResult<TransportMappedStudent[]>` — consumed by Task 10 (Student Add) and Task 11 (list screen).

- [ ] **Step 1: Write the failing test**

Read `src/api/hooks/useOperations.ts`'s existing test file (if one exists — check `src/api/hooks/useOperations.test.tsx` via glob) for the mocking convention used for other hooks in this file, and add tests for the three new hooks following that same pattern: a query success case for `useStudentTransport`, a mutation success case for `useSetStudentTransport` (asserting `setStudentTransport` was called with the right args and the students/studentTransport query was invalidated), and a filtered query case for `useTransportStudentsList`. If no test file exists for this hooks file, skip this step and instead cover the three hooks via Task 10's and Task 11's component-level tests (which exercise them indirectly) — note this explicitly in the commit message.

- [ ] **Step 2: Implement the hooks**

In `src/api/hooks/useOperations.ts`, add the import (alongside the existing `import { ... } from '../transport'` or `'../operations'` line at the top — read the file's import block first to match which module it currently imports transport functions from) and add these hooks after `useRouteStops` (after line 367):

```typescript
export function useStudentTransport(studentId: string | null): UseQueryResult<StudentTransportStatus> {
  const ops = useOperationsTier()
  return useQuery({
    queryKey: queryKeys.operations.studentTransport(studentId ?? ''),
    queryFn: () => getStudentTransport(studentId as string),
    enabled: ops && !!studentId,
  })
}

export function useSetStudentTransport(): UseMutationResult<StudentTransportStatus, Error, { studentId: string; input: SetStudentTransportInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ studentId, input }) => setStudentTransport(studentId, input),
    onSuccess: (_data, { studentId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.studentTransport(studentId) })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportStudentsList() })
    },
  })
}

export function useTransportStudentsList(filter: TransportStudentsFilter = {}): UseQueryResult<TransportMappedStudent[]> {
  const ops = useOperationsTier()
  return useQuery({
    queryKey: queryKeys.operations.transportStudentsList(filter),
    queryFn: () => listTransportStudents(filter),
    enabled: ops,
  })
}
```

(`useOperationsTier` is the existing gating hook already used by `useTransportRoutes`/`useRouteStops` in this file — reuse it, don't reimplement.)

- [ ] **Step 3: Run the frontend test suite for this file**

Run: `npx vitest run src/api/hooks/`
Expected: PASS (no regressions in existing hook tests; new hook tests pass if Step 1 added any)

- [ ] **Step 4: Commit**

```bash
git add src/api/hooks/useOperations.ts
git commit -m "feat(transport): add hooks for student transport mapping and mapped-students list"
```

---

### Task 10: `studentAdd.tsx` — Transport section

**Files:**
- Modify: `src/screens/school/studentAdd.tsx`
- Modify: `src/screens/school/studentAdd.test.tsx`

**Interfaces:**
- Consumes: Task 9's `useStudentTransport`, `useSetStudentTransport`; Task 7's `useFeeHeads`; `useTransportRoutes`, `useRouteStops` (already existing, from `useOperations.ts`).
- Produces: a Transport section in the Add/Edit student form; the save flow calls `setStudentTransport` as a best-effort step after student create/update, matching the existing `persistExtras` best-effort pattern.

- [ ] **Step 1: Write the failing tests**

Read `src/screens/school/studentAdd.test.tsx` in full first (it's long — read past line 70 to see the rest of `fillRequired` and at least one full `it(...)` block) so the new tests match its exact rendering/fetch-stub conventions. Then add these tests, adapting `makeFetch()` to also handle the new endpoints:

```typescript
describe('Transport section', () => {
  function makeFetchWithTransport(opts: { assigned?: boolean } = {}) {
    return vi.fn().mockImplementation((url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (u.includes('/classes')) {
        return Promise.resolve(jsonResponse({
          data: [{ id: 'c1', name: 'VIII-A', grade: 'VIII', section: 'A', room: null, class_teacher_id: null, student_count: 0 }],
          next_cursor: null,
        }))
      }
      if (u.includes('/fees/heads')) {
        return Promise.resolve(jsonResponse({
          data: [{ id: 'fh1', name: 'Transport', code: null, active: true, is_system: false, is_transport_fee_head: true }],
          next_cursor: null,
        }))
      }
      if (u.includes('/transport/routes')) {
        return Promise.resolve(jsonResponse([{ id: 'r1', name: 'Route 5', stops: 3 }]))
      }
      if (u.includes('/transport/routes/r1/stops')) {
        return Promise.resolve(jsonResponse([{ id: 'st1', route_id: 'r1', name: 'Shastri Nagar', sequence: 1 }]))
      }
      if (u.includes('/students/srv/transport') && method === 'PUT') {
        return Promise.resolve(jsonResponse({
          data: opts.assigned === false
            ? { opted_in: true, assigned: false, status: 'pending', bus_id: null, route_id: 'r1', stop_id: 'st1', fee_head_id: 'fh1', pending_reason: { code: 'no_capacity', message: 'No bus currently has available capacity on this route.' } }
            : { opted_in: true, assigned: true, status: 'assigned', bus_id: 'b1', route_id: 'r1', stop_id: 'st1', fee_head_id: 'fh1', pending_reason: null },
        }))
      }
      if (u.includes('/students') && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [STUDENT_ROW], next_cursor: null }))
      }
      return Promise.resolve(jsonResponse({ data: STUDENT_ROW }))
    })
  }

  it('hides Route/Stop until "Uses School Transport" is Yes', async () => {
    vi.stubGlobal('fetch', makeFetchWithTransport())
    renderForm()
    expect(screen.queryByLabelText(/route/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/uses school transport/i))
    await waitFor(() => expect(screen.getByLabelText(/route/i)).toBeInTheDocument())
  })

  it('saves student then calls transport endpoint and shows pending toast when no capacity', async () => {
    vi.stubGlobal('fetch', makeFetchWithTransport({ assigned: false }))
    renderForm()
    fillRequired()
    fireEvent.click(screen.getByLabelText(/uses school transport/i))
    await waitFor(() => expect(screen.getByLabelText(/route/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/route/i), { target: { value: 'r1' } })
    await waitFor(() => expect(screen.getByLabelText(/pickup stop/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/pickup stop/i), { target: { value: 'st1' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(screen.getByText(/bus assignment is pending/i)).toBeInTheDocument())
  })
})
```

(These tests describe the intended DOM shape — `getByLabelText(/uses school transport/i)`, `/route/i`, `/pickup stop/i` — the implementation step below must produce a form whose `Field`/`Select` `label`s and associated `<select>`/`<input>` match these queries; adjust exact label text in both the test and the implementation together if `Field`'s label-to-control association needs an explicit `htmlFor`/`id` pair — check how existing fields in this file (e.g. the Gender select) wire label-to-control before assuming `getByLabelText` resolves automatically.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/screens/school/studentAdd.test.tsx`
Expected: FAIL — no "Uses School Transport" control exists yet.

- [ ] **Step 3: Implement the Transport section**

Add these imports to `src/screens/school/studentAdd.tsx` (alongside the existing imports, after line 27):

```typescript
import { useTransportRoutes, useRouteStops, useStudentTransport, useSetStudentTransport } from '@/api/hooks/useOperations'
import { useFeeHeads } from '@/api/hooks/useFeeHeads'
```

Extend `INITIAL_FORM` (lines 64-71) with three new keys:

```typescript
const INITIAL_FORM: Form = {
  academicYear: ACADEMIC_YEARS[0], adm: '', admissionDate: '', roll: '', status: 'active',
  firstName: '', lastName: '', cls: '', section: '', gender: '', dob: '',
  bloodGroup: '', house: '', religion: '', category: '', phone: '', email: '',
  caste: '', motherTongue: '', languages: '', lastSchool: '', address: '', aadhaar: '',
  fatherName: '', fatherEmail: '', fatherPhone: '', fatherOccupation: '', fatherAadhaar: '',
  motherName: '', motherEmail: '', motherPhone: '', motherOccupation: '',
  transportOptedIn: '', transportRouteId: '', transportStopId: '', transportFeeHeadId: '',
}
```

Inside the main form component (find the component that renders `INITIAL_FORM`/`existing` and holds `f`/`setF` state — same component containing the `save` function at line 383), add after the existing `existingQ`/data-loading hooks:

```typescript
  const transportQ = useStudentTransport(mode === 'edit' && existing ? existing.id : null)
  const feeHeadsQ = useFeeHeads()
  const routesQ = useTransportRoutes()
  const stopsQ = useRouteStops(f.transportRouteId || null)
  const setTransport = useSetStudentTransport()

  useEffect(() => {
    if (!transportQ.data) return
    setF((prev) => ({
      ...prev,
      transportOptedIn: transportQ.data.optedIn ? 'yes' : 'no',
      transportRouteId: transportQ.data.routeId ?? '',
      transportStopId: transportQ.data.stopId ?? '',
      transportFeeHeadId: transportQ.data.feeHeadId ?? '',
    }))
  }, [transportQ.data])

  const transportFeeHeadOptions = useMemo(() => {
    const heads = (feeHeadsQ.data ?? []).filter((h) => h.isTransportFeeHead)
    return [
      { value: '', label: heads.length ? 'Select fee head…' : 'No transport fee head configured' },
      ...heads.map((h) => ({ value: h.id, label: h.name })),
    ]
  }, [feeHeadsQ.data])

  const transportRouteOptions = useMemo(() => [
    { value: '', label: 'Select route…' },
    ...(routesQ.data ?? []).map((r) => ({ value: r.id, label: r.name })),
  ], [routesQ.data])

  const transportStopOptions = useMemo(() => [
    { value: '', label: 'Select stop…' },
    ...(stopsQ.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ], [stopsQ.data])
```

(`setF` is whatever the existing form's state setter is named — read the component's `useState`/`useFormKit` call above line 340 to confirm the exact name before writing this; the surrounding code in this file uses a plain `useState<Form>` pattern based on `INITIAL_FORM`'s shape, so match its actual setter identifier exactly.)

Add the JSX section — insert it as its own `<Card>` between the existing "Documents" section and the final save button (find that boundary by reading the component's JSX return block; it isn't shown in the excerpt read so far — locate the last `<Card>`/`<CardHead>` block before the save `<Btn>` and insert immediately before it):

```tsx
        <Card>
          <CardHead title="Transport" />
          <div className="col gap12">
            <Field label="Uses School Transport">
              <label className="row ai-center gap8">
                <input
                  type="checkbox"
                  checked={f.transportOptedIn === 'yes'}
                  onChange={(e) => setF((prev) => ({ ...prev, transportOptedIn: e.target.checked ? 'yes' : 'no' }))}
                />
                {f.transportOptedIn === 'yes' ? 'Yes' : 'No'}
              </label>
            </Field>
            {f.transportOptedIn === 'yes' && (
              <>
                <Field label="Transport Fee Head">
                  <Select
                    options={transportFeeHeadOptions}
                    value={f.transportFeeHeadId}
                    onChange={(e) => setF((prev) => ({ ...prev, transportFeeHeadId: e.target.value }))}
                  />
                </Field>
                <Field label="Route">
                  <Select
                    options={transportRouteOptions}
                    value={f.transportRouteId}
                    onChange={(e) => setF((prev) => ({ ...prev, transportRouteId: e.target.value, transportStopId: '' }))}
                  />
                </Field>
                <Field label="Pickup Stop">
                  <Select
                    options={transportStopOptions}
                    value={f.transportStopId}
                    onChange={(e) => setF((prev) => ({ ...prev, transportStopId: e.target.value }))}
                    disabled={!f.transportRouteId}
                  />
                </Field>
              </>
            )}
          </div>
        </Card>
```

(Add `Select` to the `@/components/ui` import at line 17 if not already imported there.)

Modify `afterOk` inside `save` (lines 394-412) to add the transport call after `persistExtras` succeeds:

```typescript
    const afterOk = async (saved: Student) => {
      try {
        await persistExtras(saved.id, { ...student, id: saved.id }, files)
      } catch (err) {
        toast.danger(
          'Student saved, extras failed',
          err instanceof Error ? err.message : 'Enrolment details could not be saved to the server.',
        )
        app.go('school.student', { focus: saved.id })
        return
      }

      try {
        const optedIn = f.transportOptedIn === 'yes'
        const result = await setTransport.mutateAsync({
          studentId: saved.id,
          input: {
            optedIn,
            routeId: optedIn ? f.transportRouteId || null : null,
            stopId: optedIn ? f.transportStopId || null : null,
            feeHeadId: optedIn ? f.transportFeeHeadId || null : null,
          },
        })
        if (optedIn && !result.assigned) {
          toast.info(
            'Student added. Bus assignment is pending.',
            result.pendingReason?.message ?? 'No bus currently has available capacity on this route.',
          )
        }
      } catch (err) {
        toast.danger(
          'Student saved, transport failed',
          err instanceof Error ? err.message : 'Transport mapping could not be saved to the server.',
        )
        app.go('school.student', { focus: saved.id })
        return
      }

      toast.success(
        mode === 'edit' ? 'Student updated' : 'Student added',
        saved.roll > 0
          ? `${saved.name} · ${saved.cls} · Roll ${saved.roll}`
          : `${saved.name} · ${saved.cls}.`,
      )
      app.go('school.student', { focus: saved.id })
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/screens/school/studentAdd.test.tsx`
Expected: PASS. If a `getByLabelText` query fails to resolve because `Field`'s `<label>` isn't programmatically associated with its control, fix the association (add matching `id`/`htmlFor`, or switch that query to `getByRole('combobox', { name: /route/i })` in the test) rather than restructuring the whole section — check exactly how an existing passing test in this file already queries one of the pre-existing `Select` fields (e.g. Gender) and mirror that exact query style.

- [ ] **Step 5: Run the full existing studentAdd test suite to confirm no regression**

Run: `npx vitest run src/screens/school/studentAdd.test.tsx`
Expected: All PASS (existing tests must still pass — the new section must not break required-field validation or the existing save flow when "Uses School Transport" stays "No")

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/studentAdd.tsx src/screens/school/studentAdd.test.tsx
git commit -m "feat(students): add Transport section to Student Add/Edit with best-effort bus assignment"
```

---

### Task 11: Transport Students list screen

**Files:**
- Create: `src/screens/school/transportStudents.tsx`
- Create: `src/screens/school/transportStudents.test.tsx`
- Modify: `src/router.tsx` (register `school.transport.students`)
- Modify: `src/components/shell/Sidebar.tsx` or the Transport dashboard's sub-nav (read `src/screens/school/transport.tsx`'s existing tab/link structure to `school.transport.routes`/`school.transport.buses` first, and add a matching link to the new screen there rather than a top-level Sidebar entry, since Routes/Buses aren't top-level Sidebar items either)

**Interfaces:**
- Consumes: Task 9's `useTransportStudentsList`, Task 8's `TransportMappedStudent`.
- Produces: a new routed screen at view key `school.transport.students`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/school/transportStudents.test.tsx`, modeled closely on `src/screens/school/studentAdd.test.tsx`'s render/fetch-stub setup (read that file's `renderForm`/`AppProvider`/`ToastProvider` wiring and reuse the same shape):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { TransportStudentsScreen } from './transportStudents'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const MAPPED = {
  student_id: 's1', student_name: 'Rahul Sharma', admission_no: 'A1', grade: '5', section: 'A',
  fee_head_id: 'fh1', fee_head_name: 'Transport', route_id: 'r1', route_name: 'Route 5',
  stop_id: 'st1', stop_name: 'Shastri Nagar', bus_id: 'b1', bus_no: 'Bus 01', driver: 'Ramesh',
  conductor_name: 'Suresh', capacity: 40, bus_occupied: 40, mapping_status: 'mapped',
}
const PENDING = {
  ...MAPPED, student_id: 's2', student_name: 'Priya Singh', bus_id: null, bus_no: null,
  driver: null, conductor_name: null, bus_occupied: 0, mapping_status: 'pending',
}

function renderScreen(rows: unknown[] = [MAPPED, PENDING]) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown) => {
    if (String(url).includes('/transport/students')) return Promise.resolve(jsonResponse({ data: rows, next_cursor: null }))
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <TransportStudentsScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

describe('Transport Students list', () => {
  it('shows mapped and pending students with their status', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getByText('Rahul Sharma')).toBeInTheDocument())
    expect(screen.getByText('Priya Singh')).toBeInTheDocument()
    expect(screen.getByText(/pending bus assignment/i)).toBeInTheDocument()
  })

  it('offers Retry auto-assignment and Select bus manually for a pending row', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getByText('Priya Singh')).toBeInTheDocument())
    const row = screen.getByText('Priya Singh').closest('tr')!
    expect(within(row).getByRole('button', { name: /retry auto-assignment/i })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /select bus manually/i })).toBeInTheDocument()
  })
})
```

Add `import { within } from '@testing-library/react'` to the top import line.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/school/transportStudents.test.tsx`
Expected: FAIL — the module `./transportStudents` doesn't exist.

- [ ] **Step 3: Implement the screen**

Create `src/screens/school/transportStudents.tsx`. Before writing it, read `src/screens/school/transport.tsx` lines 1-60 (already read earlier in this plan's research — reuse those exact imports) for the `PageHead`/`Card`/`Badge`/`Select`/`Field` usage pattern, and read `src/screens/school/operations.tsx`'s `BusRidersModal` for the existing "assign a specific bus" UI to reuse for "Select bus manually" (it already renders a bus dropdown + `useAssignStudentToBus`):

```tsx
/* ============================================================
   Transport Students — mapping status across all opted-in students
   ============================================================ */
import { useMemo, useState } from 'react'
import { useToast } from '@/lib/hooks'
import {
  PageHead, Card, Badge, Field, Select, Btn, Empty, Spinner,
} from '@/components/ui'
import {
  useTransportStudentsList, useTransportRoutes, useRouteStops, useTransportBuses,
  useSetStudentTransport, useAssignStudentToBus,
} from '@/api/hooks/useOperations'
import { useFeeHeads } from '@/api/hooks/useFeeHeads'
import type { TransportMappedStudent } from '@/api/transport'

export function TransportStudentsScreen() {
  const toast = useToast()
  const [routeFilter, setRouteFilter] = useState('')
  const [busFilter, setBusFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [feeHeadFilter, setFeeHeadFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'mapped' | 'pending'>('')
  const [manualAssignFor, setManualAssignFor] = useState<string | null>(null)
  const [manualBusId, setManualBusId] = useState('')

  const routesQ = useTransportRoutes()
  const busesQ = useTransportBuses()
  const feeHeadsQ = useFeeHeads()
  const listQ = useTransportStudentsList({
    routeId: routeFilter || undefined,
    busId: busFilter || undefined,
    grade: gradeFilter || undefined,
    feeHeadId: feeHeadFilter || undefined,
    status: statusFilter || undefined,
  })
  const setTransport = useSetStudentTransport()
  const assignToBus = useAssignStudentToBus()

  const rows = listQ.data ?? []

  const routeOptions = useMemo(() => [
    { value: '', label: 'All routes' },
    ...(routesQ.data ?? []).map((r) => ({ value: r.id, label: r.name })),
  ], [routesQ.data])
  const busOptions = useMemo(() => [
    { value: '', label: 'All buses' },
    ...(busesQ.data ?? []).map((b) => ({ value: b.busId, label: b.busNo })),
  ], [busesQ.data])
  const feeHeadOptions = useMemo(() => [
    { value: '', label: 'All fee heads' },
    ...(feeHeadsQ.data ?? []).filter((h) => h.isTransportFeeHead).map((h) => ({ value: h.id, label: h.name })),
  ], [feeHeadsQ.data])

  const retryAssignment = (row: TransportMappedStudent) => {
    setTransport.mutate(
      { studentId: row.studentId, input: { optedIn: true, routeId: row.routeId, stopId: row.stopId, feeHeadId: row.feeHeadId } },
      {
        onSuccess: (result) => {
          if (result.assigned) toast.success('Bus assigned', `${row.studentName} is now mapped to a bus.`)
          else toast.info('Still pending', result.pendingReason?.message ?? 'No bus currently has available capacity on this route.')
        },
        onError: (err) => toast.danger('Could not retry assignment', err instanceof Error ? err.message : 'Please try again.'),
      },
    )
  }

  const confirmManualAssign = (row: TransportMappedStudent) => {
    if (!manualBusId) return
    assignToBus.mutate(
      { busId: manualBusId, studentId: row.studentId, stopId: row.stopId ?? undefined },
      {
        onSuccess: () => { toast.success('Bus assigned', `${row.studentName} assigned manually.`); setManualAssignFor(null); setManualBusId('') },
        onError: (err) => toast.danger('Could not assign', err instanceof Error ? err.message : 'Please try again.'),
      },
    )
  }

  return (
    <div>
      <PageHead title="Transport Students" sub="Route/stop/fee-head mapping and bus assignment status" />
      <Card>
        <div className="row gap12 wrap">
          <Field label="Route"><Select options={routeOptions} value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} /></Field>
          <Field label="Bus"><Select options={busOptions} value={busFilter} onChange={(e) => setBusFilter(e.target.value)} /></Field>
          <Field label="Fee head"><Select options={feeHeadOptions} value={feeHeadFilter} onChange={(e) => setFeeHeadFilter(e.target.value)} /></Field>
          <Field label="Status">
            <Select
              options={[{ value: '', label: 'All' }, { value: 'mapped', label: 'Mapped' }, { value: 'pending', label: 'Pending Bus Assignment' }]}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'mapped' | 'pending')}
            />
          </Field>
        </div>
      </Card>
      <Card>
        {listQ.isLoading ? <Spinner size={24} /> : rows.length === 0 ? <Empty title="No transport students match these filters" /> : (
          <table className="sm-table">
            <thead>
              <tr>
                <th>Student</th><th>Class</th><th>Fee head</th><th>Route</th><th>Stop</th>
                <th>Bus</th><th>Driver</th><th>Conductor</th><th>Capacity</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.studentId}>
                  <td>{row.studentName} · {row.admissionNo}</td>
                  <td>{row.grade ?? ''}{row.section ? `-${row.section}` : ''}</td>
                  <td>{row.feeHeadName ?? '—'}</td>
                  <td>{row.routeName ?? '—'}</td>
                  <td>{row.stopName ?? '—'}</td>
                  <td>{row.busNo ?? '—'}</td>
                  <td>{row.driver ?? '—'}</td>
                  <td>{row.conductorName ?? '—'}</td>
                  <td>{row.capacity != null ? `${row.busOccupied}/${row.capacity}` : row.busOccupied}</td>
                  <td><Badge tone={row.mappingStatus === 'mapped' ? 'success' : 'warning'}>{row.mappingStatus === 'mapped' ? 'Mapped' : 'Pending Bus Assignment'}</Badge></td>
                  <td>
                    {row.mappingStatus === 'pending' && (
                      <div className="row gap8">
                        <Btn size="sm" onClick={() => retryAssignment(row)}>Retry auto-assignment</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setManualAssignFor(row.studentId)}>Select bus manually</Btn>
                        {manualAssignFor === row.studentId && (
                          <>
                            <Select
                              options={[{ value: '', label: 'Pick a bus…' }, ...(busesQ.data ?? []).map((b) => ({ value: b.busId, label: b.busNo }))]}
                              value={manualBusId}
                              onChange={(e) => setManualBusId(e.target.value)}
                            />
                            <Btn size="sm" onClick={() => confirmManualAssign(row)}>Confirm</Btn>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
```

(Check `Badge`'s actual `tone` prop values before using `'success'`/`'warning'` — grep the `Badge` component's props in `src/components/ui` and adjust to whatever tone names it actually supports; likewise confirm `Btn`'s `size`/`variant` props against its real definition rather than assuming these exact prop names.)

- [ ] **Step 4: Register the route**

In `src/router.tsx`, add an entry alongside `school.transport.routes`/`school.transport.buses` (near line 55-56):

```typescript
  'school.transport.students': { title: 'Transport students', sub: 'Mapping status & bus assignment', phase: 3 },
```

Find wherever `school.transport.routes`/`school.transport.buses` map to their screen components (search this file for how those two keys resolve to `TransportDashboardBody` or similar exported screens in `transport.tsx`) and add `'school.transport.students': TransportStudentsScreen` to that same mapping, importing `TransportStudentsScreen` from `./screens/school/transportStudents`.

In `src/screens/school/transport.tsx`, find the sub-nav/tab UI that links to `school.transport.routes` and `school.transport.buses` (likely near the top of `TransportDashboardBody` or in a shared tab-bar component) and add a matching tab/link to `school.transport.students`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/screens/school/transportStudents.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full frontend test suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/screens/school/transportStudents.tsx src/screens/school/transportStudents.test.tsx src/router.tsx src/screens/school/transport.tsx
git commit -m "feat(transport): add Transport Students list screen with filters and pending-assignment actions"
```

---

### Task 12: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start both backends/frontends locally**

Run backend: `dotnet run --project src/Sms.Api` (from `sms-backend`)
Run frontend: `npm run dev` (from `sms-admin`)

- [ ] **Step 2: Verify the golden path in a browser**

Mark a fee head as the transport fee head (Fee settings), create a route with a bus that has free capacity, add a new student with "Uses School Transport" = Yes, selecting that fee head/route/stop. Confirm the student saves, no error toast appears, and the student now appears in the new Transport Students list as "Mapped" with the correct bus.

- [ ] **Step 3: Verify the no-capacity edge case**

Fill a route's only bus to capacity (via the existing per-bus roster modal), then add another student opted into that same route. Confirm the student still saves successfully, a "pending" info toast appears, and the student shows as "Pending Bus Assignment" in the new list with working "Retry auto-assignment" and "Select bus manually" actions.

- [ ] **Step 4: Verify no regression in existing flows**

Add a student with "Uses School Transport" = No — confirm save behaves exactly as before this feature existed. Open the existing per-bus roster modal (Transport → Buses → Manage riders) and confirm adding/removing a rider still works unchanged.

- [ ] **Step 5: Report findings**

If any step in this task surfaces a bug, fix it in the relevant task above and re-run that task's tests before re-verifying here — do not patch around it inline in this task.

---

## Self-Review Notes (for the implementer)

- Task 4/5 are split because the service can't be exercised over HTTP until the controller endpoint exists — commit them together (Task 5, Step 4) rather than leaving Task 4 as a dangling uncommitted change.
- Several steps above explicitly say "read the existing file first" instead of guessing at exact prop names (`Badge` tone, `Btn` size/variant, the form's state-setter name, `Field`'s label association). This is deliberate — those UI primitives weren't fully read during planning, and guessing their exact API would risk a plan step that doesn't compile. Resolve them against the real source at implementation time, not by assumption.
- If `src/api/transport.test.ts`, `src/api/hooks/useOperations.test.tsx`, or a Fee settings screen file turn out not to exist where a task assumes they might, follow that task's fallback instruction (create the file fresh, or skip per the noted fallback) rather than blocking.
