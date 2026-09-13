import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listSchoolHouses } from '../schoolHouses'
import { queryKeys } from '../queryKeys'

/** The school's House catalog (GET /v1/houses) — the same reference list the Add Student
 *  house dropdown is populated from (Academics → Houses). Cached via React Query so the
 *  bulk-import Preview can run its House-exists check against it. */
export function useSchoolHouses(): UseQueryResult<string[]> {
  return useQuery({ queryKey: queryKeys.schoolHouses.all, queryFn: listSchoolHouses, staleTime: 60_000 })
}
