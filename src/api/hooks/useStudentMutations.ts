import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createStudent } from '../students'
import { queryKeys } from '../queryKeys'
import type { Student } from '@/types'

export function useCreateStudent(): UseMutationResult<Student, Error, Student> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Student) => createStudent(s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.students.all }) },
  })
}
