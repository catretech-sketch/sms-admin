import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listThreads } from '../threads'
import { queryKeys } from '../queryKeys'
import type { Thread } from '@/types'

export function useThreads(): UseQueryResult<Thread[]> {
  return useQuery({ queryKey: queryKeys.threads.all, queryFn: () => listThreads() })
}
