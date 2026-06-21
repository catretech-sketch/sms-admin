import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listClasses, createClass, type SchoolClass } from '../classes'
import { queryKeys } from '../queryKeys'

export function useClasses(): UseQueryResult<SchoolClass[]> {
  return useQuery({ queryKey: queryKeys.classes.all, queryFn: () => listClasses() })
}

export function useCreateClass(): UseMutationResult<SchoolClass, Error, SchoolClass> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: SchoolClass) => createClass(c),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.classes.all }) },
  })
}
