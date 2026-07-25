import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listClasses, createClass, updateClass, ensureDefaultClasses, type SchoolClass, type UpdateClassPatch } from '../classes'
import { queryKeys } from '../queryKeys'
import { mergeClassNames } from '@/lib/defaultClasses'

export function useClasses(): UseQueryResult<SchoolClass[]> {
  return useQuery({ queryKey: queryKeys.classes.all, queryFn: () => listClasses() })
}

/** Live class names from API only (empty until classes are added or seeded). */
export function useClassNames(): string[] {
  const { data } = useClasses()
  return useMemo(() => {
    const live = (data ?? [])
      .map((c) => (c.name || `${c.grade}-${c.section}`).trim())
      .filter((n) => n && n !== '-')
    return [...new Set(live)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [data])
}

/** Defaults + live (for pickers that still want Nursery–XII suggestions). */
export function useMergedClassNames(): string[] {
  const { data } = useClasses()
  return useMemo(() => mergeClassNames(data), [data])
}

export function useCreateClass(): UseMutationResult<SchoolClass, Error, SchoolClass> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: SchoolClass) => createClass(c),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.classes.all }) },
  })
}

export function useUpdateClass(): UseMutationResult<SchoolClass, Error, { id: string; patch: UpdateClassPatch }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateClass(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.classes.all }) },
  })
}

/** Seed Nursery–XII · A/B/C (skips any that already exist). */
export function useEnsureDefaultClasses(): UseMutationResult<number, Error, SchoolClass[] | undefined> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (existing?: SchoolClass[]) => ensureDefaultClasses(existing),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.classes.all }) },
  })
}
