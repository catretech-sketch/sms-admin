import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { listClients, createClient } from '../clients'
import { getOverview } from '../dashboard'
import { listMyPlans, listLivePlans, isLivePlan } from '../plans'
import { listMySchools, createMySchool, switchSchool, getMySchoolsFeeSummary } from '../mySchools'
import { queryKeys } from '../queryKeys'
import type { CreateClientBody, CreateMySchoolBody } from '../ownerTypes'
import { passwordForgot } from '../auth'

export function useDashboardOverview(enabled = true) {
  return useQuery({
    queryKey: queryKeys.owner.dashboard,
    queryFn: getOverview,
    enabled,
  })
}

export function useOwnerClients(enabled = true, params: { status?: string; q?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.owner.clients(params),
    queryFn: async () => (await listClients(params)).data,
    enabled,
  })
}

export function useMySchools(enabled = true) {
  return useQuery({
    queryKey: queryKeys.owner.mySchools,
    queryFn: async () => (await listMySchools()).data,
    enabled,
  })
}

/** Platform → /clients; school owner → /me/schools. */
export function usePortfolioSchools(isPlatform: boolean): UseQueryResult<import('../ownerTypes').Client[]> {
  const platform = useOwnerClients(isPlatform)
  const mine = useMySchools(!isPlatform)
  return (isPlatform ? platform : mine) as UseQueryResult<import('../ownerTypes').Client[]>
}

export function useOwnerPlans(isPlatform: boolean) {
  return useQuery({
    queryKey: queryKeys.owner.plans(isPlatform),
    queryFn: async () => {
      if (isPlatform) return listLivePlans()
      // /me/plans already returns live plans only (public + published).
      return (await listMyPlans()).filter(isLivePlan)
    },
  })
}

export function useCreateSchool(isPlatform: boolean) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateClientBody | CreateMySchoolBody) => {
      const client = isPlatform
        ? await createClient(body as CreateClientBody)
        : await createMySchool(body as CreateMySchoolBody)
      if (isPlatform && 'admin_email' in body && body.admin_email) {
        try { await passwordForgot(body.admin_email) } catch { /* invite email is best-effort */ }
      }
      return client
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['owner'] })
    },
  })
}

export function useSwitchSchool() {
  return useMutation({ mutationFn: (tenantId: string) => switchSchool(tenantId) })
}

/** School-wise fee cash summary for owner (and platform) portfolio. */
export function useOwnerFeeSummary(enabled = true, params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.owner.feeSummary(params),
    queryFn: () => getMySchoolsFeeSummary(params),
    enabled,
  })
}
