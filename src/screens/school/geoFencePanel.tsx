/* ============================================================
   Geo-fence (Platinum) — campus setup + live check-in monitor
   ============================================================ */
import { useMemo } from 'react'
import { useApp } from '@/lib/hooks'
import {
  Card, CardHead, Badge, Icon, Empty,
} from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { CampusGeofenceSettings } from '@/components/school/CampusGeofenceSettings'
import { useTeachers } from '@/api/hooks/useTeachers'
import { useStaff } from '@/api/hooks/useStaff'
import { usePrincipalAttendance } from '@/api/hooks/usePrincipalAttendance'
import { useSchoolLocation } from '@/api/hooks/useSchoolLocation'
import {
  resolveGeoAttendancePeople, countFenceStatus,
  type GeoAttendancePerson, type FenceStatus,
} from '@/lib/geoAttendanceDemo'
import { canConfigureGeofence, fencePreviewDiameterPx, formatCoords } from '@/lib/geofence'
import type { BadgeTone } from '@/components/ui'

const FENCE_LABEL: Record<FenceStatus, string> = {
  inside: 'Inside fence',
  edge: 'At boundary',
  outside: 'Outside / pending',
}
const FENCE_TONE: Record<FenceStatus, BadgeTone> = {
  inside: 'success',
  edge: 'warning',
  outside: 'danger',
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatCheckInTime(at: string | null | undefined): string {
  if (!at) return '—'
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function KpiMini({ label, value, tone }: { label: string; value: number; tone: BadgeTone }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : 'var(--danger)'
  return (
    <div className="sm-card pad" style={{ textAlign: 'center' }}>
      <div className="t-xs muted3">{label}</div>
      <div className="t-xl fw7" style={{ color }}>{value}</div>
    </div>
  )
}

function GeoPersonRow({ person }: { person: GeoAttendancePerson }) {
  return (
    <div className="row ai-center jc-between" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div className="row ai-center gap12">
        <span className="sm-kpi-ic" style={{ marginBottom: 0 }}>
          <Icon name={person.group === 'teacher' ? 'cap' : 'briefcase'} size={16} />
        </span>
        <div>
          <div className="t-md fw6">{person.name}</div>
          <div className="t-xs muted3">{person.subtitle}</div>
          {person.checkInAt && (
            <div className="t-xs" style={{ marginTop: 4, color: 'var(--brand-600)' }}>
              <Icon name="clock" size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              In {formatCheckInTime(person.checkInAt)}
              {person.verified && <span className="muted3"> · GPS verified</span>}
            </div>
          )}
          {person.checkOutAt && (
            <div className="t-xs muted3" style={{ marginTop: 2 }}>
              <Icon name="clock" size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              Out {formatCheckInTime(person.checkOutAt)}
            </div>
          )}
        </div>
      </div>
      <Badge tone={FENCE_TONE[person.fenceStatus]} dot>
        {FENCE_LABEL[person.fenceStatus]}
      </Badge>
    </div>
  )
}

function CampusMapPreview({ lat, lng, radiusMeters, name, checkedIn, total }: {
  lat: number; lng: number; radiusMeters: number; name: string | null
  checkedIn: number; total: number
}) {
  const diameter = fencePreviewDiameterPx(radiusMeters)
  return (
    <div style={{
      position: 'relative', minHeight: 220, borderRadius: 12, overflow: 'hidden',
      background: 'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--brand-600) 18%, var(--surface-2)), var(--surface-2))',
      border: '1px solid var(--border)',
    }}>
      <div style={{
        position: 'absolute', inset: '50% auto auto 50%',
        transform: 'translate(-50%,-50%)',
        width: diameter, height: diameter,
        borderRadius: '50%', border: '2px dashed var(--brand-600)', opacity: 0.75,
      }} />
      <div style={{ position: 'absolute', inset: '50% auto auto 50%', transform: 'translate(-50%,-50%)', color: 'var(--brand-600)' }}>
        <Icon name="pin" size={26} />
      </div>
      <span className="t-xs muted3" style={{ position: 'absolute', bottom: 10, left: 12 }}>
        {name || 'Campus'} · {radiusMeters} m radius · {formatCoords(lat, lng)}
      </span>
      <span className="t-xs muted3" style={{ position: 'absolute', bottom: 10, right: 12 }}>
        {checkedIn}/{total} checked in today
      </span>
    </div>
  )
}

export function GeoFencePanel() {
  const app = useApp()
  const today = todayIso()
  const canConfigure = canConfigureGeofence(app.role)

  const locQ = useSchoolLocation(true)
  const teachersQ = useTeachers()
  const staffQ = useStaff()
  const principalQ = usePrincipalAttendance(today, true)

  const people = useMemo(
    () => resolveGeoAttendancePeople(
      teachersQ.data ?? [],
      staffQ.data ?? [],
      principalQ.data?.staff ?? [],
      principalQ.isSuccess,
      true,
    ),
    [teachersQ.data, staffQ.data, principalQ.data, principalQ.isSuccess],
  )

  const counts = countFenceStatus(people)
  const checkedIn = people.filter((p) => p.checkedIn).length
  const location = locQ.data
  const configured = Boolean(location && (location.lat !== 0 || location.lng !== 0))
  const loading = locQ.isLoading || teachersQ.isLoading || principalQ.isLoading

  return (
    <TierGate feature="attendance.geofence" title="Geo-fenced check-in">
      <Card pad={false}>
        <CardHead
          title="Geo-fenced check-in"
          sub="GPS-verified check-in for teachers & staff on campus (Platinum)"
          icon="pin"
          action={
            configured
              ? <Badge tone="success" icon="checkCircle">Active</Badge>
              : <Badge tone="neutral" icon="alert">Inactive</Badge>
          }
        />

        <CampusGeofenceSettings
          schoolName={app.school.name}
          canConfigure={canConfigure}
          autoPromptGps={!configured && canConfigure}
        />

        <div className="sm-grid-3 gap12" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <KpiMini label="Inside fence" value={counts.inside} tone="success" />
          <KpiMini label="At boundary" value={counts.edge} tone="warning" />
          <KpiMini label="Outside / pending" value={counts.outside} tone="danger" />
        </div>

        <div className="sm-grid-2 gap16" style={{ padding: 16 }}>
          {configured && location ? (
            <CampusMapPreview
              lat={location.lat}
              lng={location.lng}
              radiusMeters={location.radiusMeters}
              name={location.name}
              checkedIn={checkedIn}
              total={people.length}
            />
          ) : (
            <div className="sm-card pad col ai-center jc-center" style={{ minHeight: 220, textAlign: 'center' }}>
              <Icon name="pin" size={32} style={{ color: 'var(--text-3)', marginBottom: 8 }} />
              <div className="t-md fw6">No campus fence yet</div>
              <div className="t-sm muted3">Save coordinates above to activate geo check-in.</div>
            </div>
          )}
          <div className="col gap8">
            {loading ? (
              <span className="t-sm muted">Loading…</span>
            ) : people.length === 0 ? (
              <Empty icon="users" title="No teachers or staff" body="Add people in SIS to monitor geo check-ins." />
            ) : (
              people.map((p) => <GeoPersonRow key={p.id} person={p} />)
            )}
          </div>
        </div>
      </Card>
    </TierGate>
  )
}
