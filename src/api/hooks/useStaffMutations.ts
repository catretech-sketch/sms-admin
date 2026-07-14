import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createStaff } from '../staff'
import { queryKeys } from '../queryKeys'
import type { Staff } from '@/types'
import { invalidatePortfolioHeadcounts } from './invalidatePortfolio'

export function useCreateStaff(): UseMutationResult<Staff, Error, Staff> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Staff) => createStaff(s),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
        invalidatePortfolioHeadcounts(qc),
      ])
    },
  })
}
