import { request } from './client'
import type { Cap, GateRole } from '@/types'

export interface RoleTemplateOverride {
  role: GateRole
  module: string
  cap: Cap
  effect: 'grant' | 'revoke'
}

export async function getRoleTemplate(): Promise<RoleTemplateOverride[]> {
  const data = await request<RoleTemplateOverride[]>('/roles/permissions')
  return data ?? []
}

export async function setRoleTemplate(overrides: RoleTemplateOverride[]): Promise<RoleTemplateOverride[]> {
  const data = await request<RoleTemplateOverride[]>('/roles/permissions', {
    method: 'PUT',
    body: { overrides },
  })
  return data ?? []
}
