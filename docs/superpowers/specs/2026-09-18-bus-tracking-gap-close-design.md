# Bus Tracking Gap-Close — Design Spec

**Date:** 2026-09-18  
**Status:** Approved (Approach A)  
**Scope:** Close production gaps on the existing transport spine. No parallel system.

## Goal

Parents (and student view) see each child’s real bus, route, stops, ★ assigned stop, live position, status, and speed — securely, multi-tenant, SignalR-first. CRM remains an operational fleet consumer. Driver GPS remains the primary ingest path; admin/CRM ingest must share the same broadcast + heartbeat hooks.

## Non-goals

- Historical trip replay
- Parent self-service opt-in/out
- Fake / invented ETA
- New GPS pipeline
- New transport tables
- Duplicate APIs or DTOs as SoT
- Browser/localStorage as source of truth for transport state

## Existing spine (reuse)

| Piece | Reuse |
|-------|--------|
| Parent poll | `GET /v1/me/children/bus` → `ChildBusPositionResponse` |
| Hub | `/hubs/transport-fleet`, `JoinBus(busId)`, `position_update`, `fleet_update`, trip/status events |
| Status | `BusTrackingStatusRules` (LIVE ≤60s, DELAYED ≤300s, OFFLINE) |
| Ingest | `TripService.IngestPingsAsync` + `TripPing_BulkInsert` |
| Parent UI | `sms-student` `ParentTransportScreen` + `BusMap` |
| CRM fleet | `GET /v1/transport/fleet` + `FleetLiveMap` |
| Driver | `sms-staff` trip pings / broadcaster |

## Requirements

### B1 — Backend live path unification

1. **Admin/CRM bus trip ping ingest** must call the same post-write hooks as driver `TripService.IngestPingsAsync`:
   - Persist pings
   - Update trip heartbeat (so offline sweep stays correct)
   - `BroadcastPositionAsync` (SignalR `position_update`)
   - Parent approach alerts when applicable
2. **Admin start trip** must broadcast `trip_started` and notify parents the same way as driver start (additive; keep existing response shape).
3. **Parent live query** must treat trip status `live` **and** `arrived` as still trackable (align with fleet/position).
4. **Additive DTO field** on `ChildBusPositionResponse`: `EtaToStudentStopMin` (nullable int). Compute only when speed and distance allow a reliable estimate; otherwise null — never invent.
5. **Additive field** on fleet DTO: `TrackingStatus` (`LIVE` | `DELAYED` | `OFFLINE`) from `BusTrackingStatusRules`, keeping legacy `Status` for backward compatibility.

### B2 — Hub helper

- Add `JoinMyChildrenBuses()` on `TransportFleetHub`:
  - Authenticated parent only (or any caller who has linked children)
  - Server resolves bus IDs from linked children’s active assignments
  - Joins each `bus:{busId}` group once (dedupe)
  - Returns joined bus ID list
- Keep `JoinBus(busId)` unchanged for teachers/drivers/CRM edge cases.

### B3 — Parent / student app

- Show **speed** (`speedKmh`) on the transport card / map when available.
- Subscribe primarily via SignalR (`JoinMyChildrenBuses` or per-bus `JoinBus`); keep a **slow** poll only as reconnect/fallback (existing ~12s is OK as backup, not primary UX).
- Handle `stop_arrived` / `stop_completed` / `school_arrived` / `status_changed` / `trip_ended` by invalidating or patching local live state without full page reload.
- Reconnect: re-join buses after hub reconnect.
- Do not fabricate route/bus/stop when assignment is missing; keep empty/offline/opted-out copy.

### B4 — CRM

- Fleet map/table: **always show speed** when GPS feature is on (`N km/h` or `0` / `—` when unknown) — not only when “on_route”.
- Optional: when a student is selected in transport students / overlay context, show that student’s ★ stop on the map using API assignment data (no local SoT).
- No localStorage/sessionStorage as live location SoT (nav hints only remain OK).

### B5 — Tests

- Parent cannot access another child’s / school’s bus (HTTP + JoinBus).
- Multi-child same bus → one join; different buses → both joined.
- Admin ping produces `position_update` (or equivalent observable broadcast hook).
- Parent query includes `arrived` trips as live-capable.
- `EtaToStudentStopMin` null when unreliable; set when calculable.
- Frontend: speed render; child stop overlay; reconnect join.

### B6 — Report

Deliver the §30-style implementation report after verification.

## Authorization (unchanged invariants)

```text
Parent → ParentStudentLinks (or legacy admission) → StudentBusAssignments → Bus
```

- `GET /v1/me/children/bus` never accepts client-supplied bus/student IDs for scoping.
- `JoinBus` / `JoinMyChildrenBuses` enforce the same resolver rules.
- Tenant RLS + SESSION_CONTEXT remain mandatory.

## Compatibility

- All DTO additions are optional/nullable JSON fields (snake_case wire).
- Existing clients ignoring new fields continue to work.
- No migration unless a proven schema gap appears (none expected).

## Success criteria

1. Driver **or** admin GPS update moves parent/CRM markers via SignalR without full reload.
2. Parent multi-child selector shows correct per-child bus/route/★ stop/speed/status.
3. Offline/delayed/live status consistent via `BusTrackingStatusRules`.
4. CRM fleet shows speed; optional student stop overlay when selected.
5. Tests green; no new transport tables; no browser SoT for live state.
