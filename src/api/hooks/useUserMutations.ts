import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { inviteUser } from '../users'
import { queryKeys } from '../queryKeys'

export function useInviteUser(): UseMutationResult<{ id: string }, Error, { email: string; role: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) => inviteUser(email, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.users.all }) },
  })
}
