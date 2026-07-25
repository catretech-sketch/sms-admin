import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createTeacher, updateTeacher } from '../teachers'
import { queryKeys } from '../queryKeys'
import type { Teacher } from '@/types'
import { invalidatePortfolioHeadcounts } from './invalidatePortfolio'

export function useCreateTeacher(): UseMutationResult<Teacher, Error, Teacher> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (t: Teacher) => createTeacher(t),
    onSuccess: async (created) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.teachers.all }),
        qc.invalidateQueries({ queryKey: queryKeys.teachers.detail(created.id) }),
        qc.invalidateQueries({ queryKey: queryKeys.classes.all }),
        invalidatePortfolioHeadcounts(qc),
      ])
    },
  })
}

export function useUpdateTeacher(): UseMutationResult<Teacher, Error, { id: string; teacher: Teacher }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, teacher }) => updateTeacher(id, teacher),
    onSuccess: async (updated) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.teachers.all }),
        qc.invalidateQueries({ queryKey: queryKeys.teachers.detail(updated.id) }),
        qc.invalidateQueries({ queryKey: queryKeys.classes.all }),
        invalidatePortfolioHeadcounts(qc),
      ])
    },
  })
}
