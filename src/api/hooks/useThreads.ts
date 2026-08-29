import {
  useQuery, useMutation, useQueryClient,
  type UseQueryResult, type UseMutationResult,
} from '@tanstack/react-query'
import {
  listThreads, listThreadMessages, createThread, sendMessage,
  type ChatThread, type ChatMessage, type CreateThreadInput,
} from '../threads'
import { queryKeys } from '../queryKeys'

export function useThreads(): UseQueryResult<ChatThread[]> {
  return useQuery({ queryKey: queryKeys.threads.all, queryFn: () => listThreads() })
}

export function useThreadMessages(threadId: string | null): UseQueryResult<ChatMessage[]> {
  return useQuery({
    queryKey: queryKeys.threads.messages(threadId ?? ''),
    queryFn: () => listThreadMessages(threadId as string),
    enabled: !!threadId,
  })
}

export function useCreateThread(): UseMutationResult<ChatThread, Error, CreateThreadInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateThreadInput) => createThread(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.threads.all }) },
  })
}

export function useSendMessage(): UseMutationResult<
  ChatMessage, Error, { threadId: string; text: string; imageUrl?: string | null }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, text, imageUrl }) => sendMessage(threadId, text, imageUrl),
    onSuccess: (_msg, { threadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.threads.messages(threadId) })
      qc.invalidateQueries({ queryKey: queryKeys.threads.all })
    },
  })
}
