import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listComplaints } from '../complaints'
import { queryKeys } from '../queryKeys'
import type { Complaint } from '@/types'

export function useComplaints(): UseQueryResult<Complaint[]> {
  return useQuery({ queryKey: queryKeys.complaints.all, queryFn: () => listComplaints() })
}
