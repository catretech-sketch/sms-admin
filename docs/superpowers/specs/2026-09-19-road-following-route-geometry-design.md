# Road-Following Route Geometry — sms-admin (CRM) Design

Status: Approved (pending final pre-implementation sign-off)
Repo: sms-admin
Depends on: `sms-backend` spec
`docs/superpowers/specs/2026-09-19-road-following-route-geometry-design.md`
(canonical `GET /v1/transport/routes/{routeId}/geometry` contract — fixed
input to this spec, not re-derived here).

## 1. Objective

Replace the straight-line polyline currently drawn between raw stop
lat/lng in the CRM transport maps with the road-following geometry served
by the new backend endpoint, without disturbing the existing (uncommitted)
live-tracking work (CRM B4: always-show-speed, ★ stop overlay) or any
other map behavior.

## 2. Existing architecture (from audit)

- Google Maps via `@vis.gl/react-google-maps`; only the `places` library is
  loaded today.
- `src/components/maps/RouteBuilderMap.tsx` exports three components:
  - `RouteBuilderMap` — interactive stop editor, used by
    `src/screens/school/transport.tsx`.
  - `TransportRouteMap` — currently unused (no importers found).
  - `FleetLiveMap` — live fleet map with per-bus route polylines, used by
    `src/screens/school/operations.tsx` (this is where the uncommitted B4
    work lives — always-show-speed, `highlightStop` ★ overlay).
- Straight-line construction today (`RouteBuilderMap.tsx`):
  ```ts
  const path = placed.sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({ lat: s.lat as number, lng: s.lng as number }))
  // fed into RoutePolyline -> new google.maps.Polyline({ path, geodesic: true, ... })
  ```
  Same pattern repeats in `TransportRouteMap` and `FleetLiveMap`.
- `src/api/transport.ts` — `RouteStop { id, routeId, name, sequence, lat?, lng? }`,
  `listRouteStops`, `listTransportRoutes`, etc. No `geometry` field exists
  anywhere in these types today.
- Live tracking is via SignalR (`useFleetWebSocket` in
  `src/api/hooks/useOperations.ts`) pushing into the React Query cache via
  `mergeFleetTelemetry` — this spec does not touch that hook, that cache
  key, or the merge logic at all.

## 3. Exact files/components involved

New:
- `src/api/routeGeometry.ts` — thin client for
  `GET /v1/transport/routes/{routeId}/geometry`, typed response matching
  the backend contract (`status: 'available' | 'unavailable'`, `geometry`,
  `format`, `distanceMeters`, `durationSeconds`).
- `src/lib/decodePolyline.ts` — pure function decoding Google's encoded
  polyline format into `{lat,lng}[]`. Small, dependency-free (the standard
  algorithm is ~20 lines; no need to pull in a polyline npm package for
  this).
- `src/api/hooks/useRouteGeometry.ts` — React Query hook wrapping the
  above, keyed by `routeId`, standard `staleTime`/no polling (geometry is
  fetched once per route mount, not on any interval — GPS/SignalR updates
  never invalidate this query).

Modified:
- `src/components/maps/RouteBuilderMap.tsx` — `RoutePolyline` (and its two
  call sites in `RouteBuilderMap` and `FleetLiveMap`) gains a
  `geometry: {status, path}` prop. When `status === 'available'`, draw the
  decoded road polyline. When `status === 'unavailable'`, draw **no route
  line** and instead surface a small inline "Route unavailable" indicator
  near the map controls — stop markers, bus markers, ★ overlay, speed
  display all remain exactly as they are today. `TransportRouteMap` is not
  touched further than the same prop threading, since it currently has no
  importers (left inert, matching its current unused state).
- `src/screens/school/transport.tsx`, `src/screens/school/operations.tsx`
  — call `useRouteGeometry(routeId)` alongside existing stop-fetching, pass
  the result down to the map components already rendered there.

## 4. API contract (consumed, not defined here)

**Confirmed final wire format** (verified against the shipped backend, not
assumed): the actual HTTP response is snake_case and wrapped in this
codebase's standard `{ "data": { ... } }` envelope — e.g.
`{ "data": { "route_id": "...", "distance_meters": 4210, ... } }` — matching
every other endpoint `src/api/transport.ts`'s `request<T>()` helper already
handles. The camelCase, unwrapped interface below is the shape AFTER
`request<T>()`'s existing snake_case→camelCase mapping and envelope
unwrapping (the same pipeline every other function in this file already
goes through) — do not write a second, different unwrapping step for this
one endpoint.

```ts
interface RouteGeometryResponse {
  routeId: string
  status: 'available' | 'unavailable'
  format: 'google-encoded-polyline' | null
  geometry: string | null
  distanceMeters: number | null
  durationSeconds: number | null
  stopSequenceHash: string
  generatedAt: string | null
}
```

## 5. Data model / migration

None — this repo has no database of its own for this feature; it is a
pure API consumer.

## 6. Authentication / authorization

No change. The geometry request is authenticated the same way every other
`src/api/transport.ts` call is (existing bearer token via the shared API
client) — the backend's per-route authorization check (see backend spec §6)
is what actually enforces access; this repo does nothing new here.

## 7. Error handling

- Network failure calling the geometry endpoint, or `status: 'unavailable'`
  in the response: render the "Route unavailable" state, never fall back
  to drawing the old straight-line polyline as if it were the real route.
  This matches the mandatory correction — the legacy straight-line
  construction code in `RoutePolyline` is not deleted (kept as inert
  dead code path guarded behind a feature check, in case of future
  rollback need) but is never invoked as a silent production fallback.
- Map continues to render stop markers, bus markers, live status, and
  speed exactly as today regardless of geometry availability.

## 8. Caching / performance

`useRouteGeometry` fetches once per `routeId` via React Query's normal
cache (no manual polling, no refetch-on-window-focus override needed
beyond React Query defaults). SignalR/GPS updates go through a completely
separate query key (`queryKeys.operations.transportFleet`) and never touch
this query or trigger a refetch of it.

## 9. Testing

- `src/lib/decodePolyline.test.ts` — decode known encoded-polyline fixtures
  against expected coordinate arrays.
- `src/components/maps/RouteBuilderMap.test.tsx` (extend existing tests if
  present, else add) — renders road polyline when `status: 'available'`,
  renders "Route unavailable" state and no polyline when
  `status: 'unavailable'`, existing stop/bus marker rendering and B4
  speed/★-overlay behavior remain covered/unbroken.
- Explicit regression check: existing `src/api/transport.test.ts` and any
  `operations.tsx`/`transport.tsx` tests continue passing unmodified.

## 10. Rollback / safety considerations

Purely additive — if the backend endpoint is unavailable or not yet
deployed, `useRouteGeometry` simply always resolves to `unavailable` (or
errors, handled the same way), and the map shows stops without a route
line. Reverting this change means removing the new files and the prop
threading; no data migration, no destructive change anywhere.

## 11. Dependencies

Requires the `sms-backend` geometry endpoint to be deployed and reachable;
until then this can still be built and tested against a mocked response.

## 12. Non-goals

- Not modifying `TransportRouteMap`'s unused status, `BusMap.tsx`, live
  GPS/SignalR wiring, ETA display, or any existing CRM B4 behavior beyond
  adding the geometry prop.
- Not adding a new map provider or removing Google Maps.
- Not touching `.env.local` or the Google Maps API key.
- Not touching `sms-catreadmin` (confirmed no transport/map UI there).
