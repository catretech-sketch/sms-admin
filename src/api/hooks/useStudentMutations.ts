import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createStudent, updateStudent } from '../students'
import { queryKeys } from '../queryKeys'
import type { Student } from '@/types'
import { invalidatePortfolioHeadcounts } from './invalidatePortfolio'

/** Everything that must be refreshed after students are created or changed:
 *  - `queryKeys.students.all` (`['students']`) is a PREFIX of the list/page/detail keys, so
 *    invalidating it covers every roster consumer — including the bulk-import drawer's own
 *    `useStudents({ enabled: open })` query, whose in-memory roster drives duplicate
 *    detection for the NEXT file the admin imports.
 *  - the owner portfolio headcounts.
 *  Shared by the single-student create/update mutations and the bulk-import hook so there is
 *  one invalidation rule, not three drifting copies. */
export async function invalidateStudentQueries(qc: QueryClient, studentId?: string): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.students.all }),
    ...(studentId ? [qc.invalidateQueries({ queryKey: queryKeys.students.detail(studentId) })] : []),
    invalidatePortfolioHeadcounts(qc),
  ])
}

export function useCreateStudent(): UseMutationResult<Student, Error, Student> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Student) => createStudent(s),
    onSuccess: async (created) => { await invalidateStudentQueries(qc, created.id) },
  })
}

export function useUpdateStudent(): UseMutationResult<Student, Error, { id: string; student: Student }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, student }) => updateStudent(id, student),
    onSuccess: async (updated) => { await invalidateStudentQueries(qc, updated.id) },
  })
}
