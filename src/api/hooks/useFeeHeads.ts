import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listFeeHeads, createFeeHead, updateFeeHead, deleteFeeHead } from '../feeHeads'
import { queryKeys } from '../queryKeys'
import type { FeeHead } from '@/types'

export function useFeeHeads(): UseQueryResult<FeeHead[]> {
  return useQuery({ queryKey: queryKeys.feeHeads.all, queryFn: () => listFeeHeads() })
}

export function useCreateFeeHead(): UseMutationResult<FeeHead, Error, { name: string; code?: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; code?: string }) => createFeeHead(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feeHeads.all }) },
  })
}

export function useUpdateFeeHead(): UseMutationResult<FeeHead, Error, { id: string; patch: Partial<Pick<FeeHead, 'name' | 'code' | 'active'>> }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateFeeHead(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feeHeads.all }) },
  })
}

export function useDeleteFeeHead(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFeeHead(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feeHeads.all }) },
  })
}
