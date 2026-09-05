/* ============================================================
   Transport module — dashboard, routes & route builder
   ============================================================ */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { tierIncludes } from '@/lib/gating'
import {
  PageHead, Card, CardHead, Kpi, Btn, Badge, Field, Input, Modal, Empty, IconBtn, Icon, Select,
} from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import {
  useTransportSummary, useTransportFleet, useTransportRoutes, useCreateRoute,
  useRouteStops, useCreateRouteStop, useUpdateRouteStop, useDeleteRouteStop, useReorderRouteStops,
  useTransportBuses, useCreateBus, useUpdateBus,
} from '@/api/hooks/useOperations'
import { useStaff } from '@/api/hooks/useStaff'
import type { TransportRoute, RouteStop, TransportBus } from '@/api/operations'
import { RouteBuilderMap } from '@/components/maps/RouteBuilderMap'
import { normalizeStaffCategory, staffCategoryLabel } from '@/lib/staffCategory'
import { routeMetrics } from '@/lib/routeMetrics'

const OPEN_ROUTE_KEY = 'sm.transport.openRouteId'
const OPEN_BUS_KEY = 'sm.transport.openBusId'

function openRouteBuilder(app: ReturnType<typeof useApp>, routeId: string) {
  try { sessionStorage.setItem(OPEN_ROUTE_KEY, routeId) } catch { /* ignore */ }
  app.go('school.transport.routes')
}

function openBusEditor(app: ReturnType<typeof useApp>, busId: string) {
  try { sessionStorage.setItem(OPEN_BUS_KEY, busId) } catch { /* ignore */ }
  app.go('school.transport.buses')
}

function TransportApiError({ message }: { message: string }) {
  return (
    <div className="t-sm" style={{ padding: 12, marginBottom: 12, borderRadius: 10, background: 'var(--danger-bg)', color: 'var(--danger)' }}>
      {message}
    </div>
  )
}

function kpiVal(loading: boolean, err: boolean, val: number | undefined, fmt: (n: number) => string): string {
  if (loading) return '…'
  if (err || val == null) return '—'
  return fmt(val)
}

function TransportDashboardBody() {
  const app = useApp()
  const summary = useTransportSummary()
  const routesQ = useTransportRoutes()
  const busesQ = useTransportBuses()
  const fleetQ = useTransportFleet(true, 15_000)
  const fleet = fleetQ.data ?? []
  const routes = routesQ.data ?? []
  const buses = busesQ.data ?? []
  const active = fleet.filter((b) => b.status === 'on_route' || b.status === 'delayed' || b.status === 'at_stop').length
  const gpsLive = fleet.filter((b) => b.lat != null && b.lng != null).length
  const [routeModalOpen, setRouteModalOpen] = useState(false)
  const [busModalOpen, setBusModalOpen] = useState(false)

  return (
    <div>
      <PageHead title="Transport" sub="Routes, buses, live GPS & student assignments"
        actions={
          <div className="row gap8 wrap">
            <Btn variant="secondary" icon="plus" onClick={() => setRouteModalOpen(true)}>Add route</Btn>
            <Btn variant="primary" icon="plus" onClick={() => setBusModalOpen(true)}>Add bus</Btn>
          </div>
        } />
      <div className="col gap16">
        <div className="sm-kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Kpi icon="bus" label="Vehicles" value={kpiVal(summary.isLoading, summary.isError, summary.data?.vehicles, (n) => String(n))} />
          <Kpi icon="pin" iconBg="var(--info-bg)" iconColor="var(--info)" label="Routes" value={kpiVal(summary.isLoading, summary.isError, summary.data?.routes, (n) => String(n))} />
          <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Students" value={kpiVal(summary.isLoading, summary.isError, summary.data?.students, (n) => String(n))} />
          <Kpi icon="zap" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Active now" value={String(active)} />
        </div>

        <div className="sm-grid-2 gap16">
          <Card pad={false}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <CardHead title="Routes" icon="pin"
                action={
                  <div className="row gap6">
                    <Btn variant="ghost" size="sm" icon="plus" onClick={() => setRouteModalOpen(true)}>Add</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => app.go('school.transport.routes')}>All</Btn>
                  </div>
                } />
            </div>
            {routesQ.isError ? (
              <div style={{ padding: 16 }}>
                <TransportApiError message="Could not load routes. Check your connection and that Operations is enabled on your plan." />
                <Btn variant="secondary" size="sm" onClick={() => routesQ.refetch()}>Retry</Btn>
              </div>
            ) : routesQ.isLoading ? (
              <div className="t-sm muted" style={{ padding: 16 }}>Loading…</div>
            ) : routes.length === 0 ? (
              <Empty icon="pin" title="No routes" body="Create a route, then place stops on the map."
                action={<Btn variant="primary" size="sm" onClick={() => setRouteModalOpen(true)}>Add route</Btn>} />
            ) : (
              <div>
                {routes.slice(0, 6).map((r) => (
                  <div key={r.id} className="row ai-center jc-between gap10" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div className="fw6">{r.name}</div>
                      <div className="t-xs muted3">{r.stops} stop{r.stops === 1 ? '' : 's'}</div>
                    </div>
                    <Btn variant="ghost" size="sm" onClick={() => openRouteBuilder(app, r.id)}>Open builder</Btn>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card pad={false}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <CardHead title="Buses" icon="bus"
                action={
                  <div className="row gap6">
                    <Btn variant="ghost" size="sm" icon="plus" onClick={() => setBusModalOpen(true)}>Add</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => app.go('school.transport.buses')}>All</Btn>
                  </div>
                } />
            </div>
            {busesQ.isError ? (
              <div style={{ padding: 16 }}>
                <TransportApiError message="Could not load buses. Restart the API if you recently updated transport." />
                <Btn variant="secondary" size="sm" onClick={() => busesQ.refetch()}>Retry</Btn>
              </div>
            ) : busesQ.isLoading ? (
              <div className="t-sm muted" style={{ padding: 16 }}>Loading…</div>
            ) : buses.length === 0 ? (
              <Empty icon="bus" title="No buses" body="Add a vehicle and assign a route and driver."
                action={<Btn variant="primary" size="sm" onClick={() => setBusModalOpen(true)}>Add bus</Btn>} />
            ) : (
              <div>
                {buses.slice(0, 6).map((b) => (
                  <div key={b.busId} className="row ai-center jc-between gap10" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="fw6">{b.busNo}</div>
                      <div className="t-xs muted3 truncate">{b.routeName ?? 'No route'}{b.driver ? ` · ${b.driver}` : ''}</div>
                    </div>
                    <Btn variant="ghost" size="sm" onClick={() => openBusEditor(app, b.busId)}>Edit</Btn>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="sm-grid-2 gap16">
          <Card>
            <CardHead title="Quick actions" icon="zap" />
            <div className="row gap10 wrap" style={{ marginTop: 12 }}>
              <Btn variant="secondary" icon="pin" onClick={() => app.go('school.transport.routes')}>Route builder</Btn>
              <Btn variant="secondary" icon="bus" onClick={() => app.go('school.transport.buses')}>Fleet list</Btn>
              {tierIncludes(app.plan, 'transport.gps') && (
                <Btn variant="secondary" icon="zap" onClick={() => app.go('school.gps')}>Live tracking</Btn>
              )}
            </div>
          </Card>
          <Card>
            <CardHead title="Live GPS" icon="zap" action={gpsLive > 0 ? <Badge tone="success" soft dot>{gpsLive} on map</Badge> : null} />
            <div className="t-sm muted" style={{ marginTop: 8 }}>
              {tierIncludes(app.plan, 'transport.gps')
                ? `${gpsLive} bus${gpsLive === 1 ? '' : 'es'} reporting position. Open live tracking for the full map.`
                : 'Upgrade to Platinum for live GPS bus tracking.'}
            </div>
          </Card>
        </div>
      </div>

      <CreateRouteModal open={routeModalOpen} onClose={() => setRouteModalOpen(false)}
        onCreated={(r) => openRouteBuilder(app, r.id)} />
      <BusEditModal open={busModalOpen} bus={null} onClose={() => setBusModalOpen(false)} />
    </div>
  )
}

function TransportDashboard() {
  return (
    <TierGate feature="operations" title="Transport" blurb="School bus transport management is available on the Platinum plan.">
      <TransportDashboardBody />
    </TierGate>
  )
}

function CreateRouteModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated?: (route: TransportRoute) => void }) {
  const toast = useToast()
  const create = useCreateRoute()
  const [name, setName] = useState('')
  const [stops, setStops] = useState('5')

  useEffect(() => { if (open) { setName(''); setStops('5') } }, [open])

  const submit = () => {
    create.mutate({ name, stops: Number(stops) || 5 }, {
      onSuccess: (r) => {
        toast.success('Route created', `${r.name} — open the route builder to place stops on the map.`)
        onCreated?.(r)
        onClose()
      },
      onError: (e) => toast.danger('Could not create route', e.message),
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" icon="pin" title="New route"
      sub="Stops are created as placeholders — place them on the map in the route builder."
      footer={<div className="row gap8 jc-end"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={submit} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Create'}</Btn></div>}>
      <div className="col gap14">
        <Field label="Route name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North Campus Loop" /></Field>
        <Field label="Initial stops" hint="Placeholder count (max 50)"><Input type="number" min={1} max={50} value={stops} onChange={(e) => setStops(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function RouteBuilder({ route, onBack }: { route: TransportRoute; onBack: () => void }) {
  const toast = useToast()
  const stopsQ = useRouteStops(route.id)
  const stops = stopsQ.data ?? []
  const createStop = useCreateRouteStop()
  const updateStop = useUpdateRouteStop()
  const deleteStop = useDeleteRouteStop()
  const reorder = useReorderRouteStops()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const sorted = useMemo(() => [...stops].sort((a, b) => a.sequence - b.sequence), [stops])
  const placed = sorted.filter((s) => (s.lat ?? 0) !== 0 || (s.lng ?? 0) !== 0)
  const metrics = routeMetrics(placed.map((s) => ({ lat: s.lat as number, lng: s.lng as number })))

  const selectStop = (stop: RouteStop) => {
    setSelectedId(stop.id)
    setEditName(stop.name)
  }

  const moveStop = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= sorted.length) return
    const ids = sorted.map((s) => s.id)
    const [item] = ids.splice(index, 1)
    ids.splice(j, 0, item)
    reorder.mutate({ routeId: route.id, stopIds: ids }, {
      onError: (e) => toast.danger('Reorder failed', e.message),
    })
  }

  const handleMapClick = (lat: number, lng: number) => {
    if (selectedId) {
      const stop = stops.find((s) => s.id === selectedId)
      if (!stop) return
      updateStop.mutate({
        routeId: route.id,
        stopId: selectedId,
        input: { name: editName.trim() || stop.name, lat, lng },
      }, {
        onSuccess: () => toast.success('Stop updated', 'Position saved on the route.'),
        onError: (e) => toast.danger('Could not update stop', e.message),
      })
      return
    }
    const n = stops.length + 1
    createStop.mutate({
      routeId: route.id,
      input: { name: `Stop ${n}`, lat, lng },
    }, {
      onSuccess: (s) => { selectStop(s); toast.success('Stop added', s.name) },
      onError: (e) => toast.danger('Could not add stop', e.message),
    })
  }

  const saveName = () => {
    if (!selectedId) return
    const stop = stops.find((s) => s.id === selectedId)
    if (!stop) return
    updateStop.mutate({
      routeId: route.id,
      stopId: selectedId,
      input: { name: editName.trim() || stop.name, lat: stop.lat ?? 0, lng: stop.lng ?? 0 },
    }, {
      onSuccess: () => toast.success('Saved', 'Stop name updated.'),
      onError: (e) => toast.danger('Could not save', e.message),
    })
  }

  const removeStop = (stopId: string) => {
    deleteStop.mutate({ routeId: route.id, stopId }, {
      onSuccess: () => { if (selectedId === stopId) setSelectedId(null) },
      onError: (e) => toast.danger('Could not delete', e.message),
    })
  }

  return (
    <div className="col gap16">
      <PageHead
        title={route.name}
        sub="Route builder · click map to add or move stops"
        actions={<Btn variant="ghost" icon="arrowLeft" onClick={onBack}>Back to routes</Btn>}
      />
      <div className="row gap8 wrap">
        <Badge tone="info" soft>{placed.length} placed</Badge>
        <Badge tone="neutral" soft>{metrics.distanceKm} km</Badge>
        <Badge tone="neutral" soft>~{metrics.durationMin} min</Badge>
      </div>
      <div className="sm-grid-2 gap16" style={{ alignItems: 'start' }}>
        <Card pad={false}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <CardHead title="Stops" sub="Reorder · select then click map to place" icon="pin" />
          </div>
          {stopsQ.isLoading ? <div style={{ padding: 24 }} className="muted t-sm">Loading…</div> : sorted.length === 0 ? (
            <Empty icon="pin" title="No stops" body="Click the map to add the first stop." />
          ) : (
            <div className="col" style={{ maxHeight: 420, overflow: 'auto' }}>
              {sorted.map((s, i) => {
                const unplaced = (s.lat ?? 0) === 0 && (s.lng ?? 0) === 0
                const active = s.id === selectedId
                return (
                  <div
                    key={s.id}
                    className="row ai-center gap8"
                    style={{
                      padding: '10px 14px', borderBottom: '1px solid var(--border)',
                      background: active ? 'var(--brand-50, rgba(37,99,235,0.08))' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => selectStop(s)}
                  >
                    <span className="fw7 t-sm" style={{ width: 22 }}>{s.sequence}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="fw6 t-md truncate">{s.name}</div>
                      <div className="t-xs muted3">{unplaced ? 'Not on map — select & click map' : `${(s.lat as number).toFixed(4)}, ${(s.lng as number).toFixed(4)}`}</div>
                    </div>
                    <IconBtn icon="chevUp" title="Move up" disabled={i === 0 || reorder.isPending} onClick={(e) => { e.stopPropagation(); moveStop(i, -1) }} />
                    <IconBtn icon="chevDown" title="Move down" disabled={i === sorted.length - 1 || reorder.isPending} onClick={(e) => { e.stopPropagation(); moveStop(i, 1) }} />
                    <IconBtn icon="trash" title="Delete" onClick={(e) => { e.stopPropagation(); removeStop(s.id) }} />
                  </div>
                )
              })}
            </div>
          )}
          {selectedId && (
            <div style={{ padding: 14, borderTop: '1px solid var(--border)' }} className="col gap10">
              <Field label="Stop name">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={saveName} />
              </Field>
              <div className="t-xs muted3 row ai-center gap6">
                <Icon name="pin" size={12} />
                Click the map to set or move this stop&apos;s position.
              </div>
            </div>
          )}
        </Card>
        <RouteBuilderMap
          stops={stops}
          height={420}
          selectedStopId={selectedId}
          onMapClick={handleMapClick}
          onStopClick={(stopId) => {
            const s = stops.find((x) => x.id === stopId)
            if (s) selectStop(s)
          }}
        />
      </div>
    </div>
  )
}

function TransportRoutesBody() {
  const routesQ = useTransportRoutes()
  const routes = routesQ.data ?? []
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TransportRoute | null>(null)

  useEffect(() => {
    if (routesQ.isLoading || routes.length === 0) return
    try {
      const id = sessionStorage.getItem(OPEN_ROUTE_KEY)
      if (!id) return
      const r = routes.find((x) => x.id === id)
      if (r) setEditing(r)
      sessionStorage.removeItem(OPEN_ROUTE_KEY)
    } catch { /* ignore */ }
  }, [routes, routesQ.isLoading])

  if (editing) return <RouteBuilder route={editing} onBack={() => setEditing(null)} />

  return (
    <div>
      <PageHead title="Routes" sub="Build routes on the map · assign buses in Operations"
        actions={<Btn variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>New route</Btn>} />
      <Card pad={false}>
        {routesQ.isError ? (
          <div style={{ padding: 24 }}>
            <TransportApiError message="Could not load routes." />
            <Btn variant="secondary" size="sm" onClick={() => routesQ.refetch()}>Retry</Btn>
          </div>
        ) : routesQ.isLoading ? <div style={{ padding: 24 }} className="muted">Loading routes…</div> : routes.length === 0 ? (
          <Empty icon="pin" title="No routes yet" body="Create a route then place stops on the map." action={<Btn variant="primary" onClick={() => setCreateOpen(true)}>Create route</Btn>} />
        ) : (
          <div>
            {routes.map((r) => (
              <div key={r.id} className="row ai-center jc-between gap12" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div className="fw6 t-lg">{r.name}</div>
                  <div className="t-sm muted3">{r.stops} stop{r.stops === 1 ? '' : 's'}</div>
                </div>
                <Btn variant="secondary" icon="pin" onClick={() => setEditing(r)}>Open builder</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>
      <CreateRouteModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function TransportRoutes() {
  return (
    <TierGate feature="operations" title="Transport routes" blurb="Route management requires the Platinum Operations module.">
      <TransportRoutesBody />
    </TierGate>
  )
}

function BusEditModal({
  open, bus, onClose,
}: { open: boolean; bus: TransportBus | null; onClose: () => void }) {
  const toast = useToast()
  const routes = useTransportRoutes()
  const driversQ = useStaff({ cat: 'all' })
  const create = useCreateBus()
  const update = useUpdateBus()
  const isEdit = bus != null
  const [busNo, setBusNo] = useState('')
  const [routeId, setRouteId] = useState('')
  const [driverStaffId, setDriverStaffId] = useState('')
  const [conductorStaffId, setConductorStaffId] = useState('')

  useEffect(() => {
    if (!open) return
    setBusNo(bus?.busNo ?? '')
    setRouteId(bus?.routeId ?? '')
    setDriverStaffId(bus?.driverStaffId ?? '')
    setConductorStaffId(bus?.conductorStaffId ?? '')
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
          conductorStaffId: conductorStaffId || null,
          clearConductor: !conductorStaffId,
        })
        toast.success('Bus updated')
      } else {
        await create.mutateAsync({
          busNo: trimmed,
          routeId: routeId || null,
          driverStaffId: driverStaffId || null,
          conductorStaffId: conductorStaffId || null,
        })
        toast.success('Bus added')
      }
      onClose()
    } catch (e) {
      toast.danger('Could not save bus', e instanceof Error ? e.message : 'Unknown error')
    }
  }

  const routeOpts = routes.data ?? []
  const driverOpts = driversQ.data ?? []
  const busy = create.isPending || update.isPending
  const driverSelectOptions = [
    { value: '', label: driversQ.isLoading ? 'Loading staff…' : '— Unassigned —' },
    ...driverOpts.map((s) => ({
      value: s.id,
      label: `${s.name} · ${staffCategoryLabel(s.cat, s.dept, s.role)}`,
    })),
  ]
  const conductorSelectOptions = [
    { value: '', label: driversQ.isLoading ? 'Loading staff…' : '— Unassigned —' },
    ...driverOpts.filter((s) => s.id !== driverStaffId).map((s) => ({
      value: s.id,
      label: `${s.name} · ${staffCategoryLabel(s.cat, s.dept, s.role)}`,
    })),
  ]
  const routeSelectOptions = [
    { value: '', label: '— No route —' },
    ...routeOpts.map((r) => ({ value: r.id, label: `${r.name} (${r.stops} stops)` })),
  ]

  return (
    <Modal open={open} onClose={onClose} size="sm" icon="bus"
      title={isEdit ? `Edit bus ${bus?.busNo}` : 'Add bus'}
      sub="Assign a route and transport staff driver."
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      }>
      <div className="col gap14">
        <Field label="Bus number" required>
          <Input value={busNo} onChange={(e) => setBusNo(e.target.value)} placeholder="e.g. BUS-01" />
        </Field>
        <Field label="Route">
          <Select value={routeId} onChange={(e) => setRouteId(e.target.value)} options={routeSelectOptions} />
        </Field>
        <Field label="Driver (staff)" hint={driversQ.isError ? 'Could not load staff list' : 'Pick any staff member; transport drivers are usually category Transport'}>
          <Select value={driverStaffId} onChange={(e) => setDriverStaffId(e.target.value)} options={driverSelectOptions} disabled={driversQ.isLoading} />
        </Field>
        <Field label="Conductor / helper (staff)" hint="Optional — a second staff member assigned to this bus">
          <Select value={conductorStaffId} onChange={(e) => setConductorStaffId(e.target.value)} options={conductorSelectOptions} disabled={driversQ.isLoading} />
        </Field>
      </div>
    </Modal>
  )
}

function TransportBusesBody() {
  const busesQ = useTransportBuses()
  const buses = busesQ.data ?? []
  const staffQ = useStaff()
  const staffById = useMemo(() => new Map((staffQ.data ?? []).map((s) => [s.id, s.name])), [staffQ.data])
  const [editBus, setEditBus] = useState<TransportBus | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (busesQ.isLoading || buses.length === 0) return
    try {
      const id = sessionStorage.getItem(OPEN_BUS_KEY)
      if (!id) return
      const b = buses.find((x) => x.busId === id)
      if (b) setEditBus(b)
      sessionStorage.removeItem(OPEN_BUS_KEY)
    } catch { /* ignore */ }
  }, [buses, busesQ.isLoading])

  return (
    <div>
      <PageHead title="Buses" sub="Fleet vehicles, route assignment & drivers"
        actions={<Btn variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>Add bus</Btn>} />
      <Card>
        {busesQ.isError ? (
          <div style={{ padding: 16 }}>
            <TransportApiError message="Could not load buses." />
            <Btn variant="secondary" size="sm" onClick={() => busesQ.refetch()}>Retry</Btn>
          </div>
        ) : busesQ.isLoading ? <div className="t-sm muted" style={{ padding: 16 }}>Loading…</div> : buses.length === 0 ? (
          <Empty icon="bus" title="No buses yet" body="Add a vehicle and assign a route and driver." />
        ) : (
          <table className="sm-table">
            <thead>
              <tr>
                <th>Bus</th><th>Route</th><th>Driver</th><th>Conductor</th><th>Stops</th><th>Students</th><th />
              </tr>
            </thead>
            <tbody>
              {buses.map((b) => (
                <tr key={b.busId}>
                  <td className="fw6">{b.busNo}</td>
                  <td>{b.routeName ?? '—'}</td>
                  <td>{b.driver ?? '—'}{b.driverPhone ? ` · ${b.driverPhone}` : ''}</td>
                  <td>{b.conductorStaffId ? (staffById.get(b.conductorStaffId) ?? '—') : '—'}</td>
                  <td>{b.stopCount}</td>
                  <td>{b.studentsAssigned}</td>
                  <td><IconBtn icon="edit" title="Edit" onClick={() => setEditBus(b)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <BusEditModal open={createOpen} bus={null} onClose={() => setCreateOpen(false)} />
      <BusEditModal open={editBus != null} bus={editBus} onClose={() => setEditBus(null)} />
    </div>
  )
}

function TransportBuses() {
  return (
    <TierGate feature="operations" title="Buses" blurb="Bus fleet management requires the Platinum Operations module.">
      <TransportBusesBody />
    </TierGate>
  )
}

export const transportScreens: Record<string, ComponentType> = {
  'school.transport': TransportDashboard,
  'school.transport.routes': TransportRoutes,
  'school.transport.buses': TransportBuses,
}
