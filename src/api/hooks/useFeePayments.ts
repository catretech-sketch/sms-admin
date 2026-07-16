import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listFeePayments, payInvoice } from '../feePayments'
import { queryKeys } from '../queryKeys'
import type { FeePayment } from '@/types'

export function useFeePayments(): UseQueryResult<FeePayment[]> {
  return useQuery({ queryKey: queryKeys.feePayments.all, queryFn: () => listFeePayments() })
}

export function usePayInvoice(): UseMutationResult<FeePayment, Error, { invoiceId: string; payment: FeePayment }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, payment }: { invoiceId: string; payment: FeePayment }) => payInvoice(invoiceId, payment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.feePayments.all })
      qc.invalidateQueries({ queryKey: queryKeys.feeInvoices.all })
      qc.invalidateQueries({ queryKey: queryKeys.feeReports.summary })
    },
  })
}
