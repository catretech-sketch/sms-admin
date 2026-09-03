# Bus Capacity Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buses can optionally have a seat capacity; assigning a student to a bus already at capacity is rejected with a clear error instead of silently allowed.

**Architecture:** Add a nullable `Capacity` column to `dbo.Buses`. Thread it through the existing `Bus_Create`/`Bus_Update` stored procs, `BusRepository`, `BusService`, and `TransportController` (all already carry `Driver`/`Conductor` fields the same way — `Capacity` follows the identical shape). Enforce the limit in `StudentBusService.AssignAsync`, in C#, before the assignment write — this service already does all its other validation (`not_found`, `forbidden`) this way, returning `ApiResult.Fail`.

**Tech Stack:** .NET (FluentMigrator, Dapper, ASP.NET Core) in `sms-backend`; React + TypeScript + TanStack Query + Vitest in `sms-admin`.

**Spec:** `docs/superpowers/specs/2026-09-03-bus-capacity-enforcement-design.md`

## Global Constraints

- `Capacity` is nullable everywhere. `NULL` = unlimited (default/back-compat behavior for every existing bus — no backfill).
- A student already assigned to a bus can always be re-saved (e.g. stop change) on that same bus, even if the bus is at or over capacity.
- No SQL-side `THROW`/error handling — the capacity check lives in `StudentBusService`, matching every other validation in that file.
- Follow existing code style exactly: this repo already has an identical `Driver`/`Conductor` (nullable FK + explicit `Clear*` flag) pattern to mirror for `Capacity`.

---

### Task 1: Database migration — `Buses.Capacity` + stored procs

**Files:**
- Create: `sms-backend/db/Sms.Migrations/M0173_Buses_Capacity.cs`

**Interfaces:**
- Produces: `dbo.Buses.Capacity` (`int NULL`); `dbo.Bus_Create` gains `@Capacity int = NULL` and returns `Capacity` as its last result column; `dbo.Bus_Update` gains `@Capacity int = NULL, @ClearCapacity bit = 0` and returns `Capacity` as its last result column.

There is no separate "write a failing test" step for a migration in this codebase (migrations are exercised indirectly by the integration tests in Task 2) — this task is verified by applying the migration and confirming the existing test suite still passes (regression check), then Task 2 adds the new behavior's tests.

- [ ] **Step 1: Write the migration**

Create `sms-backend/db/Sms.Migrations/M0173_Buses_Capacity.cs`:

```csharp
using FluentMigrator;

namespace Sms.Migrations;

[Migration(173, "Transport: Buses.Capacity for occupancy enforcement")]
public sealed class M0173_Buses_Capacity : Migration
{
    public override void Up()
    {
        Execute.Sql(@"
IF COL_LENGTH('dbo.Buses', 'Capacity') IS NULL
    ALTER TABLE dbo.Buses ADD Capacity int NULL;");

        Execute.Sql(@"
CREATE OR ALTER PROCEDURE dbo.Bus_Create
    @TenantId uniqueidentifier, @BusNo nvarchar(40),
    @RouteName nvarchar(80) = NULL, @RouteId uniqueidentifier = NULL,
    @Driver nvarchar(120) = NULL, @DriverPhone nvarchar(32) = NULL,
    @DriverStaffId uniqueidentifier = NULL,
    @ConductorStaffId uniqueidentifier = NULL,
    @Capacity int = NULL,
    @AssignedByUserId uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id uniqueidentifier = NEWID(), @ResolvedRouteId uniqueidentifier = @RouteId;

    IF @ResolvedRouteId IS NULL AND @RouteName IS NOT NULL AND LTRIM(RTRIM(@RouteName)) <> ''
        SELECT TOP 1 @ResolvedRouteId = Id FROM dbo.TransportRoutes
        WHERE TenantId = @TenantId AND Name = @RouteName ORDER BY CreatedAt;

    IF @DriverStaffId IS NOT NULL
    BEGIN
        UPDATE dbo.BusDriverAssignments SET UnassignedAt = SYSUTCDATETIME()
        WHERE TenantId = @TenantId AND Role = 'driver' AND UnassignedAt IS NULL
            AND BusId IN (SELECT Id FROM dbo.Buses WHERE TenantId = @TenantId AND DriverStaffId = @DriverStaffId);
        UPDATE dbo.Buses SET DriverStaffId = NULL
        WHERE TenantId = @TenantId AND DriverStaffId = @DriverStaffId;

        SELECT @Driver = s.Name, @DriverPhone = s.Phone
        FROM dbo.Staff s WHERE s.Id = @DriverStaffId AND s.TenantId = @TenantId;
    END

    IF @ConductorStaffId IS NOT NULL
    BEGIN
        UPDATE dbo.BusDriverAssignments SET UnassignedAt = SYSUTCDATETIME()
        WHERE TenantId = @TenantId AND Role = 'conductor' AND UnassignedAt IS NULL
            AND BusId IN (SELECT Id FROM dbo.Buses WHERE TenantId = @TenantId AND ConductorStaffId = @ConductorStaffId);
        UPDATE dbo.Buses SET ConductorStaffId = NULL
        WHERE TenantId = @TenantId AND ConductorStaffId = @ConductorStaffId;
    END

    INSERT dbo.Buses (Id, TenantId, BusNo, RouteName, RouteId, Driver, DriverPhone, DriverStaffId, ConductorStaffId, Capacity)
    VALUES (@Id, @TenantId, @BusNo, @RouteName, @ResolvedRouteId, @Driver, @DriverPhone, @DriverStaffId, @ConductorStaffId, @Capacity);

    IF @DriverStaffId IS NOT NULL
        INSERT dbo.BusDriverAssignments (Id, TenantId, BusId, StaffId, Role, AssignedAt, AssignedByUserId)
        VALUES (NEWID(), @TenantId, @Id, @DriverStaffId, 'driver', SYSUTCDATETIME(), @AssignedByUserId);
    IF @ConductorStaffId IS NOT NULL
        INSERT dbo.BusDriverAssignments (Id, TenantId, BusId, StaffId, Role, AssignedAt, AssignedByUserId)
        VALUES (NEWID(), @TenantId, @Id, @ConductorStaffId, 'conductor', SYSUTCDATETIME(), @AssignedByUserId);

    SELECT b.Id AS BusId, b.BusNo, b.RouteId, b.RouteName, b.Driver, b.DriverPhone,
        ISNULL((SELECT COUNT(*) FROM dbo.RouteStops s WHERE s.RouteId = b.RouteId),
               (SELECT COUNT(*) FROM dbo.BusStops bs WHERE bs.BusId = b.Id)) AS StopCount,
        0 AS StudentsRiding, 'idle' AS Status, b.ConductorStaffId, b.Capacity
    FROM dbo.Buses b WHERE b.Id = @Id;
END");

        Execute.Sql(@"
CREATE OR ALTER PROCEDURE dbo.Bus_Update
    @TenantId uniqueidentifier,
    @BusId uniqueidentifier,
    @BusNo nvarchar(40) = NULL,
    @RouteId uniqueidentifier = NULL,
    @DriverStaffId uniqueidentifier = NULL,
    @ClearDriver bit = 0,
    @ConductorStaffId uniqueidentifier = NULL,
    @ClearConductor bit = 0,
    @Capacity int = NULL,
    @ClearCapacity bit = 0,
    @AssignedByUserId uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Buses WHERE Id = @BusId AND TenantId = @TenantId)
        RETURN;

    DECLARE @OldDriverStaffId uniqueidentifier, @OldConductorStaffId uniqueidentifier;
    SELECT @OldDriverStaffId = DriverStaffId, @OldConductorStaffId = ConductorStaffId
    FROM dbo.Buses WHERE Id = @BusId;

    IF @ClearDriver = 1 SET @DriverStaffId = NULL;
    IF @ClearConductor = 1 SET @ConductorStaffId = NULL;

    IF @DriverStaffId IS NOT NULL
    BEGIN
        DECLARE @StolenFromBusId uniqueidentifier =
            (SELECT TOP 1 Id FROM dbo.Buses WHERE TenantId = @TenantId AND DriverStaffId = @DriverStaffId AND Id <> @BusId);
        IF @StolenFromBusId IS NOT NULL
        BEGIN
            UPDATE dbo.BusDriverAssignments SET UnassignedAt = SYSUTCDATETIME()
            WHERE TenantId = @TenantId AND BusId = @StolenFromBusId AND StaffId = @DriverStaffId
                AND Role = 'driver' AND UnassignedAt IS NULL;
            UPDATE dbo.Buses SET DriverStaffId = NULL WHERE Id = @StolenFromBusId;
        END

        UPDATE b SET
            b.DriverStaffId = @DriverStaffId,
            b.Driver = s.Name,
            b.DriverPhone = s.Phone
        FROM dbo.Buses b
        INNER JOIN dbo.Staff s ON s.Id = @DriverStaffId AND s.TenantId = @TenantId
        WHERE b.Id = @BusId;

        IF @OldDriverStaffId IS NULL OR @OldDriverStaffId <> @DriverStaffId
        BEGIN
            IF @OldDriverStaffId IS NOT NULL
                UPDATE dbo.BusDriverAssignments SET UnassignedAt = SYSUTCDATETIME()
                WHERE TenantId = @TenantId AND BusId = @BusId AND StaffId = @OldDriverStaffId
                    AND Role = 'driver' AND UnassignedAt IS NULL;

            INSERT dbo.BusDriverAssignments (Id, TenantId, BusId, StaffId, Role, AssignedAt, AssignedByUserId)
            VALUES (NEWID(), @TenantId, @BusId, @DriverStaffId, 'driver', SYSUTCDATETIME(), @AssignedByUserId);
        END
    END
    ELSE IF @ClearDriver = 1
    BEGIN
        UPDATE dbo.Buses SET DriverStaffId = NULL, Driver = NULL, DriverPhone = NULL WHERE Id = @BusId;
        IF @OldDriverStaffId IS NOT NULL
            UPDATE dbo.BusDriverAssignments SET UnassignedAt = SYSUTCDATETIME()
            WHERE TenantId = @TenantId AND BusId = @BusId AND StaffId = @OldDriverStaffId
                AND Role = 'driver' AND UnassignedAt IS NULL;
    END

    IF @ConductorStaffId IS NOT NULL
    BEGIN
        DECLARE @StolenConductorFromBusId uniqueidentifier =
            (SELECT TOP 1 Id FROM dbo.Buses WHERE TenantId = @TenantId AND ConductorStaffId = @ConductorStaffId AND Id <> @BusId);
        IF @StolenConductorFromBusId IS NOT NULL
        BEGIN
            UPDATE dbo.BusDriverAssignments SET UnassignedAt = SYSUTCDATETIME()
            WHERE TenantId = @TenantId AND BusId = @StolenConductorFromBusId AND StaffId = @ConductorStaffId
                AND Role = 'conductor' AND UnassignedAt IS NULL;
            UPDATE dbo.Buses SET ConductorStaffId = NULL WHERE Id = @StolenConductorFromBusId;
        END

        UPDATE dbo.Buses SET ConductorStaffId = @ConductorStaffId WHERE Id = @BusId AND TenantId = @TenantId;

        IF @OldConductorStaffId IS NULL OR @OldConductorStaffId <> @ConductorStaffId
        BEGIN
            IF @OldConductorStaffId IS NOT NULL
                UPDATE dbo.BusDriverAssignments SET UnassignedAt = SYSUTCDATETIME()
                WHERE TenantId = @TenantId AND BusId = @BusId AND StaffId = @OldConductorStaffId
                    AND Role = 'conductor' AND UnassignedAt IS NULL;

            INSERT dbo.BusDriverAssignments (Id, TenantId, BusId, StaffId, Role, AssignedAt, AssignedByUserId)
            VALUES (NEWID(), @TenantId, @BusId, @ConductorStaffId, 'conductor', SYSUTCDATETIME(), @AssignedByUserId);
        END
    END
    ELSE IF @ClearConductor = 1
    BEGIN
        UPDATE dbo.Buses SET ConductorStaffId = NULL WHERE Id = @BusId;
        IF @OldConductorStaffId IS NOT NULL
            UPDATE dbo.BusDriverAssignments SET UnassignedAt = SYSUTCDATETIME()
            WHERE TenantId = @TenantId AND BusId = @BusId AND StaffId = @OldConductorStaffId
                AND Role = 'conductor' AND UnassignedAt IS NULL;
    END

    UPDATE b SET
        b.BusNo = COALESCE(@BusNo, b.BusNo),
        b.RouteId = CASE WHEN @RouteId IS NOT NULL THEN @RouteId ELSE b.RouteId END,
        b.RouteName = CASE WHEN @RouteId IS NOT NULL THEN r.Name ELSE b.RouteName END,
        b.Capacity = CASE WHEN @ClearCapacity = 1 THEN NULL WHEN @Capacity IS NOT NULL THEN @Capacity ELSE b.Capacity END
    FROM dbo.Buses b
    LEFT JOIN dbo.TransportRoutes r ON r.Id = @RouteId AND r.TenantId = @TenantId
    WHERE b.Id = @BusId AND b.TenantId = @TenantId;

    -- Column order here must match UpdatedBusRow's constructor parameter order exactly (see M0169):
    -- Dapper's fast-path record materializer requires an exact positional match when the column
    -- count equals the constructor's parameter count. Capacity is appended last to match the
    -- newly-added trailing constructor parameter (Task 2).
    SELECT b.Id AS BusId, b.BusNo, b.RouteId, b.RouteName, b.DriverStaffId, b.Driver, b.DriverPhone,
        CASE WHEN b.RouteId IS NOT NULL
            THEN (SELECT COUNT(*) FROM dbo.RouteStops rs WHERE rs.RouteId = b.RouteId)
            ELSE (SELECT COUNT(*) FROM dbo.BusStops bs WHERE bs.BusId = b.Id) END AS StopCount,
        (SELECT COUNT(*) FROM dbo.StudentBusAssignments sba WHERE sba.BusId = b.Id) AS StudentsAssigned,
        b.ConductorStaffId, b.Capacity
    FROM dbo.Buses b WHERE b.Id = @BusId;
END");
    }

    public override void Down()
    {
        // Bus_Create / Bus_Update stay at their latest (Capacity-aware) definition on rollback,
        // same as every other "CREATE OR ALTER" proc migration in this codebase (see M0169's Down()) —
        // only the column is reverted.
        Execute.Sql("IF COL_LENGTH('dbo.Buses', 'Capacity') IS NOT NULL ALTER TABLE dbo.Buses DROP COLUMN Capacity;");
    }
}
```

- [ ] **Step 2: Apply the migration and confirm the existing suite still passes**

Run (from `sms-backend/`):
```
dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter FullyQualifiedName~Transport
```
Expected: all existing Transport tests (`BusAssignedTests`, `BusBoardingTests`, `BusConductorAssignmentTests`, `BusEtaTests`, `BusPositionTests`, `BusRosterTests`) still PASS. This confirms the migration and re-declared procs didn't break existing behavior.

- [ ] **Step 3: Commit**

```bash
git add db/Sms.Migrations/M0173_Buses_Capacity.cs
git commit -m "feat(transport): add Buses.Capacity column and thread it through Bus_Create/Bus_Update"
```

---

### Task 2: Backend — thread `Capacity` through repository/service/controller + enforce it on assign

**Files:**
- Modify: `sms-backend/src/Sms.Modules.Transport/BusModule.cs`
- Modify: `sms-backend/src/Sms.Modules.Transport/StudentBusModule.cs`
- Modify: `sms-backend/src/Sms.Application/Services/Transport/BusService.cs`
- Modify: `sms-backend/src/Sms.Application/Services/Transport/FleetSnapshotBuilder.cs`
- Modify: `sms-backend/src/Sms.Application/Services/Transport/StudentBusService.cs`
- Modify: `sms-backend/src/Sms.Api/Controllers/TransportController.cs`
- Create: `sms-backend/tests/Sms.Tests.Integration/Transport/BusCapacityTests.cs`

**Interfaces:**
- Consumes: `dbo.Bus_Create`/`dbo.Bus_Update` `@Capacity`/`@ClearCapacity` params and `Capacity` result column (Task 1).
- Produces: `BusRepository.GetCapacityAndOccupancyAsync(Guid busId, CancellationToken) -> Task<(int? Capacity, int Occupied)>`; `StudentBusRepository.IsStudentOnBusAsync(Guid studentId, Guid busId, CancellationToken) -> Task<bool>`; `int? Capacity` on `CreatedBusRow`, `UpdatedBusRow`, `TransportBusResponse`, `FleetBusResponse`. These are consumed by Task 4/5's frontend types via the JSON response shape (`capacity` snake_case field).

- [ ] **Step 1: Write the failing integration tests**

Create `sms-backend/tests/Sms.Tests.Integration/Transport/BusCapacityTests.cs`:

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

namespace Sms.Tests.Integration.Transport;

[Collection("sql")]
public class BusCapacityTests(SqlServerFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("environment", "Production");
            b.UseSetting("ConnectionStrings:Sql", fx.ConnectionString);
            b.UseSetting("Jwt:SigningKey", Key);
        });

    private static HttpClient PrincipalClient(WebApplicationFactory<Program> app, Guid tenantId, Guid userId)
    {
        var jwt = new JwtTokenService(
            new JwtOptions { Issuer = "sms", Audience = "sms-apps", SigningKey = Key, AccessTokenMinutes = 15 },
            new SystemClock());
        var token = jwt.IssueAccess(userId, tenantId, [Policies.Principal], isPlatform: false);
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

    private static async Task<Guid> SeedBusAsync(string cs, Guid tenantId, int? capacity)
    {
        var busId = Guid.NewGuid();
        await Seed(cs, tenantId, conn => conn.ExecuteAsync(
            "INSERT dbo.Buses (Id, TenantId, BusNo, Capacity) VALUES (@Id, @TenantId, @BusNo, @Capacity)",
            new { Id = busId, TenantId = tenantId, BusNo = "CAP-01", Capacity = capacity }));
        return busId;
    }

    private static async Task<Guid> SeedStudentAsync(string cs, Guid tenantId, string name)
    {
        var studentId = Guid.NewGuid();
        await Seed(cs, tenantId, conn => conn.ExecuteAsync(
            "INSERT dbo.Students (Id, TenantId, Name, AdmissionNo) VALUES (@Id, @TenantId, @Name, @AdmissionNo)",
            new { Id = studentId, TenantId = tenantId, Name = name, AdmissionNo = Guid.NewGuid().ToString("N")[..10] }));
        return studentId;
    }

    [Fact]
    public async Task AssignStudent_succeeds_when_under_capacity()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        var busId = await SeedBusAsync(fx.ConnectionString, tenantId, capacity: 2);
        var studentId = await SeedStudentAsync(fx.ConnectionString, tenantId, "Rahul Sharma");

        var client = PrincipalClient(app, tenantId, Guid.NewGuid());
        var res = await client.PutAsJsonAsync($"/v1/transport/buses/{busId}/students/{studentId}", new { });

        res.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task AssignStudent_fails_with_409_when_at_capacity()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        var busId = await SeedBusAsync(fx.ConnectionString, tenantId, capacity: 1);
        var seated = await SeedStudentAsync(fx.ConnectionString, tenantId, "Amit Kumar");
        var overflow = await SeedStudentAsync(fx.ConnectionString, tenantId, "Priya Singh");

        var client = PrincipalClient(app, tenantId, Guid.NewGuid());
        (await client.PutAsJsonAsync($"/v1/transport/buses/{busId}/students/{seated}", new { }))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        var res = await client.PutAsJsonAsync($"/v1/transport/buses/{busId}/students/{overflow}", new { });

        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("error").GetProperty("code").GetString().Should().Be("capacity_reached");
    }

    [Fact]
    public async Task AssignStudent_succeeds_regardless_of_occupancy_when_capacity_is_null()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        var busId = await SeedBusAsync(fx.ConnectionString, tenantId, capacity: null);
        var s1 = await SeedStudentAsync(fx.ConnectionString, tenantId, "Student One");
        var s2 = await SeedStudentAsync(fx.ConnectionString, tenantId, "Student Two");

        var client = PrincipalClient(app, tenantId, Guid.NewGuid());
        (await client.PutAsJsonAsync($"/v1/transport/buses/{busId}/students/{s1}", new { }))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await client.PutAsJsonAsync($"/v1/transport/buses/{busId}/students/{s2}", new { }))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task AssignStudent_reassigning_seated_student_to_same_bus_never_false_blocks()
    {
        await using var app = App();
        var tenantId = Guid.NewGuid();
        var busId = await SeedBusAsync(fx.ConnectionString, tenantId, capacity: 1);
        var studentId = await SeedStudentAsync(fx.ConnectionString, tenantId, "Seated Student");
        var stopId = Guid.NewGuid();
        await Seed(fx.ConnectionString, tenantId, conn => conn.ExecuteAsync(
            "INSERT dbo.RouteStops (Id, TenantId, RouteId, Name, Seq) VALUES (@Id, @TenantId, @RouteId, @Name, 1)",
            new { Id = stopId, TenantId = tenantId, RouteId = Guid.NewGuid(), Name = "Stop A" }));

        var client = PrincipalClient(app, tenantId, Guid.NewGuid());
        (await client.PutAsJsonAsync($"/v1/transport/buses/{busId}/students/{studentId}", new { }))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Re-save the same student on the same (now-full-by-themselves) bus, changing only their stop.
        var res = await client.PutAsJsonAsync(
            $"/v1/transport/buses/{busId}/students/{studentId}", new { stopId });

        res.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `sms-backend/`):
```
dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter FullyQualifiedName~BusCapacityTests
```
Expected: FAIL — `AssignStudent_fails_with_409_when_at_capacity` gets 204 instead of 409 (no enforcement exists yet); the other three should currently pass already (they exercise no new behavior yet), which is fine — the point of this step is confirming the enforcement test fails before the fix.

- [ ] **Step 3: Add `Capacity` to the DTOs and repository (`BusModule.cs`)**

In `sms-backend/src/Sms.Modules.Transport/BusModule.cs`:

Replace:
```csharp
public sealed record CreatedBusRow(
    Guid BusId, string BusNo, Guid? RouteId, string? RouteName, string? Driver, string? DriverPhone,
    int StopCount, int StudentsRiding, string Status, Guid? ConductorStaffId = null);
public sealed record UpdatedBusRow(
    Guid BusId, string BusNo, Guid? RouteId, string? RouteName, Guid? DriverStaffId,
    string? Driver, string? DriverPhone, int StopCount, int StudentsAssigned, Guid? ConductorStaffId = null);
```
with:
```csharp
public sealed record CreatedBusRow(
    Guid BusId, string BusNo, Guid? RouteId, string? RouteName, string? Driver, string? DriverPhone,
    int StopCount, int StudentsRiding, string Status, Guid? ConductorStaffId = null, int? Capacity = null);
public sealed record UpdatedBusRow(
    Guid BusId, string BusNo, Guid? RouteId, string? RouteName, Guid? DriverStaffId,
    string? Driver, string? DriverPhone, int StopCount, int StudentsAssigned, Guid? ConductorStaffId = null,
    int? Capacity = null);
```

Replace:
```csharp
public sealed record TransportBusResponse(
    Guid BusId, string BusNo, Guid? RouteId, string? RouteName, Guid? DriverStaffId,
    string? Driver, string? DriverPhone,
    int StopCount, int StudentsAssigned, Guid? TeacherUserId, string? TeacherName,
    Guid? ConductorStaffId = null);
```
with:
```csharp
public sealed record TransportBusResponse(
    Guid BusId, string BusNo, Guid? RouteId, string? RouteName, Guid? DriverStaffId,
    string? Driver, string? DriverPhone,
    int StopCount, int StudentsAssigned, Guid? TeacherUserId, string? TeacherName,
    Guid? ConductorStaffId = null, int? Capacity = null);
```

Replace:
```csharp
public sealed record FleetBusResponse(
    Guid BusId, Guid? RouteId, string BusNo, string? RouteName, string? Driver, string? DriverPhone,
    int StopCount, int StudentsRiding, string Status,
    double? Lat, double? Lng, double? SpeedKmh, string? NextStopName, DateTime? LastPingAt,
    Guid? TeacherUserId = null, string? TeacherName = null, Guid? ConductorStaffId = null);
```
with:
```csharp
public sealed record FleetBusResponse(
    Guid BusId, Guid? RouteId, string BusNo, string? RouteName, string? Driver, string? DriverPhone,
    int StopCount, int StudentsRiding, string Status,
    double? Lat, double? Lng, double? SpeedKmh, string? NextStopName, DateTime? LastPingAt,
    Guid? TeacherUserId = null, string? TeacherName = null, Guid? ConductorStaffId = null, int? Capacity = null);
```

Replace:
```csharp
public sealed record FleetBusRow(
    Guid BusId, Guid? RouteId, string BusNo, string? RouteName, string? Driver, string? DriverPhone,
    int StopCount, Guid? TripId, double? Lat, double? Lng, double? SpeedKmh, DateTime? LastPingAt, int StudentsRiding);
```
with:
```csharp
public sealed record FleetBusRow(
    Guid BusId, Guid? RouteId, string BusNo, string? RouteName, string? Driver, string? DriverPhone,
    int StopCount, Guid? TripId, double? Lat, double? Lng, double? SpeedKmh, DateTime? LastPingAt, int StudentsRiding,
    int? Capacity);
```

Inside `BusRepository`, replace:
```csharp
    private sealed record BusListRow(
        Guid BusId, string BusNo, Guid? RouteId, string? RouteName, Guid? DriverStaffId,
        string? Driver, string? DriverPhone,
        int StopCount, int StudentsAssigned, Guid? TeacherUserId, string? TeacherName);
```
with:
```csharp
    private sealed record BusListRow(
        Guid BusId, string BusNo, Guid? RouteId, string? RouteName, Guid? DriverStaffId,
        string? Driver, string? DriverPhone,
        int StopCount, int StudentsAssigned, Guid? TeacherUserId, string? TeacherName, int? Capacity);
```

Replace `CreateBusAsync`:
```csharp
    public async Task<CreatedBusRow?> CreateBusAsync(
        Guid tenantId, string busNo, string? routeName, Guid? routeId, string? driver, string? driverPhone,
        Guid? driverStaffId, Guid? conductorStaffId = null, Guid? assignedByUserId = null,
        CancellationToken ct = default) =>
        await QuerySingleProcAsync<CreatedBusRow>("dbo.Bus_Create",
            new
            {
                TenantId = tenantId, BusNo = busNo, RouteName = routeName, RouteId = routeId,
                Driver = driver, DriverPhone = driverPhone, DriverStaffId = driverStaffId,
                ConductorStaffId = conductorStaffId, AssignedByUserId = assignedByUserId
            }, ct);
```
with:
```csharp
    public async Task<CreatedBusRow?> CreateBusAsync(
        Guid tenantId, string busNo, string? routeName, Guid? routeId, string? driver, string? driverPhone,
        Guid? driverStaffId, Guid? conductorStaffId = null, int? capacity = null, Guid? assignedByUserId = null,
        CancellationToken ct = default) =>
        await QuerySingleProcAsync<CreatedBusRow>("dbo.Bus_Create",
            new
            {
                TenantId = tenantId, BusNo = busNo, RouteName = routeName, RouteId = routeId,
                Driver = driver, DriverPhone = driverPhone, DriverStaffId = driverStaffId,
                ConductorStaffId = conductorStaffId, Capacity = capacity, AssignedByUserId = assignedByUserId
            }, ct);
```

Replace `UpdateBusAsync`:
```csharp
    public async Task<UpdatedBusRow?> UpdateBusAsync(
        Guid tenantId, Guid busId, string? busNo, Guid? routeId, Guid? driverStaffId, bool clearDriver,
        Guid? conductorStaffId = null, bool clearConductor = false, Guid? assignedByUserId = null,
        CancellationToken ct = default) =>
        await QuerySingleProcAsync<UpdatedBusRow>("dbo.Bus_Update",
            new
            {
                TenantId = tenantId, BusId = busId, BusNo = busNo, RouteId = routeId,
                DriverStaffId = driverStaffId, ClearDriver = clearDriver,
                ConductorStaffId = conductorStaffId, ClearConductor = clearConductor,
                AssignedByUserId = assignedByUserId
            }, ct);
```
with:
```csharp
    public async Task<UpdatedBusRow?> UpdateBusAsync(
        Guid tenantId, Guid busId, string? busNo, Guid? routeId, Guid? driverStaffId, bool clearDriver,
        Guid? conductorStaffId = null, bool clearConductor = false, int? capacity = null,
        bool clearCapacity = false, Guid? assignedByUserId = null, CancellationToken ct = default) =>
        await QuerySingleProcAsync<UpdatedBusRow>("dbo.Bus_Update",
            new
            {
                TenantId = tenantId, BusId = busId, BusNo = busNo, RouteId = routeId,
                DriverStaffId = driverStaffId, ClearDriver = clearDriver,
                ConductorStaffId = conductorStaffId, ClearConductor = clearConductor,
                Capacity = capacity, ClearCapacity = clearCapacity,
                AssignedByUserId = assignedByUserId
            }, ct);
```

Add this new method right after `UpdateBusAsync`:
```csharp
    public async Task<(int? Capacity, int Occupied)> GetCapacityAndOccupancyAsync(Guid busId, CancellationToken ct = default)
    {
        var capacity = (await QueryInlineAsync<int?>(
            "SELECT Capacity FROM dbo.Buses WHERE Id = @busId", new { busId }, ct)).FirstOrDefault();
        var occupied = (await QueryInlineAsync<int>(
            "SELECT COUNT(*) FROM dbo.StudentBusAssignments WHERE BusId = @busId", new { busId }, ct)).First();
        return (capacity, occupied);
    }
```

In `ListBusesAsync`, replace:
```csharp
    public async Task<IReadOnlyList<TransportBusResponse>> ListBusesAsync(CancellationToken ct = default)
    {
        var rows = await QueryInlineAsync<BusListRow>(
            $@"SELECT b.Id AS BusId, b.BusNo, b.RouteId, b.RouteName, b.DriverStaffId, b.Driver, b.DriverPhone,
                {StopCountSql} AS StopCount,
                (SELECT COUNT(*) FROM dbo.StudentBusAssignments sba WHERE sba.BusId = b.Id) AS StudentsAssigned,
                a.TeacherUserId, u.Name AS TeacherName
              FROM dbo.Buses b
              LEFT JOIN dbo.BusAssignments a ON a.BusId = b.Id
              LEFT JOIN dbo.Users u ON u.Id = a.TeacherUserId
              ORDER BY b.BusNo", null, ct);
        return rows.Select(r => new TransportBusResponse(
            r.BusId, r.BusNo, r.RouteId, r.RouteName, r.DriverStaffId, r.Driver, r.DriverPhone,
            r.StopCount, r.StudentsAssigned, r.TeacherUserId, r.TeacherName)).ToList();
    }
```
with:
```csharp
    public async Task<IReadOnlyList<TransportBusResponse>> ListBusesAsync(CancellationToken ct = default)
    {
        var rows = await QueryInlineAsync<BusListRow>(
            $@"SELECT b.Id AS BusId, b.BusNo, b.RouteId, b.RouteName, b.DriverStaffId, b.Driver, b.DriverPhone,
                {StopCountSql} AS StopCount,
                (SELECT COUNT(*) FROM dbo.StudentBusAssignments sba WHERE sba.BusId = b.Id) AS StudentsAssigned,
                a.TeacherUserId, u.Name AS TeacherName, b.Capacity
              FROM dbo.Buses b
              LEFT JOIN dbo.BusAssignments a ON a.BusId = b.Id
              LEFT JOIN dbo.Users u ON u.Id = a.TeacherUserId
              ORDER BY b.BusNo", null, ct);
        return rows.Select(r => new TransportBusResponse(
            r.BusId, r.BusNo, r.RouteId, r.RouteName, r.DriverStaffId, r.Driver, r.DriverPhone,
            r.StopCount, r.StudentsAssigned, r.TeacherUserId, r.TeacherName, Capacity: r.Capacity)).ToList();
    }
```

In `GetTeacherAssignmentAsync`, replace the SQL's second line (`a.TeacherUserId, u.Name AS TeacherName`) the same way — add `, b.Capacity` — no other change needed there (the `BusTeacherAssignmentResponse` it builds doesn't carry `Capacity`):
```csharp
    public async Task<BusTeacherAssignmentResponse?> GetTeacherAssignmentAsync(Guid busId, CancellationToken ct = default)
    {
        var row = (await QueryInlineAsync<BusListRow>(
            $@"SELECT b.Id AS BusId, b.BusNo, b.RouteId, b.RouteName, b.DriverStaffId, b.Driver, b.DriverPhone,
                {StopCountSql} AS StopCount,
                (SELECT COUNT(*) FROM dbo.StudentBusAssignments sba WHERE sba.BusId = b.Id) AS StudentsAssigned,
                a.TeacherUserId, u.Name AS TeacherName, b.Capacity
              FROM dbo.Buses b
              LEFT JOIN dbo.BusAssignments a ON a.BusId = b.Id
              LEFT JOIN dbo.Users u ON u.Id = a.TeacherUserId
              WHERE b.Id = @busId", new { busId }, ct)).FirstOrDefault();
        return row is null ? null : new BusTeacherAssignmentResponse(row.BusId, row.BusNo, row.TeacherUserId, row.TeacherName);
    }
```

In `FleetAsync`, replace:
```csharp
    public Task<IReadOnlyList<FleetBusRow>> FleetAsync(CancellationToken ct = default) =>
        QueryInlineAsync<FleetBusRow>(
            $@"SELECT b.Id AS BusId, b.RouteId, b.BusNo, b.RouteName, b.Driver, b.DriverPhone,
                {StopCountSql} AS StopCount,
                t.Id AS TripId, p.Lat, p.Lng, p.SpeedKmh, p.At AS LastPingAt,
                ISNULL(bd.Cnt, 0) AS StudentsRiding
              FROM dbo.Buses b
              OUTER APPLY (
                SELECT TOP 1 tt.Id, tt.StartedAt FROM dbo.Trips tt
                WHERE tt.BusId = b.Id AND tt.Status = 'live' ORDER BY tt.StartedAt DESC) t
              OUTER APPLY (
                SELECT TOP 1 pp.Lat, pp.Lng, pp.SpeedKmh, pp.At FROM dbo.TripPings pp
                WHERE pp.TripId = t.Id ORDER BY pp.At DESC) p
              OUTER APPLY (
                SELECT COUNT(*) AS Cnt FROM dbo.Boardings bo
                WHERE bo.TripId = t.Id AND bo.State = 'boarded') bd
              ORDER BY b.BusNo", null, ct);
```
with:
```csharp
    public Task<IReadOnlyList<FleetBusRow>> FleetAsync(CancellationToken ct = default) =>
        QueryInlineAsync<FleetBusRow>(
            $@"SELECT b.Id AS BusId, b.RouteId, b.BusNo, b.RouteName, b.Driver, b.DriverPhone,
                {StopCountSql} AS StopCount,
                t.Id AS TripId, p.Lat, p.Lng, p.SpeedKmh, p.At AS LastPingAt,
                ISNULL(bd.Cnt, 0) AS StudentsRiding,
                b.Capacity
              FROM dbo.Buses b
              OUTER APPLY (
                SELECT TOP 1 tt.Id, tt.StartedAt FROM dbo.Trips tt
                WHERE tt.BusId = b.Id AND tt.Status = 'live' ORDER BY tt.StartedAt DESC) t
              OUTER APPLY (
                SELECT TOP 1 pp.Lat, pp.Lng, pp.SpeedKmh, pp.At FROM dbo.TripPings pp
                WHERE pp.TripId = t.Id ORDER BY pp.At DESC) p
              OUTER APPLY (
                SELECT COUNT(*) AS Cnt FROM dbo.Boardings bo
                WHERE bo.TripId = t.Id AND bo.State = 'boarded') bd
              ORDER BY b.BusNo", null, ct);
```

- [ ] **Step 4: Add `IsStudentOnBusAsync` (`StudentBusModule.cs`)**

In `sms-backend/src/Sms.Modules.Transport/StudentBusModule.cs`, add this method to `StudentBusRepository`, right after `StudentExistsAsync`:

```csharp
    public async Task<bool> IsStudentOnBusAsync(Guid studentId, Guid busId, CancellationToken ct = default) =>
        (await QueryInlineAsync<int>(
            "SELECT COUNT(1) FROM dbo.StudentBusAssignments WHERE StudentId = @studentId AND BusId = @busId",
            new { studentId, busId }, ct)).First() > 0;
```

- [ ] **Step 5: Enforce capacity in `StudentBusService.AssignAsync`**

In `sms-backend/src/Sms.Application/Services/Transport/StudentBusService.cs`, replace:
```csharp
    public async Task<ApiResult> AssignAsync(Guid busId, Guid studentId, Guid? stopId, CancellationToken ct = default)
    {
        if (!FeatureGate.Allowed(tenant, features, FeatureCatalog.Operations))
            return FeatureGate.Locked(FeatureCatalog.Operations);
        if (tenant.TenantId is not { } tid)
            return ApiResult.Fail(new Error("forbidden", "no tenant context"), 403);
        if (!await repo.BusExistsAsync(busId, ct))
            return ApiResult.Fail(new Error("not_found", "bus not found"), 404);
        if (!await repo.StudentExistsAsync(studentId, ct))
            return ApiResult.Fail(new Error("not_found", "student not found"), 404);
        await repo.AssignAsync(tid, studentId, busId, stopId, ct);
        return ApiResult.NoContent();
    }
```
with:
```csharp
    public async Task<ApiResult> AssignAsync(Guid busId, Guid studentId, Guid? stopId, CancellationToken ct = default)
    {
        if (!FeatureGate.Allowed(tenant, features, FeatureCatalog.Operations))
            return FeatureGate.Locked(FeatureCatalog.Operations);
        if (tenant.TenantId is not { } tid)
            return ApiResult.Fail(new Error("forbidden", "no tenant context"), 403);
        if (!await repo.BusExistsAsync(busId, ct))
            return ApiResult.Fail(new Error("not_found", "bus not found"), 404);
        if (!await repo.StudentExistsAsync(studentId, ct))
            return ApiResult.Fail(new Error("not_found", "student not found"), 404);

        var (capacity, occupied) = await busRepo.GetCapacityAndOccupancyAsync(busId, ct);
        if (capacity is int cap && occupied >= cap && !await repo.IsStudentOnBusAsync(studentId, busId, ct))
            return ApiResult.Fail(new Error("capacity_reached", $"Bus capacity reached ({occupied}/{cap})"), 409);

        await repo.AssignAsync(tid, studentId, busId, stopId, ct);
        return ApiResult.NoContent();
    }
```

(`busRepo` is already a constructor parameter of `StudentBusService` — no DI changes needed.)

- [ ] **Step 6: Thread `capacity` through `BusService` and `ToFleetBus`/`FleetSnapshotBuilder`**

In `sms-backend/src/Sms.Application/Services/Transport/BusService.cs`:

Replace the `IBusService` interface's two lines:
```csharp
    Task<ApiResult<FleetBusResponse>> CreateBusAsync(
        string busNo, string? routeName, Guid? routeId, string? driver, string? driverPhone, Guid? driverStaffId,
        Guid? conductorStaffId = null, CancellationToken ct = default);
    Task<ApiResult<TransportBusResponse>> UpdateBusAsync(
        Guid busId, string? busNo, Guid? routeId, Guid? driverStaffId, bool clearDriver,
        Guid? conductorStaffId = null, bool clearConductor = false, CancellationToken ct = default);
```
with:
```csharp
    Task<ApiResult<FleetBusResponse>> CreateBusAsync(
        string busNo, string? routeName, Guid? routeId, string? driver, string? driverPhone, Guid? driverStaffId,
        Guid? conductorStaffId = null, int? capacity = null, CancellationToken ct = default);
    Task<ApiResult<TransportBusResponse>> UpdateBusAsync(
        Guid busId, string? busNo, Guid? routeId, Guid? driverStaffId, bool clearDriver,
        Guid? conductorStaffId = null, bool clearConductor = false, int? capacity = null,
        bool clearCapacity = false, CancellationToken ct = default);
```

Replace the `CreateBusAsync` implementation's signature and repo call:
```csharp
    public async Task<ApiResult<FleetBusResponse>> CreateBusAsync(
        string busNo, string? routeName, Guid? routeId, string? driver, string? driverPhone, Guid? driverStaffId,
        Guid? conductorStaffId = null, CancellationToken ct = default)
    {
```
with:
```csharp
    public async Task<ApiResult<FleetBusResponse>> CreateBusAsync(
        string busNo, string? routeName, Guid? routeId, string? driver, string? driverPhone, Guid? driverStaffId,
        Guid? conductorStaffId = null, int? capacity = null, CancellationToken ct = default)
    {
```
and replace:
```csharp
        var row = await repo.CreateBusAsync(tid, trimmed, routeName?.Trim(), routeId, driver?.Trim(), driverPhone?.Trim(), driverStaffId, conductorStaffId, tenant.UserId, ct);
```
with:
```csharp
        var row = await repo.CreateBusAsync(tid, trimmed, routeName?.Trim(), routeId, driver?.Trim(), driverPhone?.Trim(), driverStaffId, conductorStaffId, capacity, tenant.UserId, ct);
```

Replace the `UpdateBusAsync` implementation's signature, repo call, and response construction:
```csharp
    public async Task<ApiResult<TransportBusResponse>> UpdateBusAsync(
        Guid busId, string? busNo, Guid? routeId, Guid? driverStaffId, bool clearDriver,
        Guid? conductorStaffId = null, bool clearConductor = false, CancellationToken ct = default)
    {
```
with:
```csharp
    public async Task<ApiResult<TransportBusResponse>> UpdateBusAsync(
        Guid busId, string? busNo, Guid? routeId, Guid? driverStaffId, bool clearDriver,
        Guid? conductorStaffId = null, bool clearConductor = false, int? capacity = null,
        bool clearCapacity = false, CancellationToken ct = default)
    {
```
and replace:
```csharp
        var row = await repo.UpdateBusAsync(tid, busId, trimmed, routeId, driverStaffId, clearDriver, conductorStaffId, clearConductor, tenant.UserId, ct);
        if (row is null)
            return ApiResult<TransportBusResponse>.Fail(new Error("not_found", "bus not found"), 404);
        return ApiResult<TransportBusResponse>.Ok(new TransportBusResponse(
            row.BusId, row.BusNo, row.RouteId, row.RouteName, row.DriverStaffId, row.Driver, row.DriverPhone,
            row.StopCount, row.StudentsAssigned, null, null, row.ConductorStaffId));
    }
```
with:
```csharp
        var row = await repo.UpdateBusAsync(tid, busId, trimmed, routeId, driverStaffId, clearDriver, conductorStaffId, clearConductor, capacity, clearCapacity, tenant.UserId, ct);
        if (row is null)
            return ApiResult<TransportBusResponse>.Fail(new Error("not_found", "bus not found"), 404);
        return ApiResult<TransportBusResponse>.Ok(new TransportBusResponse(
            row.BusId, row.BusNo, row.RouteId, row.RouteName, row.DriverStaffId, row.Driver, row.DriverPhone,
            row.StopCount, row.StudentsAssigned, null, null, row.ConductorStaffId, row.Capacity));
    }
```

Replace `ToFleetBus`:
```csharp
    private static FleetBusResponse ToFleetBus(CreatedBusRow r) =>
        new(r.BusId, r.RouteId, r.BusNo, r.RouteName, r.Driver, r.DriverPhone,
            r.StopCount, r.StudentsRiding, r.Status,
            null, null, null, null, null,
            ConductorStaffId: r.ConductorStaffId);
```
with:
```csharp
    private static FleetBusResponse ToFleetBus(CreatedBusRow r) =>
        new(r.BusId, r.RouteId, r.BusNo, r.RouteName, r.Driver, r.DriverPhone,
            r.StopCount, r.StudentsRiding, r.Status,
            null, null, null, null, null,
            ConductorStaffId: r.ConductorStaffId, Capacity: r.Capacity);
```

In `sms-backend/src/Sms.Application/Services/Transport/FleetSnapshotBuilder.cs`, replace:
```csharp
            list.Add(new FleetBusResponse(
                r.BusId, r.RouteId, r.BusNo, r.RouteName, r.Driver, r.DriverPhone,
                r.StopCount, r.StudentsRiding, status,
                lat, lng, speed, nextStop, lastPing,
                teacherRow?.TeacherUserId, teacherRow?.TeacherName));
```
with:
```csharp
            list.Add(new FleetBusResponse(
                r.BusId, r.RouteId, r.BusNo, r.RouteName, r.Driver, r.DriverPhone,
                r.StopCount, r.StudentsRiding, status,
                lat, lng, speed, nextStop, lastPing,
                teacherRow?.TeacherUserId, teacherRow?.TeacherName, Capacity: r.Capacity));
```

- [ ] **Step 7: Add `Capacity` to the controller request DTOs**

In `sms-backend/src/Sms.Api/Controllers/TransportController.cs`, replace:
```csharp
public sealed record CreateBusRequest(
    string BusNo, string? RouteName, Guid? RouteId, string? Driver, string? DriverPhone, Guid? DriverStaffId,
    Guid? ConductorStaffId = null);

public sealed record UpdateBusRequest(
    string? BusNo, Guid? RouteId, Guid? DriverStaffId, bool ClearDriver = false,
    Guid? ConductorStaffId = null, bool ClearConductor = false);
```
with:
```csharp
public sealed record CreateBusRequest(
    string BusNo, string? RouteName, Guid? RouteId, string? Driver, string? DriverPhone, Guid? DriverStaffId,
    Guid? ConductorStaffId = null, int? Capacity = null);

public sealed record UpdateBusRequest(
    string? BusNo, Guid? RouteId, Guid? DriverStaffId, bool ClearDriver = false,
    Guid? ConductorStaffId = null, bool ClearConductor = false, int? Capacity = null, bool ClearCapacity = false);
```

Replace:
```csharp
    [HttpPost("buses")]
    public async Task<IActionResult> CreateBus([FromBody] CreateBusRequest req, CancellationToken ct) =>
        FromResult(await bus.CreateBusAsync(req.BusNo, req.RouteName, req.RouteId, req.Driver, req.DriverPhone, req.DriverStaffId, req.ConductorStaffId, ct));

    [HttpPut("buses/{busId:guid}")]
    public async Task<IActionResult> UpdateBus(
        Guid busId, [FromBody] UpdateBusRequest req, CancellationToken ct) =>
        FromResult(await bus.UpdateBusAsync(busId, req.BusNo, req.RouteId, req.DriverStaffId, req.ClearDriver, req.ConductorStaffId, req.ClearConductor, ct));
```
with:
```csharp
    [HttpPost("buses")]
    public async Task<IActionResult> CreateBus([FromBody] CreateBusRequest req, CancellationToken ct) =>
        FromResult(await bus.CreateBusAsync(req.BusNo, req.RouteName, req.RouteId, req.Driver, req.DriverPhone, req.DriverStaffId, req.ConductorStaffId, req.Capacity, ct));

    [HttpPut("buses/{busId:guid}")]
    public async Task<IActionResult> UpdateBus(
        Guid busId, [FromBody] UpdateBusRequest req, CancellationToken ct) =>
        FromResult(await bus.UpdateBusAsync(busId, req.BusNo, req.RouteId, req.DriverStaffId, req.ClearDriver, req.ConductorStaffId, req.ClearConductor, req.Capacity, req.ClearCapacity, ct));
```

- [ ] **Step 8: Build and run the tests to verify they pass**

Run (from `sms-backend/`):
```
dotnet build
dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter FullyQualifiedName~Transport
```
Expected: build succeeds with no errors; all Transport tests PASS, including the four new `BusCapacityTests`.

- [ ] **Step 9: Commit**

```bash
git add src/Sms.Modules.Transport/BusModule.cs src/Sms.Modules.Transport/StudentBusModule.cs \
        src/Sms.Application/Services/Transport/BusService.cs \
        src/Sms.Application/Services/Transport/FleetSnapshotBuilder.cs \
        src/Sms.Application/Services/Transport/StudentBusService.cs \
        src/Sms.Api/Controllers/TransportController.cs \
        tests/Sms.Tests.Integration/Transport/BusCapacityTests.cs
git commit -m "feat(transport): enforce bus capacity on student assignment"
```

---

### Task 3: Frontend — `capacity` field in `api/transport.ts`

**Files:**
- Modify: `sms-admin/src/api/transport.ts`
- Modify: `sms-admin/src/api/transport.test.ts`

**Interfaces:**
- Consumes: JSON responses now carry `capacity` (snake_case) per Task 2.
- Produces: `CreateBusInput.capacity?: number | null`, `UpdateBusInput.capacity?: number | null`, `UpdateBusInput.clearCapacity?: boolean`, `TransportBus.capacity?: number | null`, `FleetBus.capacity?: number | null` — consumed by Task 4 (`BusEditModal`, `TransportBusesBody`) and Task 5 (`BusRidersModal`).

- [ ] **Step 1: Write the failing tests**

In `sms-admin/src/api/transport.test.ts`, add these two tests inside the `describe('transport buses API', ...)` block (after the existing `'POSTs create bus with route and driver'` test):

```ts
  it('POSTs create bus with capacity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { bus_id: 'B3', bus_no: 'BUS-03', status: 'idle', stop_count: 0, students_riding: 0, capacity: 40 },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const row = await createBus({ busNo: 'BUS-03', capacity: 40 })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.capacity).toBe(40)
    expect(row.capacity).toBe(40)
  })

  it('PUTs bus capacity clear', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { bus_id: 'B1', bus_no: 'BUS-01', route_id: 'R2', driver_staff_id: 'S2', stop_count: 8, students_assigned: 10, capacity: null },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await updateBus('B1', { clearCapacity: true })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.clear_capacity).toBe(true)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `sms-admin/`):
```
npx vitest run src/api/transport.test.ts
```
Expected: FAIL — `body.capacity` and `row.capacity` are `undefined` (the field doesn't exist yet).

- [ ] **Step 3: Add the field to the types and functions**

In `sms-admin/src/api/transport.ts`, replace:
```ts
export interface CreateBusInput {
  busNo: string
  routeName?: string | null
  routeId?: string | null
  driver?: string | null
  driverPhone?: string | null
  driverStaffId?: string | null
}

export interface UpdateBusInput {
  busNo?: string | null
  routeId?: string | null
  driverStaffId?: string | null
  clearDriver?: boolean
}
```
with:
```ts
export interface CreateBusInput {
  busNo: string
  routeName?: string | null
  routeId?: string | null
  driver?: string | null
  driverPhone?: string | null
  driverStaffId?: string | null
  capacity?: number | null
}

export interface UpdateBusInput {
  busNo?: string | null
  routeId?: string | null
  driverStaffId?: string | null
  clearDriver?: boolean
  capacity?: number | null
  clearCapacity?: boolean
}
```

Note: this codebase's `CreateBusInput`/`UpdateBusInput` do NOT have a `conductorStaffId` field
today — do not add one. (An earlier draft of this task mistakenly assumed one existed; it
doesn't, and adding it is out of scope for this plan — a separate, unrelated feature owns that.)

Replace:
```ts
export interface TransportBus {
  busId: string
  busNo: string
  routeId?: string | null
  routeName?: string | null
  driverStaffId?: string | null
  driver?: string | null
  driverPhone?: string | null
  stopCount: number
  studentsAssigned: number
  teacherUserId?: string | null
  teacherName?: string | null
}
```
with:
```ts
export interface TransportBus {
  busId: string
  busNo: string
  routeId?: string | null
  routeName?: string | null
  driverStaffId?: string | null
  driver?: string | null
  driverPhone?: string | null
  stopCount: number
  studentsAssigned: number
  teacherUserId?: string | null
  teacherName?: string | null
  capacity?: number | null
}
```

Replace:
```ts
export interface FleetBus {
  busId: string
  routeId?: string | null
  busNo: string
  routeName?: string | null
  driver?: string | null
  driverPhone?: string | null
  stopCount: number
  studentsRiding: number
  status: BusStatus
  lat?: number | null
  lng?: number | null
  speedKmh?: number | null
  nextStopName?: string | null
  lastPingAt?: string | null
}
```
with:
```ts
export interface FleetBus {
  busId: string
  routeId?: string | null
  busNo: string
  routeName?: string | null
  driver?: string | null
  driverPhone?: string | null
  stopCount: number
  studentsRiding: number
  status: BusStatus
  lat?: number | null
  lng?: number | null
  speedKmh?: number | null
  nextStopName?: string | null
  lastPingAt?: string | null
  capacity?: number | null
}
```

Replace `createBus`:
```ts
export async function createBus(input: CreateBusInput): Promise<FleetBus> {
  const busNo = input.busNo.trim()
  if (!busNo) throw new Error('Bus number is required')
  const body = camelToSnake({
    busNo,
    routeName: input.routeName?.trim() || null,
    routeId: input.routeId || null,
    driver: input.driver?.trim() || null,
    driverPhone: input.driverPhone?.trim() || null,
    driverStaffId: input.driverStaffId || null,
  })
  return asObj<FleetBus>(await request<Record<string, unknown>>('/transport/buses', { method: 'POST', body }))
}
```
with:
```ts
export async function createBus(input: CreateBusInput): Promise<FleetBus> {
  const busNo = input.busNo.trim()
  if (!busNo) throw new Error('Bus number is required')
  const body = camelToSnake({
    busNo,
    routeName: input.routeName?.trim() || null,
    routeId: input.routeId || null,
    driver: input.driver?.trim() || null,
    driverPhone: input.driverPhone?.trim() || null,
    driverStaffId: input.driverStaffId || null,
    capacity: input.capacity ?? null,
  })
  return asObj<FleetBus>(await request<Record<string, unknown>>('/transport/buses', { method: 'POST', body }))
}
```

Replace `updateBus`:
```ts
export async function updateBus(busId: string, input: UpdateBusInput): Promise<TransportBus> {
  if (!busId) throw new Error('Bus ID required')
  const body = camelToSnake({
    busNo: input.busNo?.trim() || null,
    routeId: input.routeId || null,
    driverStaffId: input.driverStaffId || null,
    clearDriver: input.clearDriver ?? false,
  })
  return asObj<TransportBus>(await request<Record<string, unknown>>(`/transport/buses/${busId}`, { method: 'PUT', body }))
}
```
with:
```ts
export async function updateBus(busId: string, input: UpdateBusInput): Promise<TransportBus> {
  if (!busId) throw new Error('Bus ID required')
  const body = camelToSnake({
    busNo: input.busNo?.trim() || null,
    routeId: input.routeId || null,
    driverStaffId: input.driverStaffId || null,
    clearDriver: input.clearDriver ?? false,
    capacity: input.capacity ?? null,
    clearCapacity: input.clearCapacity ?? false,
  })
  return asObj<TransportBus>(await request<Record<string, unknown>>(`/transport/buses/${busId}`, { method: 'PUT', body }))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `sms-admin/`):
```
npx vitest run src/api/transport.test.ts
```
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Typecheck**

Run (from `sms-admin/`):
```
npx tsc -b
```
Expected: no new errors introduced by this change (pre-existing unrelated errors in other files, e.g. `Sidebar.tsx`, `admin.tsx`, `geoFencePanel.tsx`, are not in scope for this plan).

- [ ] **Step 6: Commit**

```bash
git add src/api/transport.ts src/api/transport.test.ts
git commit -m "feat(transport): add capacity field to bus create/update API"
```

---

### Task 4: Frontend — Capacity field in `BusEditModal` + Capacity column in the buses table

**Files:**
- Modify: `sms-admin/src/screens/school/transport.tsx`

**Interfaces:**
- Consumes: `CreateBusInput.capacity`, `UpdateBusInput.capacity`/`clearCapacity`, `TransportBus.capacity` (Task 3).

No test file exists for this screen (`transport.tsx` has no corresponding `.test.tsx` in this repo) — this task is verified manually via the running dev server per Step 4 below, plus the typecheck in Step 3.

- [ ] **Step 1: Add capacity state and wire it into `BusEditModal`**

In `sms-admin/src/screens/school/transport.tsx`, in `BusEditModal`, replace:
```tsx
  const [busNo, setBusNo] = useState('')
  const [routeId, setRouteId] = useState('')
  const [driverStaffId, setDriverStaffId] = useState('')

  useEffect(() => {
    if (!open) return
    setBusNo(bus?.busNo ?? '')
    setRouteId(bus?.routeId ?? '')
    setDriverStaffId(bus?.driverStaffId ?? '')
  }, [open, bus])

  async function save() {
    const trimmed = busNo.trim()
    if (!trimmed) { toast.danger('Bus number is required'); return }
    try {
      if (isEdit) {
        await update.mutateAsync({
          busId: bus!.busId,
          busNo: trimmed,
          routeId: routeId || null,
          driverStaffId: driverStaffId || null,
          clearDriver: !driverStaffId,
        })
        toast.success('Bus updated')
      } else {
        await create.mutateAsync({
          busNo: trimmed,
          routeId: routeId || null,
          driverStaffId: driverStaffId || null,
        })
        toast.success('Bus added')
      }
      onClose()
    } catch (e) {
      toast.danger('Could not save bus', e instanceof Error ? e.message : 'Unknown error')
    }
  }
```
with:
```tsx
  const [driverStaffId, setDriverStaffId] = useState('')
  const [capacity, setCapacity] = useState('')

  useEffect(() => {
    if (!open) return
    setBusNo(bus?.busNo ?? '')
    setRouteId(bus?.routeId ?? '')
    setDriverStaffId(bus?.driverStaffId ?? '')
    setCapacity(bus?.capacity != null ? String(bus.capacity) : '')
  }, [open, bus])

  async function save() {
    const trimmed = busNo.trim()
    if (!trimmed) { toast.danger('Bus number is required'); return }
    const capNum = capacity.trim() ? Number(capacity) : null
    try {
      if (isEdit) {
        await update.mutateAsync({
          busId: bus!.busId,
          busNo: trimmed,
          routeId: routeId || null,
          driverStaffId: driverStaffId || null,
          clearDriver: !driverStaffId,
          capacity: capNum,
          clearCapacity: capNum == null,
        })
        toast.success('Bus updated')
      } else {
        await create.mutateAsync({
          busNo: trimmed,
          routeId: routeId || null,
          driverStaffId: driverStaffId || null,
          capacity: capNum,
        })
        toast.success('Bus added')
      }
      onClose()
    } catch (e) {
      toast.danger('Could not save bus', e instanceof Error ? e.message : 'Unknown error')
    }
  }
```

Note: this codebase's `BusEditModal` does NOT have a Conductor field today — do not add one; it
belongs to a separate, unrelated feature not part of this plan.

- [ ] **Step 2: Add the Capacity field to the modal form**

In the same file, in `BusEditModal`'s returned JSX, replace:
```tsx
        <Field label="Driver (staff)" hint={driversQ.isError ? 'Could not load staff list' : 'Pick any staff member; transport drivers are usually category Transport'}>
          <Select value={driverStaffId} onChange={(e) => setDriverStaffId(e.target.value)} options={driverSelectOptions} disabled={driversQ.isLoading} />
        </Field>
      </div>
    </Modal>
  )
}
```
with:
```tsx
        <Field label="Driver (staff)" hint={driversQ.isError ? 'Could not load staff list' : 'Pick any staff member; transport drivers are usually category Transport'}>
          <Select value={driverStaffId} onChange={(e) => setDriverStaffId(e.target.value)} options={driverSelectOptions} disabled={driversQ.isLoading} />
        </Field>
        <Field label="Capacity" hint="Optional — leave blank for unlimited seats">
          <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 40" />
        </Field>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Add the Capacity column to the buses table**

In the same file, in `TransportBusesBody`, replace:
```tsx
              <tr>
                <th>Bus</th><th>Route</th><th>Driver</th><th>Stops</th><th>Students</th><th />
              </tr>
```
with:
```tsx
              <tr>
                <th>Bus</th><th>Route</th><th>Driver</th><th>Stops</th><th>Students</th><th>Capacity</th><th />
              </tr>
```
and replace:
```tsx
                  <td>{b.stopCount}</td>
                  <td>{b.studentsAssigned}</td>
                  <td><IconBtn icon="edit" title="Edit" onClick={() => setEditBus(b)} /></td>
```
with:
```tsx
                  <td>{b.stopCount}</td>
                  <td>{b.studentsAssigned}</td>
                  <td>{b.studentsAssigned} / {b.capacity ?? '∞'}</td>
                  <td><IconBtn icon="edit" title="Edit" onClick={() => setEditBus(b)} /></td>
```

- [ ] **Step 4: Typecheck**

Run (from `sms-admin/`):
```
npx tsc -b
```
Expected: no new errors from `transport.tsx`.

- [ ] **Step 5: Manually verify in the browser**

With the dev server running (`npm run dev`), open Transport → Buses:
- Click "Add bus", fill in a bus number, set Capacity to `2`, save. Confirm the new row shows `0 / 2` in the Capacity column.
- Click "Edit" on that bus, clear the Capacity field, save. Confirm the row now shows `0 / ∞`.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/transport.tsx
git commit -m "feat(transport): add capacity field to bus edit modal and buses table"
```

---

### Task 5: Frontend — capacity display + disable-at-capacity in `BusRidersModal`

**Files:**
- Modify: `sms-admin/src/screens/school/operations.tsx`

**Interfaces:**
- Consumes: `FleetBus.capacity` (Task 3); `assignStudentToBus`'s existing error propagation (via `assign.mutate`'s `onError`) already surfaces the backend's 409 `capacity_reached` message unchanged.

No test file exists for this screen. Verified manually per Step 3.

- [ ] **Step 1: Show occupied/capacity and disable "Add" at capacity**

In `sms-admin/src/screens/school/operations.tsx`, in `BusRidersModal`, replace:
```tsx
          <Btn variant="primary" icon="plus" disabled={!pick || assign.isPending} onClick={add}>
            {assign.isPending ? 'Adding…' : 'Add'}
          </Btn>
        </div>

        {ridersQ.isLoading ? (
          <Empty icon="users" title="Loading riders…" />
        ) : riders.length === 0 ? (
          <Empty icon="users" title="No riders yet" body="Assign students above to build this bus's roster." />
        ) : (
          <div className="col gap8">
            <div className="t-xs muted3">{riders.length} rider{riders.length === 1 ? '' : 's'}</div>
```
with:
```tsx
          <Btn variant="primary" icon="plus" disabled={!pick || assign.isPending || atCapacity} onClick={add}>
            {assign.isPending ? 'Adding…' : 'Add'}
          </Btn>
          {atCapacity && (
            <div className="t-xs" style={{ color: 'var(--danger)' }}>
              Bus capacity reached ({riders.length}/{bus.capacity})
            </div>
          )}
        </div>

        {ridersQ.isLoading ? (
          <Empty icon="users" title="Loading riders…" />
        ) : riders.length === 0 ? (
          <Empty icon="users" title="No riders yet" body="Assign students above to build this bus's roster." />
        ) : (
          <div className="col gap8">
            <div className="t-xs muted3">
              {riders.length}{bus.capacity != null ? ` / ${bus.capacity}` : ''} rider{riders.length === 1 ? '' : 's'}
            </div>
```

Add the `atCapacity` computed value right after the `available` `useMemo`:
```tsx
  const available = useMemo(
    () => (studentsData ?? []).filter((s) => !assignedIds.has(s.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [studentsData, assignedIds],
  )
```
becomes:
```tsx
  const available = useMemo(
    () => (studentsData ?? []).filter((s) => !assignedIds.has(s.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [studentsData, assignedIds],
  )
  const atCapacity = bus.capacity != null && riders.length >= bus.capacity
```

- [ ] **Step 2: Typecheck**

Run (from `sms-admin/`):
```
npx tsc -b
```
Expected: no new errors from `operations.tsx`.

- [ ] **Step 3: Manually verify in the browser**

With the dev server running: open Transport (or Operations) → Fleet → open "Manage riders" on a bus with Capacity set to `1` (from Task 4's manual test) and no riders yet.
- Assign one student: the rider count now reads `1 / 1`, the "Add" button becomes disabled, and the "Bus capacity reached" message appears.
- Remove that rider: the button re-enables and the message disappears.
- On a bus with no capacity set, confirm the button is never disabled by capacity and no message appears, regardless of rider count.

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/operations.tsx
git commit -m "feat(transport): show bus capacity and disable rider assignment when full"
```
