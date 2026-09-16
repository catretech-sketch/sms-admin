import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

/** Six mobile staff duty roles a task can be broadcast to (sms-staff app). */
export type StaffDutyRole = 'driver' | 'conductor' | 'sweeper' | 'gardener' | 'guard' | 'peon'
export type TaskPriority = 'urgent' | 'normal'
export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export const STAFF_DUTY_ROLES: StaffDutyRole[] = ['driver', 'conductor', 'sweeper', 'gardener', 'guard', 'peon']

export const STAFF_DUTY_ROLE_LABELS: Record<StaffDutyRole, string> = {
  driver: 'Driver',
  conductor: 'Conductor',
  sweeper: 'Cleaner',
  gardener: 'Gardener',
  guard: 'Guard',
  peon: 'Peon',
}

export interface StaffTask {
  id: string
  tenantId: string
  title: string
  detail?: string
  category?: string
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string
  assignedToUserId?: string
  assignedToUserName?: string
  assignedToRoleKey?: StaffDutyRole
  completedAt?: string
  completedByUserId?: string
  completedByUserName?: string
  createdByUserId?: string
  createdByUserName?: string
  createdAt: string
  /** Not present on the real backend TaskResponse DTO (no UpdatedAt column) — always
   *  undefined in production. Kept optional (not coerced to '') so callers can't
   *  mistake a missing value for a real empty-string timestamp. */
  updatedAt?: string
}

/** Exactly one of userId/roleKey must be set — a specific staff member, or a
 *  broadcast to everyone with that duty role in the tenant. */
export interface CreateTaskInput {
  title: string
  detail?: string
  category?: string
  priority: TaskPriority
  dueDate?: string
  assignedToUserId?: string
  assignedToRoleKey?: StaffDutyRole
}

export interface TaskListFilter {
  status?: TaskStatus
  assignedToUserId?: string
  assignedToRoleKey?: StaffDutyRole
  from?: string
  to?: string
  cursor?: string
}

export interface TaskPage {
  data: StaffTask[]
  nextCursor: string | null
}

export interface PersonTaskSummary {
  userId: string
  name: string
  roleKey?: StaffDutyRole
  totalTasks: number
  pendingTasks: number
  completedTasks: number
  overdueTasks: number
  lastActivityAt?: string
}

export interface RoleTaskSummary {
  roleKey: StaffDutyRole
  headcount: number
  totalTasks: number
  pendingTasks: number
  completedTasks: number
  overdueTasks: number
  lastActivityAt?: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

const TASK_PRIORITIES: TaskPriority[] = ['urgent', 'normal']
const TASK_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed']

function toTaskPriority(v: unknown): TaskPriority {
  return (TASK_PRIORITIES as string[]).includes(v as string) ? (v as TaskPriority) : 'normal'
}
function toTaskStatus(v: unknown): TaskStatus {
  return (TASK_STATUSES as string[]).includes(v as string) ? (v as TaskStatus) : 'pending'
}
function toDutyRole(v: unknown): StaffDutyRole | undefined {
  return (STAFF_DUTY_ROLES as string[]).includes(v as string) ? (v as StaffDutyRole) : undefined
}

export function toTask(wire: Record<string, unknown>): StaffTask {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  return {
    id: String(c.id ?? ''),
    tenantId: String(c.tenantId ?? ''),
    title: String(c.title ?? ''),
    detail: typeof c.detail === 'string' ? c.detail : undefined,
    category: typeof c.category === 'string' ? c.category : undefined,
    priority: toTaskPriority(c.priority),
    status: toTaskStatus(c.status),
    dueDate: typeof c.dueDate === 'string' ? c.dueDate : undefined,
    assignedToUserId: typeof c.assignedToUserId === 'string' ? c.assignedToUserId : undefined,
    assignedToUserName: typeof c.assignedToUserName === 'string' ? c.assignedToUserName : undefined,
    assignedToRoleKey: toDutyRole(c.assignedToRoleKey),
    completedAt: typeof c.completedAt === 'string' ? c.completedAt : undefined,
    completedByUserId: typeof c.completedByUserId === 'string' ? c.completedByUserId : undefined,
    completedByUserName: typeof c.completedByUserName === 'string' ? c.completedByUserName : undefined,
    createdByUserId: typeof c.createdByUserId === 'string' ? c.createdByUserId : undefined,
    createdByUserName: typeof c.createdByUserName === 'string' ? c.createdByUserName : undefined,
    createdAt: String(c.createdAt ?? ''),
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : undefined,
  }
}

function filterQuery(filter: TaskListFilter = {}): Record<string, string | undefined> {
  return {
    status: filter.status,
    assigned_to_user_id: filter.assignedToUserId,
    assigned_to_role_key: filter.assignedToRoleKey,
    from: filter.from,
    to: filter.to,
    cursor: filter.cursor,
  }
}

export async function listAllTasksPage(filter: TaskListFilter = {}): Promise<TaskPage> {
  const env = await listRequest<ListEnvelope>('/staff/tasks/all', { query: filterQuery(filter) })
  return { data: env.data.map(toTask), nextCursor: env.next_cursor }
}

export async function listAllTasks(filter: TaskListFilter = {}): Promise<StaffTask[]> {
  const page = await listAllTasksPage(filter)
  return page.data
}

export function toPersonSummary(wire: Record<string, unknown>): PersonTaskSummary {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  return {
    userId: String(c.userId ?? ''),
    name: String(c.name ?? ''),
    roleKey: toDutyRole(c.roleKey),
    totalTasks: Number(c.totalTasks ?? 0),
    pendingTasks: Number(c.pendingTasks ?? 0),
    completedTasks: Number(c.completedTasks ?? 0),
    overdueTasks: Number(c.overdueTasks ?? 0),
    lastActivityAt: typeof c.lastActivityAt === 'string' ? c.lastActivityAt : undefined,
  }
}

export function toRoleSummary(wire: Record<string, unknown>): RoleTaskSummary {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  return {
    roleKey: toDutyRole(c.roleKey) ?? 'driver',
    headcount: Number(c.headcount ?? 0),
    totalTasks: Number(c.totalTasks ?? 0),
    pendingTasks: Number(c.pendingTasks ?? 0),
    completedTasks: Number(c.completedTasks ?? 0),
    overdueTasks: Number(c.overdueTasks ?? 0),
    lastActivityAt: typeof c.lastActivityAt === 'string' ? c.lastActivityAt : undefined,
  }
}

export async function listPeopleSummary(): Promise<PersonTaskSummary[]> {
  const env = await listRequest<ListEnvelope>('/staff/tasks/summary/people')
  return env.data.map(toPersonSummary)
}

export async function listRoleSummary(): Promise<RoleTaskSummary[]> {
  const env = await listRequest<ListEnvelope>('/staff/tasks/summary/roles')
  return env.data.map(toRoleSummary)
}

export async function createTask(input: CreateTaskInput): Promise<StaffTask> {
  if (!input.title.trim()) throw new Error('Title is required')
  const hasUser = !!input.assignedToUserId
  const hasRole = !!input.assignedToRoleKey
  if (hasUser === hasRole) {
    throw new Error('Assign the task to exactly one staff member or one duty role')
  }
  const payload = camelToSnake({
    title: input.title,
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    priority: input.priority,
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    ...(hasUser ? { assignedToUserId: input.assignedToUserId } : {}),
    ...(hasRole ? { assignedToRoleKey: input.assignedToRoleKey } : {}),
  })
  const wire = await request<Record<string, unknown>>('/staff/tasks', { method: 'POST', body: payload })
  return toTask(wire)
}
