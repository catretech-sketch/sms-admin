import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { resendInvitation, revokeInvitation } from '../invitations'
import { queryKeys } from '../queryKeys'

export function useResendInvitation(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resendInvitation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.invitations.all }) },
  })
}

export function useRevokeInvitation(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.invitations.all }) },
  })
}
