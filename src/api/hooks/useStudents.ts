import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listStudents, getStudent } from '../students'
import { queryKeys } from '../queryKeys'
import type { Student, ListStudentsOpts } from '@/types'

export function useStudents(opts: ListStudentsOpts = {}): UseQueryResult<Student[]> {
  return useQuery({
    queryKey: queryKeys.students.list(opts),
    queryFn: () => listStudents(opts),
  })
}

export function useStudent(id: string | null): UseQueryResult<Student> {
  return useQuery({
    queryKey: queryKeys.students.detail(id ?? ''),
    queryFn: () => getStudent(id as string),
    enabled: !!id,
  })
}
