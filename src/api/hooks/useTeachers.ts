import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listTeachers } from '../teachers'
import { queryKeys } from '../queryKeys'
import type { Teacher, ListTeachersOpts } from '@/types'

export function useTeachers(opts: ListTeachersOpts = {}): UseQueryResult<Teacher[]> {
  return useQuery({
    queryKey: queryKeys.teachers.list(opts),
    queryFn: () => listTeachers(opts),
  })
}
