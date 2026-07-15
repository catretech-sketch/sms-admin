import { request } from './client'
import type { Cap, Role, UserOverrides } from '@/types'

/** CRM login invite roles only — Teacher/Staff use the onboard form (People), not Send invite. */
export const CRM_INVITE_ROLES: Role[] = ['admin', 'principal', 'vice_principal']

/** Roles an actor may assign via Send invite (CRM access). */
export function assignableSchoolRoles(actorRole: Role | string | undefined): Role[] {
  const r = (actorRole ?? '').toLowerCase().replace(/^school\./, '')
  if (r === 'owner') return [...CRM_INVITE_ROLES, 'owner']
  if (r === 'admin') return [...CRM_INVITE_ROLES]
  if (r === 'principal') return ['vice_principal']
  return []
}

/** @deprecated use CRM_INVITE_ROLES — kept for tests that import SCHOOL_BASE_ROLES */
export const SCHOOL_BASE_ROLES = CRM_INVITE_ROLES

/** Map UI role keys to API policy names (`school.teacher`, etc.). */
export function toApiRole(role: string): string {
  const r = role.trim().toLowerCase()
  const map: Record<string, string> = {
    owner: 'school.owner',
    'school.owner': 'school.owner',
    admin: 'school.admin',
    'school.admin': 'school.admin',
    principal: 'school.principal',
    'school.principal': 'school.principal',
    vice_principal: 'school.principal',
    teacher: 'school.teacher',
    'school.teacher': 'school.teacher',
    staff: 'staff',
    parent: 'student.parent',
    'student.parent': 'student.parent',
  }
  return map[r] ?? (r.includes('.') ? r : `school.${r}`)
}

export function fromApiRole(role: string): Role {
  const r = role.trim().toLowerCase().replace(/^school\./, '')
  if (r === 'owner') return 'owner'
  if (r === 'admin') return 'admin'
  if (r === 'principal') return 'principal'
  if (r === 'teacher') return 'teacher'
  if (r === 'staff') return 'staff'
  return 'teacher'
}

export interface SchoolUserDto {
  id: string
  email: string | null
  phone: string | null
  status: string
  created_at: string
  roles: string[]
}

export interface PermissionOverrideDto {
  module: string
  cap: Cap
  effect: 'grant' | 'revoke'
}

export async function listSchoolUsers(): Promise<SchoolUserDto[]> {
  const data = await request<SchoolUserDto[]>('/users')
  return data ?? []
}

export async function inviteUser(email: string, role: string): Promise<{ id: string }> {
  const created = await request<{ id: string }>('/users', {
    method: 'POST',
    body: { email, roles: [toApiRole(role)] },
  })
  /* passwordForgot: welcome + setup OTP (API may already send; this covers older APIs). */
  try {
    const { passwordForgot } = await import('./auth')
    await passwordForgot(email)
  } catch { /* best-effort */ }
  return created
}

/** Replace roles for a user id within the current school (JWT tenant). */
export async function setUserRoles(userId: string, roles: string[]): Promise<SchoolUserDto> {
  return request<SchoolUserDto>(`/users/${userId}/roles`, {
    method: 'PUT',
    body: { roles: roles.map(toApiRole) },
  })
}

export async function getUserPermissions(userId: string): Promise<PermissionOverrideDto[]> {
  return (await request<PermissionOverrideDto[]>(`/users/${userId}/permissions`)) ?? []
}

export async function setUserPermissions(userId: string, overrides: UserOverrides): Promise<PermissionOverrideDto[]> {
  const payload: PermissionOverrideDto[] = []
  for (const [module, caps] of Object.entries(overrides)) {
    if (!caps) continue
    for (const [cap, effect] of Object.entries(caps)) {
      if (effect === 'grant' || effect === 'revoke') {
        payload.push({ module, cap: cap as Cap, effect })
      }
    }
  }
  return (await request<PermissionOverrideDto[]>(`/users/${userId}/permissions`, {
    method: 'PUT',
    body: { overrides: payload },
  })) ?? []
}

export function overridesFromApi(rows: PermissionOverrideDto[]): UserOverrides {
  const out: UserOverrides = {}
  for (const r of rows) {
    if (!out[r.module]) out[r.module] = {}
    out[r.module]![r.cap] = r.effect
  }
  return out
}
