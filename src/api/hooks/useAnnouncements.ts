import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listAnnouncements, createAnnouncement, type Announcement, type CreateAnnouncementInput } from '../announcements'
import { queryKeys } from '../queryKeys'

export function useAnnouncements(): UseQueryResult<Announcement[]> {
  return useQuery({ queryKey: queryKeys.announcements.all, queryFn: () => listAnnouncements() })
}

export function useCreateAnnouncement(): UseMutationResult<Announcement, Error, CreateAnnouncementInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAnnouncementInput) => createAnnouncement(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.announcements.all }) },
  })
}
