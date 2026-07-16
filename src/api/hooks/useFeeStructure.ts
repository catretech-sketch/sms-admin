import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { getFeeStructure, saveFeeStructure, type FeeStructureMatrix } from '../feeStructure'
import { queryKeys } from '../queryKeys'

export function useFeeStructure(): UseQueryResult<FeeStructureMatrix> {
  return useQuery({ queryKey: queryKeys.feeStructure.all, queryFn: () => getFeeStructure() })
}

export function useSaveFeeStructure(): UseMutationResult<FeeStructureMatrix, Error, FeeStructureMatrix> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (matrix: FeeStructureMatrix) => saveFeeStructure(matrix),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feeStructure.all }) },
  })
}
