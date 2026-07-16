import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getFeeReportSummary } from '../feeReports'
import { queryKeys } from '../queryKeys'
import type { FeeReportSummary } from '@/types'

export function useFeeReportSummary(): UseQueryResult<FeeReportSummary> {
  return useQuery({ queryKey: queryKeys.feeReports.summary, queryFn: () => getFeeReportSummary() })
}
