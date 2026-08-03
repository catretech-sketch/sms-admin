-- Dev helper: activate campus geo-fence for SCC (slug = scc).
-- Run against your local Sms database after migrations are applied.
-- sqlcmd -S YOUR_SERVER -d Sms -E -i scripts/dev-seed-scc-geofence.sql

DECLARE @TenantId uniqueidentifier = (
  SELECT TOP 1 Id FROM dbo.Tenants WHERE Slug = N'scc' ORDER BY CreatedAt
);

IF @TenantId IS NULL
BEGIN
  RAISERROR('No tenant with slug scc found.', 16, 1);
  RETURN;
END

UPDATE dbo.Tenants SET Tier = N'platinum' WHERE Id = @TenantId AND Tier <> N'platinum';

EXEC dbo.SchoolLocation_Upsert
  @TenantId = @TenantId,
  @Lat = 12.971600,
  @Lng = 77.594600,
  @RadiusMeters = 250,
  @Name = N'SCC Main Campus';

SELECT t.Slug, t.Tier, sl.Lat, sl.Lng, sl.RadiusMeters, sl.Name
FROM dbo.Tenants t
LEFT JOIN dbo.SchoolLocations sl ON sl.TenantId = t.Id
WHERE t.Id = @TenantId;
