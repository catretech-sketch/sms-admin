import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createStudent, updateStudent } from '../students'
import { queryKeys } from '../queryKeys'
import type { Student } from '@/types'
import { invalidatePortfolioHeadcounts } from './invalidatePortfolio'

export function useCreateStudent(): UseMutationResult<Student, Error, Student> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Student) => createStudent(s),
    onSuccess: async (created) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.students.all }),
        qc.invalidateQueries({ queryKey: queryKeys.students.detail(created.id) }),
        invalidatePortfolioHeadcounts(qc),
      ])
    },
  })
}

export function useUpdateStudent(): UseMutationResult<Student, Error, { id: string; student: Student }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, student }) => updateStudent(id, student),
    onSuccess: async (updated) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.students.all }),
        qc.invalidateQueries({ queryKey: queryKeys.students.detail(updated.id) }),
        invalidatePortfolioHeadcounts(qc),
      ])
    },
  })
}
