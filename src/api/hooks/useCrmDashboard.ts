import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getCrmPeopleSnapshot, type CrmPeopleSnapshot } from '../crmDashboard'
import { queryKeys } from '../queryKeys'

export function useCrmPeopleSnapshot(enabled = true): UseQueryResult<CrmPeopleSnapshot> {
  return useQuery({
    queryKey: queryKeys.crm.peopleSnapshot(),
    queryFn: getCrmPeopleSnapshot,
    enabled,
    staleTime: 30_000,
  })
}
