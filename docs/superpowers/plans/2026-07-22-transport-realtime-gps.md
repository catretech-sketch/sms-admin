# Transport Real-Time GPS & Parent Alerts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let drivers push live GPS from the browser; show route stops when assigning a student to a bus; let admin trigger SMS/push alerts to parents on bus events (departed, approaching, arrived).

**Architecture:** Five additive layers — (1) route-stop API + hook, (2) stop-picker in BusRidersModal, (3) driver GPS push API + hook, (4) Driver Mode panel in GpsScreen using `navigator.geolocation.watchPosition`, (5) bus notification API + hook + BusNotifyModal triggered from the fleet table's new bell icon. No new screens; all changes are within `src/api/` and `src/screens/school/operations.tsx`.

**Tech Stack:** React Query mutations/queries (existing), `navigator.geolocation.watchPosition` (browser native), existing `request()` + `camelToSnake` helpers, existing Modal/Select/Field/Btn/Checkbox/Icon UI components, Vitest for unit tests.

## Global Constraints

- All API functions live in `src/api/operations.ts` — use existing `request()`, `camelToSnake`, `snakeToCamel`, `asList`, `asObj` helpers.
- All React Query hooks live in `src/api/hooks/useOperations.ts` — follow existing `useQuery`/`useMutation` patterns.
- New query keys belong in `src/api/queryKeys.ts` under `operations`.
- Tests go in `src/api/operations.test.ts` — use `vi.stubGlobal('fetch', ...)` pattern established in that file.
- Run `npx vitest run src/api/operations.test.ts` after each API task; run `npx tsc -b --noEmit` after each UI task.
- Frequent small commits — one per task.

---

## File Map

| File | Change |
|---|---|
| `src/api/operations.ts` | Add `RouteStop`, `BusLocationInput`, `SendBusNotificationInput` interfaces; add `listRouteStops`, `updateBusLocation`, `sendBusNotification` functions; add `routeId?` to `FleetBus` |
| `src/api/queryKeys.ts` | Add `transportRouteStops(routeId)` key |
| `src/api/hooks/useOperations.ts` | Add `useRouteStops`, `useUpdateBusLocation`, `useSendBusNotification` hooks |
| `src/api/operations.test.ts` | Add tests for all three new API functions |
| `src/screens/school/operations.tsx` | (1) import new hooks/types, (2) enhance `BusRidersModal` with stop picker, (3) add `DriverModePanel` component, (4) add `BusNotifyModal` component, (5) wire bell icon + `notifyFor` state into `BusFleet` |

---

## Task 1: Route stops — type, API function, query key, hook

**Files:**
- Modify: `src/api/operations.ts` — add `RouteStop` interface, `routeId?` on `FleetBus`, `listRouteStops` function
- Modify: `src/api/queryKeys.ts` — add `transportRouteStops` key
- Modify: `src/api/hooks/useOperations.ts` — add `useRouteStops` hook, import `listRouteStops` + `RouteStop`
- Modify: `src/api/operations.test.ts` — add 2 tests

**Interfaces:**
- Produces: `RouteStop { id, routeId, name, sequence, lat?, lng? }`, `listRouteStops(routeId): Promise<RouteStop[]>`, `useRouteStops(routeId | null): UseQueryResult<RouteStop[]>` — consumed by Tasks 2 and 5.

- [ ] **Step 1: Write failing tests**

Add to the bottom of `src/api/operations.test.ts`:

```typescript
import {
  // existing imports ...
  listRouteStops,
} from './operations'

describe('route stops', () => {
  it('fetches stops and maps snake_case → camelCase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'ST1', route_id: 'R1', name: 'Main Gate', sequence: 1, lat: 28.7041, lng: 77.1025 }],
    })))
    const stops = await listRouteStops('R1')
    expect(stops).toHaveLength(1)
    expect(stops[0]).toEqual({ id: 'ST1', routeId: 'R1', name: 'Main Gate', sequence: 1, lat: 28.7041, lng: 77.1025 })
  })

  it('hits GET /transport/routes/:routeId/stops', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await listRouteStops('R42')
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/transport\/routes\/R42\/stops$/)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```
npx vitest run src/api/operations.test.ts
```
Expected: FAIL — "listRouteStops is not a function"

- [ ] **Step 3: Add `routeId?` to `FleetBus` in `src/api/operations.ts`**

Find the `FleetBus` interface and add one line:

```typescript
export interface FleetBus {
  busId: string
  routeId?: string | null   // ← ADD THIS LINE
  busNo: string
  // ... rest unchanged
```

- [ ] **Step 4: Add `RouteStop` interface and `listRouteStops` in `src/api/operations.ts`**

After the `TransportRoute` / `CreateRouteInput` block, add:

```typescript
export interface RouteStop {
  id: string
  routeId: string
  name: string
  sequence: number
  lat?: number | null
  lng?: number | null
}

export async function listRouteStops(routeId: string): Promise<RouteStop[]> {
  if (!routeId) return []
  return asList<RouteStop>(await request<Record<string, unknown>[]>(`/transport/routes/${routeId}/stops`))
}
```

- [ ] **Step 5: Add `transportRouteStops` key in `src/api/queryKeys.ts`**

After `busStudents` line (currently line 82):

```typescript
busStudents: (busId: string) => ['operations', 'transport', 'busStudents', busId] as const,
transportRouteStops: (routeId: string) => ['operations', 'transport', 'routeStops', routeId] as const,
```

- [ ] **Step 6: Add hook in `src/api/hooks/useOperations.ts`**

Add `listRouteStops` and `RouteStop` to the import block from `'../operations'`.

Add hook after `useTransportRoutes`:

```typescript
export function useRouteStops(routeId: string | null): UseQueryResult<RouteStop[]> {
  return useQuery({
    queryKey: queryKeys.operations.transportRouteStops(routeId ?? ''),
    queryFn: () => listRouteStops(routeId as string),
    enabled: !!routeId,
  })
}
```

- [ ] **Step 7: Run tests**

```
npx vitest run src/api/operations.test.ts
```
Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/api/operations.ts src/api/queryKeys.ts src/api/hooks/useOperations.ts src/api/operations.test.ts
git commit -m "feat(transport): route stops API, query key and hook"
```

---

## Task 2: Stop picker in BusRidersModal

When a bus has a `routeId`, fetch its stops and show a stop-select so the admin can record which stop the student boards/alights at.

**Files:**
- Modify: `src/screens/school/operations.tsx` — import `useRouteStops` + `RouteStop`; replace `BusRidersModal` body

**Interfaces:**
- Consumes: `useRouteStops(routeId | null)` from Task 1, `RouteStop` type.
- Consumes: existing `useAssignStudentToBus` which already accepts `stopId`.

- [ ] **Step 1: Confirm typecheck baseline**

```
npx tsc -b --noEmit
```
Expected: 0 errors

- [ ] **Step 2: Update imports in `src/screens/school/operations.tsx`**

Change the `useOperations` import line from:
```typescript
  useCreateBus, useTransportRoutes, useCreateRoute,
```
to:
```typescript
  useCreateBus, useTransportRoutes, useCreateRoute, useRouteStops,
```

Change the `operations` type import from:
```typescript
import type { FleetBus, TransportRoute, SportsMedal } from '@/api/operations'
```
to:
```typescript
import type { FleetBus, TransportRoute, RouteStop, SportsMedal } from '@/api/operations'
```

- [ ] **Step 3: Replace `BusRidersModal` with stop-aware version**

Find `function BusRidersModal` (currently starts around line 1291). Replace the entire function with:

```tsx
function BusRidersModal({ bus, onClose }: { bus: FleetBus; onClose: () => void }) {
  const toast = useToast()
  const ridersQ = useBusStudents(bus.busId)
  const { data: studentsData } = useStudents()
  const stopsQ = useRouteStops(bus.routeId ?? null)
  const assign = useAssignStudentToBus()
  const unassign = useUnassignStudentFromBus()
  const [pick, setPick] = useState('')
  const [pickStop, setPickStop] = useState('')

  const riders = ridersQ.data ?? []
  const stops: RouteStop[] = stopsQ.data ?? []
  const assignedIds = useMemo(() => new Set(riders.map((r) => r.studentId)), [riders])
  const available = useMemo(
    () => (studentsData ?? []).filter((s) => !assignedIds.has(s.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [studentsData, assignedIds],
  )
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.')

  useEffect(() => { setPickStop('') }, [pick])

  const add = () => {
    if (!pick) return
    assign.mutate({ busId: bus.busId, studentId: pick, stopId: pickStop || null }, {
      onSuccess: () => { toast.success('Rider added', 'Student assigned to this bus.'); setPick(''); setPickStop('') },
      onError: (e) => toast.danger('Could not assign', errMsg(e)),
    })
  }
  const remove = (studentId: string, name: string) => {
    unassign.mutate({ busId: bus.busId, studentId }, {
      onSuccess: () => toast.success('Rider removed', `${name} unassigned.`),
      onError: (e) => toast.danger('Could not remove', errMsg(e)),
    })
  }

  return (
    <Modal open onClose={onClose} size="sm" icon="bus" title={`Riders · Bus ${bus.busNo}`}
      sub={bus.routeName ? `Route: ${bus.routeName}` : 'Assign students who ride this bus'}
      footer={<div className="row jc-end"><Btn variant="ghost" onClick={onClose}>Done</Btn></div>}>
      <div className="col gap16">
        <div className="col gap10">
          <Field label="Add a student">
            <Select value={pick} onChange={(e) => setPick(e.target.value)}
              options={[
                { value: '', label: available.length ? 'Select a student…' : 'All students assigned' },
                ...available.map((s) => ({ value: s.id, label: `${s.name}${s.cls ? ` · ${s.cls}` : ''}` })),
              ]} />
          </Field>
          {stops.length > 0 && (
            <Field label="Boarding / alighting stop" hint="The stop this student uses">
              <Select value={pickStop} onChange={(e) => setPickStop(e.target.value)}
                options={[
                  { value: '', label: 'No specific stop' },
                  ...stops
                    .slice()
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((s) => ({ value: s.id, label: `${s.sequence}. ${s.name}` })),
                ]} />
            </Field>
          )}
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
            {riders.map((r) => (
              <div key={r.studentId} className="row ai-center jc-between gap10"
                style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div className="row ai-center gap10">
                  <Avatar name={r.studentName} />
                  <div>
                    <div className="fw6">{r.studentName}</div>
                    <div className="t-xs muted3">{r.admissionNo}{r.stopName ? ` · Stop: ${r.stopName}` : ''}</div>
                  </div>
                </div>
                <IconBtn icon="trash" title="Remove rider" disabled={unassign.isPending}
                  onClick={() => remove(r.studentId, r.studentName)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Manual browser test**

Open Operations → Transport tab → Manage riders icon on any bus with a `routeId` → confirm stop dropdown appears. On a bus with no routeId, only the student dropdown should show.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/operations.tsx
git commit -m "feat(transport): stop picker in BusRidersModal when route stops are available"
```

---

## Task 3: Driver GPS push — API function and hook

Driver/staff browser pushes GPS to the backend via `PUT /transport/buses/:id/location`.

**Files:**
- Modify: `src/api/operations.ts` — add `BusLocationInput` + `updateBusLocation`
- Modify: `src/api/hooks/useOperations.ts` — add `useUpdateBusLocation`
- Modify: `src/api/operations.test.ts` — add 2 tests

**Interfaces:**
- Produces: `BusLocationInput { lat, lng, speedKmh?, status? }`, `updateBusLocation(busId, input): Promise<void>`, `useUpdateBusLocation(): UseMutationResult<void, Error, { busId } & BusLocationInput>` — consumed by Task 4.

- [ ] **Step 1: Write failing tests**

Add to `src/api/operations.test.ts`:

```typescript
import {
  // existing imports ...
  updateBusLocation,
} from './operations'

describe('bus location update', () => {
  it('PUTs to /transport/buses/:id/location with snake_case body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(noContent())
    vi.stubGlobal('fetch', fetchMock)
    await updateBusLocation('B1', { lat: 28.7041, lng: 77.1025, speedKmh: 42, status: 'on_route' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/transport\/buses\/B1\/location$/)
    expect(opts.method).toBe('PUT')
    const body = JSON.parse(opts.body as string)
    expect(body).toMatchObject({ lat: 28.7041, lng: 77.1025, speed_kmh: 42, status: 'on_route' })
  })

  it('throws when busId is empty', async () => {
    await expect(updateBusLocation('', { lat: 0, lng: 0 })).rejects.toThrow('Bus ID required')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```
npx vitest run src/api/operations.test.ts
```
Expected: FAIL — "updateBusLocation is not a function"

- [ ] **Step 3: Add `BusLocationInput` and `updateBusLocation` in `src/api/operations.ts`**

After `unassignStudentFromBus`, add:

```typescript
export interface BusLocationInput {
  lat: number
  lng: number
  speedKmh?: number
  status?: BusStatus
}

export async function updateBusLocation(busId: string, input: BusLocationInput): Promise<void> {
  if (!busId) throw new Error('Bus ID required')
  await request<void>(`/transport/buses/${busId}/location`, {
    method: 'PUT',
    body: camelToSnake(input),
  })
}
```

- [ ] **Step 4: Add hook in `src/api/hooks/useOperations.ts`**

Add `updateBusLocation` and `BusLocationInput` to the import from `'../operations'`.

Add after `useUnassignStudentFromBus`:

```typescript
export function useUpdateBusLocation(): UseMutationResult<void, Error, { busId: string } & BusLocationInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ busId, ...input }) => updateBusLocation(busId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportFleet })
    },
  })
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/api/operations.test.ts
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/operations.ts src/api/hooks/useOperations.ts src/api/operations.test.ts
git commit -m "feat(transport): bus location update API and hook for driver GPS push"
```

---

## Task 4: Driver Mode panel in GpsScreen

A card where driver/staff picks their bus and presses "Start tracking". The browser's `navigator.geolocation.watchPosition` fires on each GPS update and calls `useUpdateBusLocation` automatically.

**Files:**
- Modify: `src/screens/school/operations.tsx` — add `DriverModePanel` component; import `useUpdateBusLocation`; mount it inside `GpsScreen`

**Interfaces:**
- Consumes: `useUpdateBusLocation` from Task 3, `FleetBus[]` (passed as prop), existing `Select`, `Field`, `Btn`, `Card`, `CardHead`, `Icon`, `Badge` UI components.

- [ ] **Step 1: Import `useUpdateBusLocation` in `src/screens/school/operations.tsx`**

Add to the `useOperations` import line:
```typescript
  useUpdateBusLocation,
```

- [ ] **Step 2: Add `DriverModePanel` component**

Add this function directly BEFORE `function GpsScreen()`:

```tsx
function DriverModePanel({ fleet }: { fleet: FleetBus[] }) {
  const toast = useToast()
  const updateLocation = useUpdateBusLocation()
  const [driverBusId, setDriverBusId] = useState('')
  const [tracking, setTracking] = useState(false)
  const [lastPush, setLastPush] = useState<string | null>(null)
  const watchRef = useRef<number | null>(null)

  const start = () => {
    if (!driverBusId) { toast.danger('Select a bus', 'Pick your bus before starting.'); return }
    if (!navigator.geolocation) { toast.danger('GPS unavailable', 'Your browser does not support geolocation.'); return }
    setTracking(true)
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        updateLocation.mutate({
          busId: driverBusId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speedKmh: pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : undefined,
          status: 'on_route',
        })
        setLastPush(new Date().toLocaleTimeString())
      },
      (err) => { toast.danger('GPS error', err.message); setTracking(false) },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }

  const stop = () => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
    setTracking(false)
    if (driverBusId) updateLocation.mutate({ busId: driverBusId, lat: 0, lng: 0, status: 'idle' })
  }

  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }, [])

  return (
    <Card>
      <CardHead title="Driver mode" sub="Push your live GPS so the fleet map stays current" icon="pin" />
      <div className="col gap14" style={{ marginTop: 14 }}>
        <div className="row ai-end gap10 wrap">
          <div style={{ flex: '0 0 240px' }}>
            <Field label="Your bus">
              <Select value={driverBusId} onChange={(e) => setDriverBusId(e.target.value)} disabled={tracking}
                options={[
                  { value: '', label: 'Select bus…' },
                  ...fleet.map((b) => ({ value: b.busId, label: `Bus ${b.busNo}${b.routeName ? ` · ${b.routeName}` : ''}` })),
                ]} />
            </Field>
          </div>
          {!tracking
            ? <Btn variant="primary" icon="zap" onClick={start}>Start tracking</Btn>
            : <Btn variant="danger" icon="x" onClick={stop}>Stop tracking</Btn>}
          {tracking && (
            <div className="row ai-center gap8">
              <span className="sm-dot-live" />
              <span className="t-sm">{lastPush ? `Last push: ${lastPush}` : 'Waiting for GPS…'}</span>
            </div>
          )}
        </div>
        {tracking && (
          <div className="t-xs muted3">
            Location is being pushed automatically. Keep this tab open while driving.
          </div>
        )}
      </div>
    </Card>
  )
}
```

- [ ] **Step 3: Mount `DriverModePanel` inside `GpsScreen`**

Inside `GpsScreen`, find:

```tsx
<Card pad={false}><BusFleet fleet={fleet} loading={fleetQ.isLoading} error={fleetQ.isError} /></Card>

<TierGate feature="transport.gps"
```

Insert `<DriverModePanel fleet={fleet} />` between them:

```tsx
<Card pad={false}><BusFleet fleet={fleet} loading={fleetQ.isLoading} error={fleetQ.isError} /></Card>

<DriverModePanel fleet={fleet} />

<TierGate feature="transport.gps"
```

- [ ] **Step 4: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Manual browser test**

Navigate to GPS screen (sidebar → Live bus tracking). Scroll to "Driver mode" card. Select a bus. Click "Start tracking". Browser will ask for location permission. Grant it. Confirm "Last push: HH:MM:SS" appears and updates. Fleet map markers should move within the 5 s polling cycle. Click "Stop tracking" — status icon should turn idle.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/operations.tsx
git commit -m "feat(transport): driver mode panel — browser geolocation pushes live bus position"
```

---

## Task 5: Parent bus notifications — API, hook, modal, bell icon

Admin selects an event (departed / approaching / arrived) and an optional stop, then sends push + SMS to all parents of riders on that bus.

**Files:**
- Modify: `src/api/operations.ts` — add `SendBusNotificationInput` + `sendBusNotification`
- Modify: `src/api/hooks/useOperations.ts` — add `useSendBusNotification`
- Modify: `src/api/operations.test.ts` — add 2 tests
- Modify: `src/screens/school/operations.tsx` — add `BusNotifyModal`; add `notifyFor` state + bell `IconBtn` to `BusFleet`

**Interfaces:**
- Produces: `sendBusNotification(busId, input): Promise<{ reach: number }>`, `useSendBusNotification()`.
- Consumes: `useRouteStops` from Task 1, `RouteStop` type.

- [ ] **Step 1: Write failing tests**

Add to `src/api/operations.test.ts`:

```typescript
import {
  // existing imports ...
  sendBusNotification,
} from './operations'

describe('bus parent notifications', () => {
  it('POSTs notify event with snake_case body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { reach: 38 } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendBusNotification('B1', { eventType: 'departed', channels: ['push', 'sms'] })
    expect(result.reach).toBe(38)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/transport\/buses\/B1\/notify$/)
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body).toMatchObject({ event_type: 'departed', channels: ['push', 'sms'] })
  })

  it('includes stop_id when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { reach: 12 } }))
    vi.stubGlobal('fetch', fetchMock)
    await sendBusNotification('B1', { eventType: 'approaching', stopId: 'ST5', channels: ['push'] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ event_type: 'approaching', stop_id: 'ST5' })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```
npx vitest run src/api/operations.test.ts
```
Expected: FAIL — "sendBusNotification is not a function"

- [ ] **Step 3: Add interface and function in `src/api/operations.ts`**

After `updateBusLocation`, add:

```typescript
export interface SendBusNotificationInput {
  eventType: 'departed' | 'approaching' | 'arrived'
  stopId?: string | null
  channels: ('push' | 'sms')[]
}

export async function sendBusNotification(busId: string, input: SendBusNotificationInput): Promise<{ reach: number }> {
  if (!busId) throw new Error('Bus ID required')
  return request<{ reach: number }>(`/transport/buses/${busId}/notify`, {
    method: 'POST',
    body: camelToSnake(input),
  })
}
```

- [ ] **Step 4: Add hook in `src/api/hooks/useOperations.ts`**

Add `sendBusNotification` and `SendBusNotificationInput` to the import from `'../operations'`.

Add after `useUpdateBusLocation`:

```typescript
export function useSendBusNotification(): UseMutationResult<{ reach: number }, Error, { busId: string } & SendBusNotificationInput> {
  return useMutation({
    mutationFn: ({ busId, ...input }) => sendBusNotification(busId, input),
  })
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/api/operations.test.ts
```
Expected: all PASS

- [ ] **Step 6: Import `useSendBusNotification` in `src/screens/school/operations.tsx`**

Add to the `useOperations` import line:
```typescript
  useSendBusNotification,
```

- [ ] **Step 7: Add `BusNotifyModal` component**

Add this function directly BEFORE `function DriverModePanel`:

```tsx
function BusNotifyModal({ bus, onClose }: { bus: FleetBus; onClose: () => void }) {
  const toast = useToast()
  const notify = useSendBusNotification()
  const stopsQ = useRouteStops(bus.routeId ?? null)
  const stops: RouteStop[] = stopsQ.data ?? []

  const [eventType, setEventType] = useState<'departed' | 'approaching' | 'arrived'>('departed')
  const [stopId, setStopId] = useState('')
  const [usePush, setUsePush] = useState(true)
  const [useSms, setUseSms] = useState(true)

  const channels = [...(usePush ? ['push'] : []), ...(useSms ? ['sms'] : [])] as ('push' | 'sms')[]

  const send = () => {
    if (channels.length === 0) { toast.danger('Pick a channel', 'Choose at least one notification channel.'); return }
    notify.mutate(
      { busId: bus.busId, eventType, stopId: stopId || null, channels },
      {
        onSuccess: ({ reach }) => {
          toast.success('Parents notified', `${reach} parent${reach === 1 ? '' : 's'} alerted.`)
          onClose()
        },
        onError: (e) => toast.danger('Could not send', e instanceof Error ? e.message : 'Please try again.'),
      },
    )
  }

  const EVENT_LABELS: Record<typeof eventType, string> = {
    departed: 'Bus has departed',
    approaching: 'Bus is approaching a stop',
    arrived: 'Bus has arrived at stop',
  }

  return (
    <Modal open onClose={onClose} size="sm" icon="bell" title={`Notify parents · Bus ${bus.busNo}`}
      sub="Send a real-time alert to parents of students riding this bus"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="bell" disabled={notify.isPending || channels.length === 0} onClick={send}>
            {notify.isPending ? 'Sending…' : 'Send alert'}
          </Btn>
        </div>
      }>
      <div className="col gap16">
        <Field label="Event type">
          <Select value={eventType} onChange={(e) => setEventType(e.target.value as typeof eventType)}
            options={[
              { value: 'departed', label: 'Bus departed' },
              { value: 'approaching', label: 'Approaching stop' },
              { value: 'arrived', label: 'Arrived at stop' },
            ]} />
        </Field>
        {(eventType === 'approaching' || eventType === 'arrived') && stops.length > 0 && (
          <Field label="Which stop?" hint="Leave blank to send for all stops">
            <Select value={stopId} onChange={(e) => setStopId(e.target.value)}
              options={[
                { value: '', label: 'All stops / not specified' },
                ...stops.sort((a, b) => a.sequence - b.sequence).map((s) => ({ value: s.id, label: `${s.sequence}. ${s.name}` })),
              ]} />
          </Field>
        )}
        <Field label="Channels">
          <div className="row gap16">
            <Checkbox label="Push notification" checked={usePush} onChange={() => setUsePush((v) => !v)} />
            <Checkbox label="SMS" checked={useSms} onChange={() => setUseSms((v) => !v)} />
          </div>
        </Field>
        <div className="t-xs muted3 row ai-center gap6">
          <Icon name="users" size={12} />
          <span>"{EVENT_LABELS[eventType]}{bus.routeName ? ` · Route ${bus.routeName}` : ''} · Bus {bus.busNo}"</span>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 8: Add `notifyFor` state and bell icon to `BusFleet`**

In `function BusFleet` (around line 1221), add `notifyFor` alongside `ridersFor`:

```typescript
  const [ridersFor, setRidersFor] = useState<FleetBus | null>(null)
  const [notifyFor, setNotifyFor] = useState<FleetBus | null>(null)
```

Find the `riders` column definition (around line 1258–1263):

```typescript
    {
      key: 'riders', label: '', align: 'right',
      render: (r) => (
        <IconBtn icon="users" title="Manage riders" onClick={() => setRidersFor(r)} />
      ),
    },
```

Replace with:

```typescript
    {
      key: 'riders', label: '', align: 'right',
      render: (r) => (
        <div className="row gap6 jc-end">
          <IconBtn icon="bell" title="Notify parents" onClick={() => setNotifyFor(r)} />
          <IconBtn icon="users" title="Manage riders" onClick={() => setRidersFor(r)} />
        </div>
      ),
    },
```

Find the end of the `BusFleet` return (around line 1282–1285):

```tsx
      {ridersFor && (
        <BusRidersModal bus={ridersFor} onClose={() => setRidersFor(null)} />
      )}
```

Add `BusNotifyModal` after it:

```tsx
      {ridersFor && (
        <BusRidersModal bus={ridersFor} onClose={() => setRidersFor(null)} />
      )}
      {notifyFor && (
        <BusNotifyModal bus={notifyFor} onClose={() => setNotifyFor(null)} />
      )}
```

- [ ] **Step 9: Typecheck**

```
npx tsc -b --noEmit
```
Expected: 0 errors

- [ ] **Step 10: Manual browser test**

GPS screen → fleet table → **bell** icon on any bus → `BusNotifyModal` opens. Select "Approaching stop". If bus has a routeId the stop dropdown appears. Check both channels. "Send alert" → toast shows "X parents alerted." Cancel → modal closes cleanly.

- [ ] **Step 11: Commit**

```bash
git add src/api/operations.ts src/api/hooks/useOperations.ts src/api/operations.test.ts src/screens/school/operations.tsx
git commit -m "feat(transport): parent bus notifications — bell icon, notify modal, departed/approaching/arrived events"
```

---

## Self-Review Checklist

| Requirement | Covered |
|---|---|
| Monitor bus location by driver/staff app | Task 4 — Driver Mode panel + geolocation.watchPosition |
| Real-time fleet update | Existing 5 s polling + PUT /location invalidates transportFleet key |
| Show route stops when student assigned to bus | Task 1 (API) + Task 2 (stop picker in BusRidersModal) |
| Parent sees bus moving notification | Task 5 — BusNotifyModal with departed/approaching/arrived events |
| Parent SMS + push | Task 5 — channels: ['push', 'sms'] |
| Stop-specific approaching/arrived alerts | Task 5 — stop picker appears when eventType is approaching/arrived |
| Tests for new API functions | Tasks 1, 3, 5 — each have 2 unit tests |
| TypeScript clean | Checked after each UI task |
| Frequent commits | One commit per task (5 commits total) |
