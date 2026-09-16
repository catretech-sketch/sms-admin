import { useEffect, useMemo, useState } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { can } from '@/lib/gating'
import {
  Card, CardHead, Kpi, Btn, Badge, Search, Select, Field, Input, Textarea, Modal,
  Drawer, Spinner, Empty, Segmented, DataTable, type Column, type BadgeTone,
} from '@/components/ui'
import { useTaskPages, useCreateTask, usePeopleSummary, useRoleSummary } from '@/api/hooks/useTasks'
import { useStaff } from '@/api/hooks/useStaff'
import {
  STAFF_DUTY_ROLES, STAFF_DUTY_ROLE_LABELS,
  type StaffTask, type TaskPriority, type TaskStatus, type StaffDutyRole, type CreateTaskInput,
  type PersonTaskSummary, type RoleTaskSummary, type TaskListFilter,
} from '@/api/tasks'
import { TASK_DATE_PRESETS, TASK_DATE_PRESET_LABELS, taskDateRange, completionRate, type TaskDatePreset } from '@/lib/taskDateRange'
import type { Staff } from '@/types'

const TASK_PRIORITY_TONE: Record<TaskPriority, BadgeTone> = { urgent: 'danger', normal: 'neutral' }
const TASK_STATUS_TONE: Record<TaskStatus, BadgeTone> = { pending: 'info', in_progress: 'warning', completed: 'success' }
const TASK_STATUS_LABEL: Record<TaskStatus, string> = { pending: 'Pending', in_progress: 'In progress', completed: 'Completed' }
const TASK_STATUS_FILTER_OPTIONS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]
const TASK_ASSIGNEE_ROLE_OPTIONS = STAFF_DUTY_ROLES.map((r) => ({ value: r, label: STAFF_DUTY_ROLE_LABELS[r] }))
const TASK_ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All roles' },
  ...TASK_ASSIGNEE_ROLE_OPTIONS,
]

function taskAssigneeLabel(t: StaffTask): string {
  if (t.assignedToRoleKey) return `All ${STAFF_DUTY_ROLE_LABELS[t.assignedToRoleKey]}s`
  return t.assignedToUserName ?? (t.assignedToUserId ? t.assignedToUserId.slice(0, 8) : '—')
}

function pct(completed: number, total: number): string {
  return `${Math.round(completionRate(completed, total) * 100)}%`
}

export function TaskManagementTab() {
  const [sub, setSub] = useState<'all' | 'people' | 'roles'>('all')
  const [roleFilter, setRoleFilter] = useState<StaffDutyRole | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<PersonTaskSummary | null>(null)

  const openRole = (role: StaffDutyRole) => {
    setRoleFilter(role)
    setSub('people')
  }

  return (
    <div className="col gap16">
      <Segmented
        value={sub}
        onChange={(v) => {
          setSub(v as 'all' | 'people' | 'roles')
          if (v !== 'people') setRoleFilter(null)
        }}
        options={[
          { value: 'all', label: 'All Tasks' },
          { value: 'people', label: 'People' },
          { value: 'roles', label: 'Roles' },
        ]}
      />
      {sub === 'all' && <AllTasksView />}
      {sub === 'people' && (
        <PeopleView roleFilter={roleFilter} onSelectPerson={setSelectedPerson} />
      )}
      {sub === 'roles' && <RolesView onSelectRole={openRole} />}
      <PersonDetailDrawer person={selectedPerson} onClose={() => setSelectedPerson(null)} />
    </div>
  )
}

function AllTasksView() {
  const app = useApp()
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [roleFilter, setRoleFilter] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [datePreset, setDatePreset] = useState<TaskDatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [q, setQ] = useState('')
  const [openNew, setOpenNew] = useState(false)
  const peopleQ = usePeopleSummary()
  const canManage = can(app.role, 'staffTasks', 'E')

  const range = taskDateRange(datePreset, new Date(), {
    from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined,
    to: customTo ? new Date(`${customTo}T23:59:59.999`).toISOString() : undefined,
  })
  const filter: TaskListFilter = {
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(assigneeId ? { assignedToUserId: assigneeId } : {}),
    ...(roleFilter ? { assignedToRoleKey: roleFilter as StaffDutyRole } : {}),
    ...range,
  }
  const tasksQ = useTaskPages(filter)
  const rows = useMemo(() => tasksQ.data?.pages.flatMap((p) => p.data) ?? [], [tasksQ.data])
  const term = q.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!term) return rows
    return rows.filter((r) => r.title.toLowerCase().includes(term) || (r.detail ?? '').toLowerCase().includes(term))
  }, [rows, term])

  const cols: Column<StaffTask>[] = [
    {
      key: 'title', label: 'Task', sortValue: (r) => r.title,
      render: (r) => (
        <div>
          <div className="fw6 t-md">{r.title}</div>
          {r.detail && <div className="t-xs muted3">{r.detail}</div>}
        </div>
      ),
    },
    { key: 'category', label: 'Category', sortValue: (r) => r.category ?? '', render: (r) => r.category ? <Badge tone="neutral" soft>{r.category}</Badge> : <span className="t-sm muted">—</span> },
    { key: 'priority', label: 'Priority', sortValue: (r) => r.priority, render: (r) => <Badge tone={TASK_PRIORITY_TONE[r.priority]} soft dot>{r.priority[0].toUpperCase() + r.priority.slice(1)}</Badge> },
    { key: 'assignee', label: 'Assigned to', sortValue: (r) => taskAssigneeLabel(r), render: (r) => <span className="t-md">{taskAssigneeLabel(r)}</span> },
    { key: 'due', label: 'Due', align: 'right', sortValue: (r) => r.dueDate ?? '', render: (r) => <span className="t-sm muted">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</span> },
    { key: 'status', label: 'Status', sortValue: (r) => r.status, render: (r) => <Badge tone={TASK_STATUS_TONE[r.status]} soft>{TASK_STATUS_LABEL[r.status]}</Badge> },
  ]

  return (
    <div className="col gap16">
      <div className="row ai-center jc-between gap12 wrap">
        <div className="row ai-center gap12 wrap">
          <Search value={q} onChange={setQ} placeholder="Search title or detail…" />
          <Select
            options={TASK_STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
          />
          <Select
            options={TASK_ROLE_FILTER_OPTIONS}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          />
          <Select
            options={[
              { value: '', label: 'All assignees' },
              ...(peopleQ.data ?? []).map((p) => ({ value: p.userId, label: p.name })),
            ]}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          />
          <Select
            options={TASK_DATE_PRESETS.map((p) => ({ value: p, label: TASK_DATE_PRESET_LABELS[p] }))}
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as TaskDatePreset)}
          />
          {datePreset === 'custom' && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
        </div>
        {canManage && <Btn variant="primary" icon="plus" onClick={() => setOpenNew(true)}>New task</Btn>}
      </div>
      <Card pad={false}>
        <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <CardHead title="All Tasks" sub="Assigned checklist items — filter by status, role, person, or date range" icon="check" />
        </div>
        {tasksQ.isError ? (
          <div style={{ padding: 16 }}>
            <div className="t-sm muted" style={{ marginBottom: 8 }}>Could not load tasks.</div>
            <Btn variant="secondary" size="sm" onClick={() => tasksQ.refetch()}>Retry</Btn>
          </div>
        ) : tasksQ.isLoading ? (
          <div style={{ padding: 16 }}><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <Empty icon="check" title="No staff tasks yet" body="Create a task and assign it to a staff member or a whole duty role." />
        ) : (
          <>
            <DataTable
              columns={cols} rows={filtered} pageSize={8} rowKey={(r) => r.id}
              initialSort={{ key: 'due', dir: 'desc' }}
            />
            {tasksQ.hasNextPage && (
              <div style={{ padding: 16 }}>
                <Btn variant="secondary" size="sm" disabled={tasksQ.isFetchingNextPage} onClick={() => tasksQ.fetchNextPage()}>
                  {tasksQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Btn>
              </div>
            )}
          </>
        )}
      </Card>
      <NewTaskModal open={openNew} onClose={() => setOpenNew(false)} />
    </div>
  )
}

function PeopleView({
  roleFilter, onSelectPerson,
}: {
  roleFilter: StaffDutyRole | null
  onSelectPerson: (p: PersonTaskSummary) => void
}) {
  const peopleQ = usePeopleSummary()
  const rows = (peopleQ.data ?? []).filter((p) => !roleFilter || p.roleKey === roleFilter)

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead
          title={roleFilter ? STAFF_DUTY_ROLE_LABELS[roleFilter] : 'People'}
          sub={roleFilter ? `Duty staff in ${STAFF_DUTY_ROLE_LABELS[roleFilter]}` : 'Duty-role staff and anyone directly assigned a task'}
          icon="users"
        />
      </div>
      {peopleQ.isError ? (
        <div style={{ padding: 16 }}>
          <div className="t-sm muted" style={{ marginBottom: 8 }}>Could not load people.</div>
          <Btn variant="secondary" size="sm" onClick={() => peopleQ.refetch()}>Retry</Btn>
        </div>
      ) : peopleQ.isLoading ? (
        <div style={{ padding: 16 }}><Spinner size={24} /></div>
      ) : rows.length === 0 ? (
        <Empty icon="users" title="No people in this view" body="Duty-role staff and anyone assigned a task will show up here." />
      ) : (
        <div className="sm-grid-2 gap12" style={{ padding: 16 }}>
          {rows.map((p) => (
            <button
              key={p.userId}
              type="button"
              className="sm-card"
              style={{ textAlign: 'left', cursor: 'pointer', padding: 14 }}
              aria-label={p.name}
              onClick={() => onSelectPerson(p)}
            >
              <div className="fw6 t-md">{p.name}</div>
              <div className="t-xs muted3" style={{ marginTop: 2 }}>
                {p.roleKey ? STAFF_DUTY_ROLE_LABELS[p.roleKey] : 'Assigned personally'}
              </div>
              <div className="row gap12 wrap" style={{ marginTop: 10 }}>
                <span className="t-sm"><span className="fw6">{p.totalTasks}</span> total</span>
                <span className="t-sm"><span className="fw6">{p.pendingTasks}</span> pending</span>
                <span className="t-sm"><span className="fw6">{p.completedTasks}</span> done</span>
                <span className="t-sm"><span className="fw6">{p.overdueTasks}</span> overdue</span>
                <span className="t-sm"><span className="fw6">{pct(p.completedTasks, p.totalTasks)}</span></span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

function RolesView({ onSelectRole }: { onSelectRole: (role: StaffDutyRole) => void }) {
  const rolesQ = useRoleSummary()
  const byKey = new Map((rolesQ.data ?? []).map((r) => [r.roleKey, r]))

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <CardHead title="Roles" sub="The six duty roles a task can be broadcast to" icon="shield" />
      </div>
      {rolesQ.isError ? (
        <div style={{ padding: 16 }}>
          <div className="t-sm muted" style={{ marginBottom: 8 }}>Could not load roles.</div>
          <Btn variant="secondary" size="sm" onClick={() => rolesQ.refetch()}>Retry</Btn>
        </div>
      ) : rolesQ.isLoading ? (
        <div style={{ padding: 16 }}><Spinner size={24} /></div>
      ) : (
        <div className="sm-grid-2 gap12" style={{ padding: 16 }}>
          {STAFF_DUTY_ROLES.map((key) => {
            const r: RoleTaskSummary = byKey.get(key) ?? {
              roleKey: key, headcount: 0, totalTasks: 0, pendingTasks: 0, completedTasks: 0, overdueTasks: 0,
            }
            return (
              <button
                key={key}
                type="button"
                className="sm-card"
                style={{ textAlign: 'left', cursor: 'pointer', padding: 14 }}
                aria-label={STAFF_DUTY_ROLE_LABELS[key]}
                onClick={() => onSelectRole(key)}
              >
                <div className="fw6 t-md">{STAFF_DUTY_ROLE_LABELS[key]}</div>
                <div className="t-xs muted3" style={{ marginTop: 2 }}>{r.headcount} on duty</div>
                <div className="row gap12 wrap" style={{ marginTop: 10 }}>
                  <span className="t-sm"><span className="fw6">{r.totalTasks}</span> total</span>
                  <span className="t-sm"><span className="fw6">{r.pendingTasks}</span> pending</span>
                  <span className="t-sm"><span className="fw6">{r.completedTasks}</span> done</span>
                  <span className="t-sm"><span className="fw6">{r.overdueTasks}</span> overdue</span>
                  <span className="t-sm"><span className="fw6">{pct(r.completedTasks, r.totalTasks)}</span></span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function isOverdue(t: StaffTask, today: Date): boolean {
  if (t.status === 'completed' || !t.dueDate) return false
  const due = new Date(t.dueDate)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return due < start
}

function PersonDetailDrawer({ person, onClose }: { person: PersonTaskSummary | null; onClose: () => void }) {
  const [preset, setPreset] = useState<TaskDatePreset>('this_week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    if (!person) return
    setPreset('this_week')
    setCustomFrom('')
    setCustomTo('')
  }, [person])

  const range = taskDateRange(preset, new Date(), {
    from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined,
    to: customTo ? new Date(`${customTo}T23:59:59.999`).toISOString() : undefined,
  })
  const tasksQ = useTaskPages({ assignedToUserId: person?.userId, ...range }, !!person)
  const rows = person ? (tasksQ.data?.pages.flatMap((p) => p.data) ?? []) : []
  const today = new Date()
  const total = rows.length
  const pending = rows.filter((t) => t.status === 'pending').length
  const completed = rows.filter((t) => t.status === 'completed').length
  const overdue = rows.filter((t) => isOverdue(t, today)).length

  return (
    <Drawer
      open={!!person}
      onClose={onClose}
      icon="users"
      title={person?.name}
      sub={person?.roleKey ? STAFF_DUTY_ROLE_LABELS[person.roleKey] : 'Assigned personally'}
    >
      {person && (
        <div className="col gap16">
          <div className="sm-grid-2 gap12">
            <Kpi icon="check" label="Total" value={total} />
            <Kpi icon="clock" label="Pending" value={pending} />
            <Kpi icon="check" label="Completed" value={completed} />
            <Kpi icon="alert" label="Overdue" value={overdue} />
            <Kpi icon="trend" label="Completion" value={pct(completed, total)} />
          </div>
          <div className="row wrap gap8">
            {TASK_DATE_PRESETS.map((p) => (
              <Btn
                key={p}
                size="sm"
                variant={preset === p ? 'primary' : 'ghost'}
                onClick={() => setPreset(p)}
              >
                {TASK_DATE_PRESET_LABELS[p]}
              </Btn>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="sm-grid-2 gap12">
              <Field label="From"><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></Field>
            </div>
          )}
          {tasksQ.isError ? (
            <div>
              <div className="t-sm muted" style={{ marginBottom: 8 }}>Could not load history.</div>
              <Btn variant="secondary" size="sm" onClick={() => tasksQ.refetch()}>Retry</Btn>
            </div>
          ) : tasksQ.isLoading ? (
            <Spinner size={24} />
          ) : rows.length === 0 ? (
            <Empty icon="check" title="No tasks in this range" body="Try a wider date range." />
          ) : (
            <div className="col gap10">
              {rows.map((t) => (
                <div key={t.id} style={{ padding: 10, borderRadius: 8, background: 'var(--surface-2)' }}>
                  <div className="fw6 t-sm">{t.title}</div>
                  <div className="t-xs muted3" style={{ marginTop: 4 }}>
                    Assigned · {new Date(t.createdAt).toLocaleString()}
                    {t.createdByUserName ? ` · ${t.createdByUserName}` : ''}
                  </div>
                  {t.completedAt && (
                    <div className="t-xs muted3" style={{ marginTop: 2 }}>
                      Completed · {new Date(t.completedAt).toLocaleString()}
                      {t.completedByUserName ? ` · ${t.completedByUserName}` : ''}
                    </div>
                  )}
                </div>
              ))}
              {tasksQ.hasNextPage && (
                <Btn variant="secondary" size="sm" disabled={tasksQ.isFetchingNextPage} onClick={() => tasksQ.fetchNextPage()}>
                  {tasksQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Btn>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

function assignableStaff(roster: Staff[]): Staff[] {
  return roster.filter((s) => !!s.userId)
}

function NewTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const createTaskMut = useCreateTask()
  const staffQ = useStaff()
  const staffRoster = assignableStaff(staffQ.data ?? [])

  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [assignMode, setAssignMode] = useState<'user' | 'role'>('role')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [assignedRole, setAssignedRole] = useState<StaffDutyRole>('driver')

  useEffect(() => {
    if (!open) return
    setTitle(''); setDetail(''); setCategory(''); setPriority('normal'); setDueDate('')
    setAssignMode('role'); setAssignedUserId(''); setAssignedRole('driver')
  }, [open])

  const submit = () => {
    if (!title.trim()) { toast.danger('Title required', 'Enter a short task title.'); return }
    if (assignMode === 'user' && !assignedUserId) { toast.danger('Assignee required', 'Choose a staff member to assign the task to.'); return }
    const input: CreateTaskInput = {
      title,
      priority,
      ...(detail.trim() ? { detail } : {}),
      ...(category.trim() ? { category } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(assignMode === 'user' ? { assignedToUserId: assignedUserId } : { assignedToRoleKey: assignedRole }),
    }
    createTaskMut.mutate(input, {
      onSuccess: () => { toast.success('Task created', `${title} was assigned.`); onClose() },
      onError: (err) => toast.danger('Could not create task', err instanceof Error ? err.message : 'Please try again.'),
    })
  }

  return (
    <Modal
      open={open} onClose={onClose} icon="check"
      title="New staff task" sub="Assign a checklist item to a staff member or a whole duty role"
      footer={
        <div className="row gap8 jc-end">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={createTaskMut.isPending} onClick={submit}>
            {createTaskMut.isPending ? 'Creating…' : 'Create task'}
          </Btn>
        </div>
      }
    >
      <div className="col gap16">
        <Field label="Title" required>
          <Input icon="check" value={title} placeholder="e.g. Sweep courtyard before assembly" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Detail">
          <Textarea value={detail} rows={3} placeholder="Optional instructions…" onChange={(e) => setDetail(e.target.value)} />
        </Field>
        <div className="sm-grid-2 gap16">
          <Field label="Category" hint="Free text, e.g. cleaning, garden, security">
            <Input value={category} placeholder="e.g. cleaning" onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select
              options={[{ value: 'normal', label: 'Normal' }, { value: 'urgent', label: 'Urgent' }]}
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            />
          </Field>
        </div>
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Assign to">
          <Select
            options={[{ value: 'role', label: 'A whole duty role (broadcast)' }, { value: 'user', label: 'A specific staff member' }]}
            value={assignMode}
            onChange={(e) => setAssignMode(e.target.value as 'user' | 'role')}
          />
        </Field>
        {assignMode === 'role' ? (
          <Field label="Duty role">
            <Select
              options={TASK_ASSIGNEE_ROLE_OPTIONS}
              value={assignedRole}
              onChange={(e) => setAssignedRole(e.target.value as StaffDutyRole)}
            />
          </Field>
        ) : (
          <Field label="Staff member" hint={staffQ.isLoading ? 'Loading staff…' : staffRoster.length === 0 ? 'No staff with a login yet' : undefined}>
            <Select
              options={[
                { value: '', label: 'Select a staff member…' },
                ...staffRoster.map((s) => ({ value: s.userId!, label: `${s.name} — ${s.role}` })),
              ]}
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}
