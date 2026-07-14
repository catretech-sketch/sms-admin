import { request } from './client'

/** Map UI role keys to API policy names (`school.teacher`, etc.). */
export function toApiRole(role: string): string {
  const r = role.trim().toLowerCase()
  const map: Record<string, string> = {
    // Invites cannot assign school.owner (founding role); use school.admin.
    owner: 'school.admin',
    'school.owner': 'school.admin',
    admin: 'school.admin',
    'school.admin': 'school.admin',
    principal: 'school.principal',
    'school.principal': 'school.principal',
    // No vice_principal policy yet — closest academic lead role.
    vice_principal: 'school.principal',
    teacher: 'school.teacher',
    'school.teacher': 'school.teacher',
    staff: 'staff',
    parent: 'student.parent',
    'student.parent': 'student.parent',
  }
  return map[r] ?? (r.includes('.') ? r : `school.${r}`)
}

export async function inviteUser(email: string, role: string): Promise<void> {
  await request<unknown>('/users', {
    method: 'POST',
    body: { email, roles: [toApiRole(role)] },
  })
}
