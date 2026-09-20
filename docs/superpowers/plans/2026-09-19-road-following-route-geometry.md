# Road-Following Route Geometry (sms-admin / CRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the straight-line polyline in the CRM's route builder and live fleet map with the road-following geometry served by `GET /v1/transport/routes/{routeId}/geometry`, with an explicit "Route unavailable" state — never a silent straight-line fallback.

**Architecture:** A new `getRouteGeometry` API function + React Query hooks (single-route and multi-route, mirroring the existing `useRouteStopsByRoute`/`useFleetRouteStops` pattern) feed a new `RoadRoutePolyline` map component that decodes Google's encoded-polyline format and renders it in place of the existing straight-line `RoutePolyline`. The straight-line code is kept in the file (dead/unused from production call sites) rather than deleted, per the mandatory "keep as inert legacy code" requirement.

**Tech Stack:** React 19, Vite, `@vis.gl/react-google-maps`, TanStack React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-road-following-route-geometry-design.md`

## Global Constraints

- Depends on the finalized `sms-backend` contract: `GET /v1/transport/routes/{routeId}/geometry` → `{ routeId, status: 'available'|'unavailable', format, geometry, distanceMeters, durationSeconds, stopSequenceHash, generatedAt }`.
- Never draw the old straight-line polyline as a production fallback when geometry is `unavailable` or the request fails — show an explicit "Route unavailable" indicator instead.
- Do not touch `useFleetWebSocket`, `mergeFleetTelemetry`, the `queryKeys.operations.transportFleet` cache, or any CRM B4 (always-show-speed, ★ stop overlay) behavior already present in `FleetLiveMap`.
- Do not touch `.env.local` or the Google Maps API key.
- Preserve all existing uncommitted changes in this repo (the CRM B4 work already in `RouteBuilderMap.tsx`/`operations.tsx`) — every diff in this plan is additive on top of them, never a revert.

---

### Task 1: `decodePolyline` utility

**Files:**
- Create: `src/lib/decodePolyline.ts`
- Test: `src/lib/decodePolyline.test.ts`

**Interfaces:**
- Produces: `function decodePolyline(encoded: string): { lat: number; lng: number }[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { decodePolyline } from './decodePolyline'

describe('decodePolyline', () => {
  it('decodes a known Google encoded polyline fixture', () => {
    // Google's own documented example: _p~iF~ps|U_ulLnnqC_mqNvxq`@
    // decodes to [(38.5,-120.2),(40.7,-120.95),(43.252,-126.453)]
    const result = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(result).toHaveLength(3)
    expect(result[0].lat).toBeCloseTo(38.5, 4)
    expect(result[0].lng).toBeCloseTo(-120.2, 4)
    expect(result[1].lat).toBeCloseTo(40.7, 4)
    expect(result[1].lng).toBeCloseTo(-120.95, 4)
    expect(result[2].lat).toBeCloseTo(43.252, 4)
    expect(result[2].lng).toBeCloseTo(-126.453, 4)
  })

  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/decodePolyline.test.ts`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Write the implementation**

```ts
/** Decodes Google's polyline algorithm format (used by the Routes API) into lat/lng pairs.
 *  https://developers.google.com/maps/documentation/utilities/polylinealgorithm */
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  if (!encoded) return []
  const points: { lat: number; lng: number }[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    lat += decodeSignedValue()
    lng += decodeSignedValue()
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points

  function decodeSignedValue(): number {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return (result & 1) !== 0 ? ~(result >> 1) : result >> 1
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/decodePolyline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/decodePolyline.ts src/lib/decodePolyline.test.ts
git commit -m "feat(transport): add Google encoded-polyline decoder"
```

---

### Task 2: `getRouteGeometry` API client

**Files:**
- Modify: `src/api/transport.ts`
- Modify: `src/api/transport.test.ts`

**Interfaces:**
- Consumes: `request<T>()` (existing helper already used by `listRouteStops` etc. in this file).
- Produces:
  ```ts
  export type RouteGeometryStatus = 'available' | 'unavailable'
  export interface RouteGeometry {
    routeId: string
    status: RouteGeometryStatus
    format: string | null
    geometry: string | null
    distanceMeters: number | null
    durationSeconds: number | null
    stopSequenceHash: string
    generatedAt: string | null
  }
  export async function getRouteGeometry(routeId: string): Promise<RouteGeometry>
  ```

- [ ] **Step 1: Write the failing test**

Add to `src/api/transport.test.ts`:

```ts
import { getRouteGeometry } from './transport'

describe('route geometry API', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('GETs available geometry for a route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        route_id: 'R1', status: 'available', format: 'google-encoded-polyline',
        geometry: 'abc123', distance_meters: 4210, duration_seconds: 780,
        stop_sequence_hash: 'sha256:abc', generated_at: '2026-09-19T10:00:00Z',
      },
    })))
    const result = await getRouteGeometry('R1')
    expect(result.status).toBe('available')
    expect(result.geometry).toBe('abc123')
    expect(result.distanceMeters).toBe(4210)
  })

  it('GETs unavailable geometry with null fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        route_id: 'R1', status: 'unavailable', format: null, geometry: null,
        distance_meters: null, duration_seconds: null, stop_sequence_hash: 'sha256:abc', generated_at: null,
      },
    })))
    const result = await getRouteGeometry('R1')
    expect(result.status).toBe('unavailable')
    expect(result.geometry).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/transport.test.ts -t "route geometry"`
Expected: FAIL (`getRouteGeometry` is not exported)

- [ ] **Step 3: Add the type and function to `src/api/transport.ts`**

Add near `listRouteStops` (the response already goes through this file's existing snake_case→camelCase `request<T>()`/mapper pipeline — check the exact mapper import used by `listRouteStops`'s `asList<RouteStop>` call and mirror it here rather than hand-rolling field mapping if a generic single-object mapper equivalent to `asList` already exists in this file):

```ts
export type RouteGeometryStatus = 'available' | 'unavailable'

export interface RouteGeometry {
  routeId: string
  status: RouteGeometryStatus
  format: string | null
  geometry: string | null
  distanceMeters: number | null
  durationSeconds: number | null
  stopSequenceHash: string
  generatedAt: string | null
}

export async function getRouteGeometry(routeId: string): Promise<RouteGeometry> {
  return await request<RouteGeometry>(`/transport/routes/${routeId}/geometry`)
}
```

(The existing `request<T>()` helper already runs responses through the shared `snakeToCamel` mapper used across this file — confirm this by checking how `listRouteStops`'s plain-object fields like `route_id`/`stop_sequence_hash` come back camelCased; if `request<T>()` does not auto-map and `listRouteStops` instead relies on `asList<RouteStop>` for that, add an equivalent single-object mapping step here instead of assuming.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/transport.test.ts -t "route geometry"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/transport.ts src/api/transport.test.ts
git commit -m "feat(transport): add getRouteGeometry API client"
```

---

### Task 3: `useRouteGeometry` / `useFleetRouteGeometries` hooks

**Files:**
- Modify: `src/api/queryKeys.ts`
- Modify: `src/api/hooks/useOperations.ts`

**Interfaces:**
- Consumes: `getRouteGeometry` (Task 2), `queryKeys.operations.transportRouteStops` (existing, pattern to mirror), `useRouteStopsByRoute`/`useFleetRouteStops` (existing, pattern to mirror exactly).
- Produces:
  ```ts
  export function useRouteGeometry(routeId: string | null | undefined): UseQueryResult<RouteGeometry>
  export function useFleetRouteGeometries(fleet: FleetBus[]): Record<string, RouteGeometry>
  ```

- [ ] **Step 1: Add the query key**

In `src/api/queryKeys.ts`, next to `transportRouteStops`:

```ts
transportRouteGeometry: (routeId: string) => ['operations', 'transport', 'routeGeometry', routeId] as const,
```

- [ ] **Step 2: Add `useRouteGeometry` to `useOperations.ts`**

Add `getRouteGeometry` and `type RouteGeometry` to the existing import block from `'../operations'` — but confirm first: `getRouteGeometry` was added to `src/api/transport.ts` in Task 2, and this file already imports several functions/types `from '../operations'`. Check whether `../operations` re-exports everything from `./transport`, or whether `transport.ts` functions are imported directly elsewhere in this file — grep this file's import block and `src/api/operations.ts` before adding the import, and add it via whichever path the rest of this file already uses for transport functions, to avoid introducing a second, inconsistent import path for the same module.

```ts
export function useRouteGeometry(routeId: string | null | undefined) {
  const ops = useOperationsTier()
  return useQuery({
    queryKey: queryKeys.operations.transportRouteGeometry(routeId ?? ''),
    queryFn: () => getRouteGeometry(routeId as string),
    enabled: ops && !!routeId,
    staleTime: 60_000,
  })
}
```

- [ ] **Step 3: Add `useFleetRouteGeometries`, mirroring `useFleetRouteStops`/`useRouteStopsByRoute` exactly**

```ts
export function useFleetRouteGeometries(fleet: FleetBus[]): Record<string, RouteGeometry> {
  const ops = useOperationsTier()
  const routeIds = useMemo(
    () => [...new Set(fleet.map((b) => b.routeId).filter(Boolean))] as string[],
    [fleet],
  )
  const queries = useQueries({
    queries: routeIds.map((id) => ({
      queryKey: queryKeys.operations.transportRouteGeometry(id),
      queryFn: () => getRouteGeometry(id),
      enabled: ops && !!id,
      staleTime: 60_000,
    })),
  })
  const snapshots = queries.map((q) => q.data)
  return useMemo(() => {
    const out: Record<string, RouteGeometry> = {}
    routeIds.forEach((id, i) => {
      const data = snapshots[i]
      if (data) out[id] = data
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeIds, snapshots])
}
```

- [ ] **Step 4: Manually verify via existing test suite for this file**

Check whether `useOperations.ts` has a sibling `useOperations.test.ts`; if so, add a test there following its existing style for `useFleetRouteStops`/`useRouteStopsByRoute` (mock `getRouteGeometry`, assert the returned record keys by routeId). If no such test file exists for hooks in this file today, skip a dedicated unit test here — coverage comes from Task 5's component-level tests instead, consistent with how `useFleetRouteStops` itself doesn't appear to have a standalone unit test either (confirm this by checking for its test before deciding).

Run: `npx vitest run src/api/hooks/useOperations.test.ts` (if it exists)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/queryKeys.ts src/api/hooks/useOperations.ts
git commit -m "feat(transport): add useRouteGeometry and useFleetRouteGeometries hooks"
```

---

### Task 4: `RoadRoutePolyline` component + unavailable-state indicator

**Files:**
- Modify: `src/components/maps/RouteBuilderMap.tsx`
- Test: `src/components/maps/RouteBuilderMap.test.tsx` (create if it does not already exist — check first)

**Interfaces:**
- Consumes: `decodePolyline` (Task 1), `RouteGeometry` type (Task 2).
- Produces: `RoadRoutePolyline({ geometry, strokeColor }: { geometry: RouteGeometry | undefined; strokeColor?: string })` — renders the decoded road polyline when `geometry?.status === 'available'`, renders nothing when `undefined`/`'unavailable'`. A sibling `RouteUnavailableBadge()` renders a small "Route unavailable" pill, shown by callers only when a geometry query has resolved to `'unavailable'` (not while still loading).

- [ ] **Step 1: Write the failing component test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouteBuilderMap } from './RouteBuilderMap'
import type { RouteStop } from '@/api/transport'

vi.stubGlobal('import.meta', { env: { VITE_GOOGLE_MAPS_API_KEY: 'test-key', VITE_GOOGLE_MAPS_MAP_ID: 'test-map' } })

const stops: RouteStop[] = [
  { id: 's1', routeId: 'r1', name: 'Stop 1', sequence: 1, lat: 12.1, lng: 77.1 },
  { id: 's2', routeId: 'r1', name: 'Stop 2', sequence: 2, lat: 12.2, lng: 77.2 },
]

describe('RouteBuilderMap route geometry', () => {
  it('shows a Route unavailable indicator when geometry status is unavailable', () => {
    render(
      <RouteBuilderMap
        stops={stops}
        geometry={{
          routeId: 'r1', status: 'unavailable', format: null, geometry: null,
          distanceMeters: null, durationSeconds: null, stopSequenceHash: 'h', generatedAt: null,
        }}
      />,
    )
    expect(screen.getByText(/route unavailable/i)).toBeInTheDocument()
  })

  it('does not show the unavailable indicator when geometry is available', () => {
    render(
      <RouteBuilderMap
        stops={stops}
        geometry={{
          routeId: 'r1', status: 'available', format: 'google-encoded-polyline', geometry: 'abc',
          distanceMeters: 100, durationSeconds: 10, stopSequenceHash: 'h', generatedAt: '2026-09-19T10:00:00Z',
        }}
      />,
    )
    expect(screen.queryByText(/route unavailable/i)).not.toBeInTheDocument()
  })
})
```

Check the actual existing test setup for `@vis.gl/react-google-maps` mocking (this map SDK renders real Google Maps JS which won't run in jsdom) — search for any existing test file exercising `RouteBuilderMap`/`FleetLiveMap`/`TransportRouteMap` first (there may be none yet, per the audit finding no map component tests were located) and, if none exists, add a minimal mock for `@vis.gl/react-google-maps`'s `APIProvider`/`Map`/`AdvancedMarker`/`useMap`/`useMapsLibrary` exports (rendering children directly, `useMap`/`useMapsLibrary` returning `null`) at the top of this test file so the unavailable-indicator assertion (which doesn't depend on real map rendering) can run in jsdom.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/maps/RouteBuilderMap.test.tsx`
Expected: FAIL (`geometry` prop doesn't exist yet, indicator not rendered)

- [ ] **Step 3: Add `RoadRoutePolyline` and `RouteUnavailableBadge`, and thread the `geometry` prop through `RouteBuilderMap`**

Add near the existing `RoutePolyline` (kept in place, unused by production call sites from this task onward — the "inert legacy code" the spec requires):

```ts
import { decodePolyline } from '@/lib/decodePolyline'
import type { RouteGeometry } from '@/api/transport'

function RoadRoutePolyline({ geometry, strokeColor = '#2563eb' }: { geometry: RouteGeometry | undefined; strokeColor?: string }) {
  const map = useMap()
  const encoded = geometry?.status === 'available' ? geometry.geometry : null
  useEffect(() => {
    if (!map || !encoded || typeof google === 'undefined') return
    const path = decodePolyline(encoded)
    if (path.length < 2) return
    const line = new google.maps.Polyline({ path, strokeColor, strokeOpacity: 0.85, strokeWeight: 4, geodesic: false, map })
    return () => line.setMap(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, encoded, strokeColor])
  return null
}

function RouteUnavailableBadge() {
  return (
    <div
      className="t-xs muted3"
      style={{ position: 'absolute', top: 10, right: 12, background: 'var(--surface)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
    >
      Route unavailable
    </div>
  )
}
```

In `RouteBuilderMapProps`, add `geometry?: RouteGeometry`. In the component body, replace the production render call `{path.length >= 2 && <RoutePolyline path={path} />}` with:

```tsx
{geometry?.status === 'available' && <RoadRoutePolyline geometry={geometry} />}
```

and, as a sibling of the existing "Click map to add a stop" absolutely-positioned hint `<div>`, add:

```tsx
{geometry?.status === 'unavailable' && <RouteUnavailableBadge />}
```

(placed outside the `<APIProvider>`/`<Map>` tree, at the same level as the existing hint text, so it renders even before the Google Maps script itself is ready).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/maps/RouteBuilderMap.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/maps/RouteBuilderMap.tsx src/components/maps/RouteBuilderMap.test.tsx
git commit -m "feat(transport): render road-following geometry with explicit unavailable state in RouteBuilderMap"
```

---

### Task 5: Wire `FleetLiveMap` to the same geometry, preserving CRM B4

**Files:**
- Modify: `src/components/maps/RouteBuilderMap.tsx`
- Modify: `src/screens/school/operations.tsx`
- Modify: `src/components/maps/RouteBuilderMap.test.tsx`

**Interfaces:**
- Consumes: `RoadRoutePolyline`/`RouteUnavailableBadge` (Task 4), `useFleetRouteGeometries` (Task 3).
- Produces: `FleetLiveMap` gains a `routeGeometryByRouteId?: Record<string, RouteGeometry>` prop, additive alongside the existing `routeStopsByRouteId` prop — `highlightStop`, always-show-speed, and every other existing `FleetLiveMap` behavior is untouched.

- [ ] **Step 1: Write the failing test**

Add to `RouteBuilderMap.test.tsx`:

```tsx
import { FleetLiveMap } from './RouteBuilderMap'

describe('FleetLiveMap route geometry', () => {
  const fleet = [{ busId: 'b1', busNo: 'BUS-01', routeId: 'r1', lat: 12.1, lng: 77.1, speedKmh: 20 }]
  const routeStopsByRouteId = { r1: [
    { id: 's1', routeId: 'r1', name: 'Stop 1', sequence: 1, lat: 12.1, lng: 77.1 },
    { id: 's2', routeId: 'r1', name: 'Stop 2', sequence: 2, lat: 12.2, lng: 77.2 },
  ] }

  it('shows Route unavailable for a selected bus whose route geometry is unavailable', () => {
    render(
      <FleetLiveMap
        fleet={fleet}
        routeStopsByRouteId={routeStopsByRouteId}
        routeGeometryByRouteId={{ r1: {
          routeId: 'r1', status: 'unavailable', format: null, geometry: null,
          distanceMeters: null, durationSeconds: null, stopSequenceHash: 'h', generatedAt: null,
        } }}
      />,
    )
    // Selecting the bus is required to trigger route drawing per existing FleetLiveMap behavior
    // (no selection = no routes at all) — this test drives the picker the same way an existing
    // FleetLiveMap interaction test would; if no such existing test/pattern is found, select
    // via whatever the picker's accessible role/label actually renders as (`pickerLabel`).
  })
})
```

Flesh this test out against the actual rendered picker markup once Task 4's `@vis.gl/react-google-maps` test mock is in place — the picker button's visible text is `pickerLabel` ("All buses" / bus number / "N buses selected"), so drive it via `screen.getByRole('button', { name: /all buses/i })` and the resulting checkbox `screen.getByRole('checkbox', { name: /bus-01/i })`, matching `RouteBuilderMap.tsx`'s existing `Checkbox` usage.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/maps/RouteBuilderMap.test.tsx -t "FleetLiveMap route geometry"`
Expected: FAIL

- [ ] **Step 3: Add the prop and wire it into `FleetLiveMap`**

In `FleetLiveMap`'s prop destructuring, add `routeGeometryByRouteId = {}`. Replace the existing production polyline render:

```tsx
{routePaths.map((r, i) => (
  <RoutePolyline key={r.routeId} path={r.path} strokeColor={ROUTE_COLORS[i % ROUTE_COLORS.length]} />
))}
```

with:

```tsx
{routePaths.map((r, i) => {
  const geom = routeGeometryByRouteId[r.routeId]
  return geom?.status === 'available'
    ? <RoadRoutePolyline key={r.routeId} geometry={geom} strokeColor={ROUTE_COLORS[i % ROUTE_COLORS.length]} />
    : geom?.status === 'unavailable'
      ? null // handled by the badge below, not a per-route line
      : null // still loading — no line yet, not a straight-line placeholder
})}
```

and add, alongside the existing "Waiting for live GPS" overlay condition at the bottom of the component:

```tsx
{selectedBusIds.length > 0 && routePaths.some((r) => routeGeometryByRouteId[r.routeId]?.status === 'unavailable') && (
  <RouteUnavailableBadge />
)}
```

Update the `FleetLiveMap` props type to include `routeGeometryByRouteId?: Record<string, RouteGeometry>`.

- [ ] **Step 4: Wire it in `operations.tsx`**

```ts
import { useFleetRouteGeometries } from '@/api/hooks/useOperations'
```

```ts
const routeGeometryByRouteId = useFleetRouteGeometries(fleet)
```

```tsx
<FleetLiveMap fleet={fleet} routeStopsByRouteId={routeStopsByRouteId} highlightStop={highlightStop} routeGeometryByRouteId={routeGeometryByRouteId} />
```

(inserted next to the existing `routeStopsByRouteId = useFleetRouteStops(fleet)` line and the existing `<FleetLiveMap ...>` call — no other line in `GpsScreenBody` changes.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/maps/RouteBuilderMap.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/maps/RouteBuilderMap.tsx src/screens/school/operations.tsx src/components/maps/RouteBuilderMap.test.tsx
git commit -m "feat(transport): wire road-following geometry into FleetLiveMap alongside existing CRM live-tracking behavior"
```

---

### Task 6: Wire `RouteBuilderMap`'s single-route usage in `transport.tsx`

**Files:**
- Modify: `src/screens/school/transport.tsx`

**Interfaces:**
- Consumes: `useRouteGeometry` (Task 3), `RouteBuilderMap`'s new `geometry` prop (Task 4).

- [ ] **Step 1: Wire the hook and prop**

```ts
import { useRouteGeometry } from '@/api/hooks/useOperations'
```

```ts
const geometryQ = useRouteGeometry(route.id)
```

```tsx
<RouteBuilderMap
  stops={stops}
  height={420}
  geometry={geometryQ.data}
  {/* existing props (selectedStopId, onMapClick, onStopClick, etc.) unchanged */}
/>
```

Locate the exact existing prop list on this call site (`src/screens/school/transport.tsx:371` onward) and add only the `geometry` line — do not reorder or otherwise touch the existing props.

- [ ] **Step 2: Manual verification**

Run: `npm run dev` (or the project's existing dev-server command), open the transport routes screen for a route with 2+ placed stops, and confirm: (a) with no backend geometry endpoint deployed yet, the map shows the "Route unavailable" badge and no line — never the old straight line; (b) stop markers, click-to-add, and drag/search behavior are all unchanged from before this plan.

- [ ] **Step 3: Commit**

```bash
git add src/screens/school/transport.tsx
git commit -m "feat(transport): wire road-following geometry into the route builder editor"
```

---

### Task 7: Full regression pass

- [ ] **Step 1: Run the full frontend test suite**

Run: `npx vitest run`
Expected: PASS — including all pre-existing tests untouched by this plan (`src/api/transport.test.ts`'s other cases, `src/lib/attendanceExport.test.ts`, `src/lib/payroll.test.ts`, etc., and anything covering `operations.tsx`/`transport.tsx` today).

- [ ] **Step 2: Confirm no unrelated files changed and CRM B4 work is intact**

Run: `git status` and `git diff --stat`
Expected: only files listed in Tasks 1–6 changed beyond whatever was already modified/uncommitted in this repo before this plan started (the CRM B4 diff noted in the audit — `RouteBuilderMap.tsx`'s always-show-speed/`highlightStop` logic, `operations.tsx`'s wiring of it). Diff those specific hunks to confirm they are untouched by this plan's edits (only new lines added nearby, no existing B4 lines removed or altered).

- [ ] **Step 3: Report pre-existing vs. new changes**

List, in the final report, which modified-file hunks predate this plan (CRM B4) versus which were introduced by Tasks 1–6, so the person merging this can review the two changes independently.
