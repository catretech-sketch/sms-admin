import { listRequest, request } from './client'
import { ApiError } from './ApiError'
import { tokenStore } from './auth/tokenStore'
import { enrichOwnerFeeSummary } from './ownerFeeLocal'
import type { AuthTokens } from './types'
import type { Client, CreateMySchoolBody, FeeSummaryResponse, ListEnvelope } from './ownerTypes'

export function listMySchools(): Promise<ListEnvelope<Client>> {
  return listRequest<ListEnvelope<Client>>('/me/schools')
}

export function createMySchool(body: CreateMySchoolBody): Promise<Client> {
  return request<Client>('/me/schools', { method: 'POST', body })
}

/** Hard-delete an empty school you own (no students / teachers / staff). */
export function deleteMySchool(tenantId: string): Promise<void> {
  return request<void>(`/me/schools/${tenantId}`, { method: 'DELETE', body: { confirm: 'DELETE' } })
}

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

async function portfolioSchools(): Promise<{ id: string; name: string; slug?: string }[]> {
  try {
    const env = await listMySchools()
    return (env.data ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug || undefined }))
  } catch {
    return []
  }
}

/** Cross-school student fee collection for the signed-in owner's portfolio. */
export async function getMySchoolsFeeSummary(params: { from?: string; to?: string } = {}): Promise<FeeSummaryResponse> {
  let api: FeeSummaryResponse | null = null
  try {
    api = await request<FeeSummaryResponse>('/me/schools/fee-summary', { query: params })
  } catch (err) {
    if (!isMissingEndpoint(err)) throw err
  }

  const schools = await portfolioSchools()
  /* When API already has cash, still enrich zeros per school from local desk stores. */
  if (api && schools.length === 0 && (api.schools?.length ?? 0) > 0) {
    return enrichOwnerFeeSummary(
      api.schools.map((s) => ({ id: s.tenant_id, name: s.name, slug: s.tenant_id })),
      api,
      params,
    )
  }
  return enrichOwnerFeeSummary(schools, api, params)
}

/** Switch JWT to another school the owner already has a user row for. */
export async function switchSchool(tenantId: string): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>('/me/switch-school', {
    method: 'POST',
    body: { tenant_id: tenantId },
  })
  tokenStore.set(tokens)
  tokenStore.setTenantId(tenantId)
  return tokens
}
