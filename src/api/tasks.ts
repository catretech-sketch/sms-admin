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
  createdByUserId?: string
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
    createdByUserId: typeof c.createdByUserId === 'string' ? c.createdByUserId : undefined,
    createdAt: String(c.createdAt ?? ''),
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : undefined,
  }
}

export async function listAllTasks(): Promise<StaffTask[]> {
  const env = await listRequest<ListEnvelope>('/staff/tasks/all')
  return env.data.map(toTask)
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
