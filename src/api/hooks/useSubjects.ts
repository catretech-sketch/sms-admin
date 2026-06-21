import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listSubjects, createSubject } from '../subjects'
import { queryKeys } from '../queryKeys'

export function useSubjects(): UseQueryResult<string[]> {
  return useQuery({ queryKey: queryKeys.subjects.all, queryFn: () => listSubjects() })
}

export function useCreateSubject(): UseMutationResult<string, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createSubject(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subjects.all }) },
  })
}
