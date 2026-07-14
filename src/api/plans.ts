import { listRequest, request } from './client'
import type { ListEnvelope, Plan } from './ownerTypes'

export function listPlans(visibility?: string): Promise<ListEnvelope<Plan>> {
  return listRequest<ListEnvelope<Plan>>('/plans', { query: { visibility } })
}

/** Live catalog for create-school — accepts Catre "published" or legacy "public". */
export async function listLivePlans(): Promise<Plan[]> {
  const env = await listRequest<ListEnvelope<Plan>>('/plans')
  return (env.data ?? []).filter(isLivePlan)
}

export function listMyPlans(): Promise<Plan[]> {
  return request<Plan[]>('/me/plans')
}

export function isLivePlan(p: Plan): boolean {
  const v = (p.visibility ?? '').trim().toLowerCase()
  return v === 'published' || v === 'public'
}
