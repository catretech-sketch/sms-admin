# Bus Tracking Gap-Close Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use TDD where tests already exist for the surface.

**Goal:** Close live-path / parent / CRM gaps on the existing transport spine per `docs/superpowers/specs/2026-09-18-bus-tracking-gap-close-design.md`.

**Architecture:** Reuse `ChildBusPositionResponse`, `TripService` broadcast hooks, `TransportFleetHub.JoinBus`, parent `ParentTransportScreen`, CRM `FleetLiveMap`. Additive DTOs only. No new tables.

**Tech stack:** .NET API + FluentMigrator (no new migration expected), SignalR, React CRM (Vite), Expo `sms-student` / `sms-staff`.

---

## File map

| Area | Files |
|------|--------|
| B1 ingest unify | `TripService.cs`, admin bus trip methods in `BusService` / `TransportController`, `BusParentAlertService`, `ITransportFleetBroadcaster` |
| B1 parent query | Parent transport repo/SQL selecting children buses; `ChildBusPositionResponse` |
| B1 fleet status | `FleetSnapshotBuilder.cs`, `FleetBusResponse` |
| B2 hub | `TransportFleetHub.cs`, auth resolver |
| B3 apps | `sms-student` transport hooks/screen/map |
| B4 CRM | `operations.tsx` GpsScreen, `RouteBuilderMap.tsx` FleetLiveMap, `transport.ts` |
| Tests | Existing integration tests under `Sms.Tests.Integration/Transport`, CRM/parent unit tests |

---

### Task B1.1 — Failing test: admin pings broadcast position

**Files:**
- Modify: existing transport integration tests (or add beside them)
- Modify: admin ingest path to call broadcast + heartbeat

**Steps:** Write/extend test that after admin/CRM bus trip ping, a position broadcast occurs (mock broadcaster or hub assertion). Run → fail. Wire admin ingest through shared post-ping hooks. Run → pass.

### Task B1.2 — Parent query includes `arrived`

**Steps:** Test parent children-bus returns location when trip status is `arrived`. Change SQL/filter from `live` only to `live`+`arrived`. Pass.

### Task B1.3 — `EtaToStudentStopMin` additive

**Steps:** Unit/integration: when speed and distance known, field set; when not, null. Add property to DTO + mapper. Pass.

### Task B1.4 — Fleet `TrackingStatus` additive

**Steps:** Assert fleet JSON includes `tracking_status` from `BusTrackingStatusRules` while legacy `status` unchanged. Pass.

### Task B2 — `JoinMyChildrenBuses`

**Steps:** Integration: parent joins only children’s buses; unauthorized empty; dedupe same bus. Implement hub method. Pass.

### Task B3 — Parent/student UX

**Steps:** Show speed; use `JoinMyChildrenBuses` on connect; handle stop/status events; re-join on reconnect. Tests for mapping/speed display.

### Task B4 — CRM fleet

**Steps:** Always show speed on map/table; optional ★ stop overlay from selected student assignment API. No local SoT.

### Task B5 — Regression

**Steps:** Run transport integration suite + focused CRM/parent tests. Fix breakages.

### Task B6 — Report

**Steps:** Write final report to `docs/superpowers/plans/` or SDD folder using the §30 template.

---

## Execution order

B1.1 → B1.2 → B1.3 → B1.4 → B2 → B3 → B4 → B5 → B6
