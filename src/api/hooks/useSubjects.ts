import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import {
  listSubjects, createSubject, updateSubject, deleteSubject, ensureDefaultSubjects, type SchoolSubject,
} from '../subjects'
import { queryKeys } from '../queryKeys'
import { mergeSubjectNames } from '@/lib/defaultSubjects'

export function useSubjects(): UseQueryResult<SchoolSubject[]> {
  return useQuery({ queryKey: queryKeys.subjects.all, queryFn: () => listSubjects(), staleTime: 60_000 })
}

/** Subject options: defaults + live API + any currently selected names. */
export function useSubjectNames(selected?: string): string[] {
  const { data } = useSubjects()
  const selectedNames = useMemo(
    () => (selected ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    [selected],
  )
  return useMemo(() => mergeSubjectNames(data, selectedNames), [data, selectedNames])
}

export function useCreateSubject(): UseMutationResult<SchoolSubject, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createSubject(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subjects.all }) },
  })
}

export function useUpdateSubject(): UseMutationResult<SchoolSubject, Error, { id: string; name: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }) => updateSubject(id, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subjects.all }) },
  })
}

export function useDeleteSubject(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSubject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subjects.all }) },
  })
}

/** Seed default subjects (skips any that already exist). */
export function useEnsureDefaultSubjects(): UseMutationResult<number, Error, SchoolSubject[] | undefined> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (existing?: SchoolSubject[]) => ensureDefaultSubjects(existing),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subjects.all }) },
  })
}
