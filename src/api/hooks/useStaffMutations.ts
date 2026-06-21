import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createStaff } from '../staff'
import { queryKeys } from '../queryKeys'
import type { Staff } from '@/types'

export function useCreateStaff(): UseMutationResult<Staff, Error, Staff> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Staff) => createStaff(s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.staff.all }) },
  })
}
