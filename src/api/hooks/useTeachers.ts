import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listTeachers, getTeacher } from '../teachers'
import { queryKeys } from '../queryKeys'
import type { Teacher, ListTeachersOpts } from '@/types'

export function useTeachers(opts: ListTeachersOpts = {}): UseQueryResult<Teacher[]> {
  return useQuery({
    queryKey: queryKeys.teachers.list(opts),
    queryFn: () => listTeachers(opts),
  })
}

export function useTeacher(id: string | null): UseQueryResult<Teacher> {
  return useQuery({
    queryKey: queryKeys.teachers.detail(id ?? ''),
    queryFn: () => getTeacher(id as string),
    enabled: !!id,
  })
}
