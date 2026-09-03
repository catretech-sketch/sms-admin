import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { inviteUser, setUserActive, type SchoolUserDto } from '../users'
import { queryKeys } from '../queryKeys'

export function useInviteUser(): UseMutationResult<{ id: string }, Error, { email: string; role: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) => inviteUser(email, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.users.all }) },
  })
}

/** Suspend (active=false) or unsuspend (active=true) a linked login account. */
export function useSetUserActive(): UseMutationResult<SchoolUserDto, Error, { userId: string; active: boolean }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) => setUserActive(userId, active),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.users.all }) },
  })
}
