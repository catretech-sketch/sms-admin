import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { actOnApproval } from '../approvals'
import { queryKeys } from '../queryKeys'

export function useActOnApproval(): UseMutationResult<
  void,
  Error,
  { id: string; status: 'approved' | 'rejected'; decidedNote?: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, decidedNote }) => actOnApproval(id, status, decidedNote),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.approvals.all }) },
  })
}
