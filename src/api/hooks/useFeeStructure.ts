import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import {
  getFeeStructure, saveFeeStructure, listFeeStructureHistory, getFeeStructureVersion,
  publishFeeStructureVersion, deleteFeeStructureVersion,
  type FeeStructureDocument, type FeeStructureHistoryEntry,
} from '../feeStructure'
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.feeStructure.all })
      qc.invalidateQueries({ queryKey: queryKeys.feeStructure.history })
    },
  })
}

export function useFeeStructureHistory(): UseQueryResult<FeeStructureHistoryEntry[]> {
  return useQuery({ queryKey: queryKeys.feeStructure.history, queryFn: () => listFeeStructureHistory() })
}

export function useFeeStructureVersion(id: string | null): UseQueryResult<FeeStructureDocument> {
  return useQuery({
    queryKey: queryKeys.feeStructure.version(id ?? ''),
    queryFn: () => getFeeStructureVersion(id as string),
    enabled: !!id,
  })
}

export function usePublishFeeStructureVersion(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => publishFeeStructureVersion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.feeStructure.all })
      qc.invalidateQueries({ queryKey: queryKeys.feeStructure.history })
    },
  })
}

export function useDeleteFeeStructureVersion(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFeeStructureVersion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feeStructure.history }) },
  })
}
