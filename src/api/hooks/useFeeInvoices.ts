import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listFeeInvoices, generateFeeInvoices } from '../feeInvoices'
import { queryKeys } from '../queryKeys'
import type { FeeInvoice } from '@/types'

export function useFeeInvoices(opts: { q?: string; status?: string; grade?: string; class?: string } = {}): UseQueryResult<FeeInvoice[]> {
  return useQuery({ queryKey: queryKeys.feeInvoices.list(opts), queryFn: () => listFeeInvoices(opts) })
}

export function useGenerateFeeInvoices(): UseMutationResult<
  { created: number },
  Error,
  { grades?: string[]; classes?: string[]; academicYear: string; term: string; dueDate?: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => generateFeeInvoices(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.feeInvoices.all })
      qc.invalidateQueries({ queryKey: queryKeys.feeReports.summary })
      qc.invalidateQueries({ queryKey: ['owner', 'feeSummary'] })
    },
  })
}
