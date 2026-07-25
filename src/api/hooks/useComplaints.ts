import {
  useQuery, useMutation, useQueryClient,
  type UseQueryResult, type UseMutationResult,
} from '@tanstack/react-query'
import {
  listComplaints, createComplaint, updateComplaint,
  type CreateComplaintInput, type UpdateComplaintInput,
} from '../complaints'
import { queryKeys } from '../queryKeys'
import type { Complaint } from '@/types'

export function useComplaints(status?: string): UseQueryResult<Complaint[]> {
  return useQuery({ queryKey: queryKeys.complaints.all, queryFn: () => listComplaints(status) })
}

export function useCreateComplaint(): UseMutationResult<Complaint, Error, CreateComplaintInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateComplaintInput) => createComplaint(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.complaints.all }) },
  })
}

export function useUpdateComplaint(): UseMutationResult<Complaint, Error, { id: string; input: UpdateComplaintInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateComplaintInput }) => updateComplaint(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.complaints.all }) },
  })
}
