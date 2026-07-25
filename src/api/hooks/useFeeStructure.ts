import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { getFeeStructure, saveFeeStructure, type FeeStructureDocument } from '../feeStructure'
import { queryKeys } from '../queryKeys'
import { useApp } from '@/lib/hooks'

export function useFeeStructure(): UseQueryResult<FeeStructureDocument> {
  const app = useApp()
  const currency = app.school.currency || 'INR'
  return useQuery({
    queryKey: [...queryKeys.feeStructure.all, currency] as const,
    queryFn: () => getFeeStructure({ currency }),
  })
}

export function useSaveFeeStructure(): UseMutationResult<FeeStructureDocument, Error, FeeStructureDocument> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: FeeStructureDocument) => saveFeeStructure(doc),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feeStructure.all }) },
  })
}
