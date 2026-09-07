/* ============================================================
   Transport Students — mapping status across all opted-in students
   ============================================================ */
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/lib/hooks'
import {
  PageHead, Card, Badge, Field, Select, Btn, Empty, Spinner,
} from '@/components/ui'
import {
  useTransportStudentsList, useTransportRoutes, useRouteStops, useTransportBuses,
  useSetStudentTransport, useAssignStudentToBus,
} from '@/api/hooks/useOperations'
import { useFeeHeads } from '@/api/hooks/useFeeHeads'
import { queryKeys } from '@/api/queryKeys'
import type { TransportMappedStudent } from '@/api/transport'

export function TransportStudentsScreen() {
  const toast = useToast()
  const qc = useQueryClient()
  const [routeFilter, setRouteFilter] = useState('')
  const [stopFilter, setStopFilter] = useState('')
  const [busFilter, setBusFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [feeHeadFilter, setFeeHeadFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'mapped' | 'pending'>('')
  const [manualAssignFor, setManualAssignFor] = useState<string | null>(null)
  const [manualBusId, setManualBusId] = useState('')

  const routesQ = useTransportRoutes()
  const stopsQ = useRouteStops(routeFilter || null)
  const busesQ = useTransportBuses()
  const feeHeadsQ = useFeeHeads()
  const listQ = useTransportStudentsList({
    routeId: routeFilter || undefined,
    stopId: stopFilter || undefined,
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
  const stopOptions = useMemo(() => [
    { value: '', label: routeFilter ? 'All stops' : 'Select route first' },
    ...(stopsQ.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ], [stopsQ.data, routeFilter])
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
        onSuccess: () => {
          toast.success('Bus assigned', `${row.studentName} assigned manually.`)
          void qc.invalidateQueries({ queryKey: queryKeys.operations.transportStudentsList() })
          setManualAssignFor(null)
          setManualBusId('')
        },
        onError: (err) => toast.danger('Could not assign', err instanceof Error ? err.message : 'Please try again.'),
      },
    )
  }

  return (
    <div>
      <PageHead title="Transport Students" sub="Route/stop/fee-head mapping and bus assignment status" />
      <Card>
        <div className="row gap12 wrap">
          <Field label="Route">
            <Select
              options={routeOptions}
              value={routeFilter}
              onChange={(e) => { setRouteFilter(e.target.value); setStopFilter('') }}
            />
          </Field>
          <Field label="Stop">
            <Select options={stopOptions} value={stopFilter} onChange={(e) => setStopFilter(e.target.value)} disabled={!routeFilter} />
          </Field>
          <Field label="Bus"><Select options={busOptions} value={busFilter} onChange={(e) => setBusFilter(e.target.value)} /></Field>
          <Field label="Grade"><input className="sm-input" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} placeholder="e.g. 5" /></Field>
          <Field label="Fee head"><Select options={feeHeadOptions} value={feeHeadFilter} onChange={(e) => setFeeHeadFilter(e.target.value)} /></Field>
          <Field label="Status">
            <Select
              options={[{ value: '', label: 'All' }, { value: 'mapped', label: 'Mapped' }, { value: 'pending', label: 'Pending' }]}
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
                  <td>
                    <div className="fw6">{row.studentName}</div>
                    <div className="t-xs muted3">{row.admissionNo}</div>
                  </td>
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
                        <Btn
                          size="sm" variant="ghost"
                          onClick={() => {
                            // Reset the picked bus whenever a DIFFERENT row's picker opens —
                            // otherwise student A's bus id lingers in state and Confirm on
                            // student B (a different route) could assign B to A's bus.
                            if (manualAssignFor !== row.studentId) setManualBusId('')
                            setManualAssignFor(row.studentId)
                          }}
                        >
                          Select bus manually
                        </Btn>
                        {manualAssignFor === row.studentId && (
                          <>
                            <Select
                              options={[
                                { value: '', label: 'Pick a bus…' },
                                ...(busesQ.data ?? [])
                                  .filter((b) => b.routeId === row.routeId)
                                  .map((b) => ({ value: b.busId, label: b.busNo })),
                              ]}
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
