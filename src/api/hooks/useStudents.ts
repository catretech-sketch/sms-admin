import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listStudents, listStudentsPage, getStudent } from '../students'
import { queryKeys } from '../queryKeys'
import type { Student, ListStudentsOpts } from '@/types'

const ROSTER_STALE_MS = 30_000

export function useStudents(opts: ListStudentsOpts & { enabled?: boolean } = {}): UseQueryResult<Student[]> {
  const { enabled = true, ...listOpts } = opts
  return useQuery({
    queryKey: queryKeys.students.list(listOpts),
    queryFn: () => listStudents(listOpts),
    enabled,
    staleTime: ROSTER_STALE_MS,
  })
}

export function useStudentsPage(opts: ListStudentsOpts & { enabled?: boolean } = {}): UseQueryResult<{ rows: Student[]; nextCursor: string | null }> {
  const { enabled = true, ...listOpts } = opts
  return useQuery({
    queryKey: queryKeys.students.page(listOpts),
    queryFn: () => listStudentsPage(listOpts),
    enabled,
    staleTime: ROSTER_STALE_MS,
  })
}

export function useStudent(id: string | null): UseQueryResult<Student> {
  return useQuery({
    queryKey: queryKeys.students.detail(id ?? ''),
    queryFn: () => getStudent(id as string),
    enabled: !!id,
  })
}
