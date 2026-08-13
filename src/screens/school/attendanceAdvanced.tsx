import { useMemo, useState } from 'react'
import { Badge, Btn, Card, Empty, Input, Search, Select, type BadgeTone } from '@/components/ui'
import { useClasses } from '@/api/hooks/useClasses'
import { useTeachers } from '@/api/hooks/useTeachers'
import { usePeriodAttendanceAdvanced } from '@/api/hooks/usePeriodAttendanceAdvanced'
import type {
  PeriodAttendanceAdvancedFilters,
  PeriodAttendanceAdvancedRow,
} from '@/api/periodAttendanceAdvanced'

const DEFAULT_FILTERS: PeriodAttendanceAdvancedFilters = {
  preset: 'today',
  page: 1,
  pageSize: 25,
}

const PRESET_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'Leave' },
]

const ROLE_OPTIONS = [
  { value: '', label: 'All marker roles' },
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'principal', label: 'Principal' },
  { value: 'vice_principal', label: 'Vice Principal' },
  { value: 'teacher', label: 'Teacher' },
]

function compactFilters(filters: PeriodAttendanceAdvancedFilters): PeriodAttendanceAdvancedFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value != null),
  ) as PeriodAttendanceAdvancedFilters
}

function statusTone(status: string): BadgeTone {
  if (status === 'present') return 'success'
  if (status === 'late' || status === 'leave') return 'warning'
  if (status === 'absent') return 'danger'
  return 'neutral'
}

function titleCase(value?: string | null): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function periodTime(row: PeriodAttendanceAdvancedRow): string {
  if (!row.startTime && !row.endTime) return '—'
  return `${row.startTime || '—'} – ${row.endTime || '—'}`
}

function markedAt(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function AttendanceAdvanced() {
  const [filters, setFilters] = useState<PeriodAttendanceAdvancedFilters>(DEFAULT_FILTERS)
  const classesQ = useClasses()
  const teachersQ = useTeachers()
  const queryFilters = compactFilters(filters)
  const attendanceQ = usePeriodAttendanceAdvanced(queryFilters)

  const classes = classesQ.data ?? []
  const teachers = teachersQ.data ?? []
  const grades = useMemo(
    () => [...new Set(classes.map((item) => item.grade).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [classes],
  )
  const subjects = useMemo(
    () => [...new Set(classes.flatMap((item) => item.subjects ?? []).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [classes],
  )
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 25
  const totalCount = attendanceQ.data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const update = <K extends keyof PeriodAttendanceAdvancedFilters>(
    key: K,
    value: PeriodAttendanceAdvancedFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }))
  }

  return (
    <Card pad={false}>
      <div className="sm-att-adv-head">
        <div>
          <div className="t-lg fw7">Advanced period attendance</div>
          <div className="t-sm muted">Server-filtered period marks across classes and teachers</div>
        </div>
        <span className="t-sm muted">{totalCount} record{totalCount === 1 ? '' : 's'}</span>
      </div>

      <div className="sm-att-adv-filters">
        <label className="sm-att-adv-field">
          <span>Date preset</span>
          <Select
            aria-label="Date preset"
            value={filters.preset}
            options={PRESET_OPTIONS}
            onChange={(event) => update('preset', event.target.value)}
          />
        </label>
        {filters.preset === 'custom' && (
          <>
            <label className="sm-att-adv-field">
              <span>From</span>
              <Input aria-label="From" type="date" value={filters.from ?? ''} onChange={(event) => update('from', event.target.value)} />
            </label>
            <label className="sm-att-adv-field">
              <span>To</span>
              <Input aria-label="To" type="date" value={filters.to ?? ''} onChange={(event) => update('to', event.target.value)} />
            </label>
          </>
        )}
        <label className="sm-att-adv-field">
          <span>Class</span>
          <Select
            aria-label="Class"
            value={filters.grade ?? ''}
            options={[{ value: '', label: 'All classes' }, ...grades.map((grade) => ({ value: grade, label: grade }))]}
            onChange={(event) => update('grade', event.target.value)}
          />
        </label>
        <label className="sm-att-adv-field">
          <span>Section</span>
          <Select
            aria-label="Section"
            value={filters.classId ?? ''}
            options={[
              { value: '', label: 'All sections' },
              ...classes.filter((item) => !filters.grade || item.grade === filters.grade).map((item) => ({
                value: item.id ?? '',
                label: item.name || `${item.grade}-${item.section}`,
              })),
            ]}
            onChange={(event) => update('classId', event.target.value)}
          />
        </label>
        <label className="sm-att-adv-field">
          <span>Subject</span>
          <Select
            aria-label="Subject"
            value={filters.subject ?? ''}
            options={[{ value: '', label: 'All subjects' }, ...subjects.map((subject) => ({ value: subject, label: subject }))]}
            onChange={(event) => update('subject', event.target.value)}
          />
        </label>
        <label className="sm-att-adv-field">
          <span>Period</span>
          <Select
            aria-label="Period"
            value={filters.period?.toString() ?? ''}
            options={[
              { value: '', label: 'All periods' },
              ...Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `Period ${index + 1}` })),
            ]}
            onChange={(event) => update('period', event.target.value ? Number(event.target.value) : undefined)}
          />
        </label>
        <label className="sm-att-adv-field">
          <span>Teacher</span>
          <Select
            aria-label="Teacher"
            value={filters.assignedTeacherId ?? ''}
            options={[
              { value: '', label: 'All teachers' },
              ...teachers.map((teacher) => ({ value: teacher.id, label: teacher.name })),
            ]}
            onChange={(event) => update('assignedTeacherId', event.target.value)}
          />
        </label>
        <label className="sm-att-adv-field">
          <span>Marked by role</span>
          <Select
            aria-label="Marked by role"
            value={filters.markedByRole ?? ''}
            options={ROLE_OPTIONS}
            onChange={(event) => update('markedByRole', event.target.value)}
          />
        </label>
        <label className="sm-att-adv-field">
          <span>Status</span>
          <Select
            aria-label="Status"
            value={filters.status ?? ''}
            options={STATUS_OPTIONS}
            onChange={(event) => update('status', event.target.value)}
          />
        </label>
        <label className="sm-att-adv-field sm-att-adv-search">
          <span>Student</span>
          <Search
            value={filters.q ?? ''}
            onChange={(value) => update('q', value)}
            placeholder="Name or admission no."
          />
        </label>
      </div>

      {attendanceQ.isLoading ? (
        <div className="sm-att-adv-state t-sm muted">Loading period attendance…</div>
      ) : attendanceQ.isError ? (
        <div className="sm-att-adv-state">
          <div>
            <div className="fw6">Could not load period attendance.</div>
            <div className="t-sm muted">{attendanceQ.error instanceof Error ? attendanceQ.error.message : 'Please try again.'}</div>
          </div>
          <Btn variant="secondary" size="sm" onClick={() => attendanceQ.refetch()}>Retry</Btn>
        </div>
      ) : (
        <div className="sm-att-adv-table-wrap">
          <table className="sm-table sm-att-adv-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Admission No</th>
                <th>Class</th>
                <th>Section</th>
                <th>Subject</th>
                <th>Period</th>
                <th>Period Time</th>
                <th>Status</th>
                <th>Assigned Teacher</th>
                <th>Marked By</th>
                <th>Marked By Role</th>
                <th>Marked At</th>
                <th>Geo-Fence</th>
              </tr>
            </thead>
            <tbody>
              {attendanceQ.data?.items.length ? attendanceQ.data.items.map((row) => (
                <tr key={row.id}>
                  <td><span className="fw6">{row.studentName || '—'}</span></td>
                  <td>{row.admissionNo || '—'}</td>
                  <td>{row.grade || row.classLabel || '—'}</td>
                  <td>{row.section || '—'}</td>
                  <td>{row.subject || '—'}</td>
                  <td>{row.period || '—'}</td>
                  <td>{periodTime(row)}</td>
                  <td><Badge tone={statusTone(row.status)} dot>{titleCase(row.status)}</Badge></td>
                  <td>{row.assignedTeacherName || '—'}</td>
                  <td>{row.markedByName || row.markedBy || '—'}</td>
                  <td>{titleCase(row.markedByRole)}</td>
                  <td>{markedAt(row.markedAt)}</td>
                  <td>{row.geoFenceStatus === 'not_required' ? 'Not required' : titleCase(row.geoFenceStatus)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={13}>
                    <Empty icon="calendar" title="No period attendance for these filters." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="sm-att-adv-pagination">
        <span className="t-sm muted">Page {page} of {totalPages} · {totalCount} records</span>
        <div className="row gap8">
          <Btn
            variant="secondary"
            size="sm"
            disabled={page <= 1 || attendanceQ.isLoading}
            onClick={() => setFilters((current) => ({ ...current, page: page - 1 }))}
          >
            Previous
          </Btn>
          <Btn
            variant="secondary"
            size="sm"
            aria-label="Next page"
            disabled={page >= totalPages || attendanceQ.isLoading}
            onClick={() => setFilters((current) => ({ ...current, page: page + 1 }))}
          >
            Next
          </Btn>
        </div>
      </div>
    </Card>
  )
}
