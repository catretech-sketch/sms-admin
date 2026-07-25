import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createStaff, updateStaff } from '../staff'
import { queryKeys } from '../queryKeys'
import type { Staff } from '@/types'
import { invalidatePortfolioHeadcounts } from './invalidatePortfolio'

export function useCreateStaff(): UseMutationResult<Staff, Error, Staff> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Staff) => createStaff(s),
    onSuccess: async (created) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
        qc.invalidateQueries({ queryKey: queryKeys.staff.detail(created.id) }),
        invalidatePortfolioHeadcounts(qc),
      ])
    },
  })
}

export function useUpdateStaff(): UseMutationResult<Staff, Error, { id: string; staff: Staff }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, staff }) => updateStaff(id, staff),
    onSuccess: async (updated) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.staff.all }),
        qc.invalidateQueries({ queryKey: queryKeys.staff.detail(updated.id) }),
        invalidatePortfolioHeadcounts(qc),
      ])
    },
  })
}
