import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import {
  getSchoolLocation, upsertSchoolLocation, deleteSchoolLocation,
  type SchoolLocation, type UpsertSchoolLocationBody,
} from '../schoolLocation'
import { queryKeys } from '../queryKeys'

export function useSchoolLocation(enabled = true): UseQueryResult<SchoolLocation | null> {
  return useQuery({
    queryKey: queryKeys.attendance.schoolLocation,
    queryFn: () => getSchoolLocation(),
    enabled,
    staleTime: 60_000,
    retry: (count, err) => {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) return false
      return count < 2
    },
  })
}

export function useUpsertSchoolLocation(): UseMutationResult<SchoolLocation, Error, UpsertSchoolLocationBody> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => upsertSchoolLocation(body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.attendance.schoolLocation, data)
    },
  })
}

export function useDeleteSchoolLocation(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => deleteSchoolLocation(),
    onSuccess: () => {
      qc.setQueryData(queryKeys.attendance.schoolLocation, null)
    },
  })
}
