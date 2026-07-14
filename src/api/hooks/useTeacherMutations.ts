import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createTeacher } from '../teachers'
import { queryKeys } from '../queryKeys'
import type { Teacher } from '@/types'
import { invalidatePortfolioHeadcounts } from './invalidatePortfolio'

export function useCreateTeacher(): UseMutationResult<Teacher, Error, Teacher> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (t: Teacher) => createTeacher(t),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.teachers.all }),
        invalidatePortfolioHeadcounts(qc),
      ])
    },
  })
}
