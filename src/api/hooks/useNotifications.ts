import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listNotifications } from '../notifications'
import { queryKeys } from '../queryKeys'
import type { AppNotification } from '@/types'

export function useNotifications(): UseQueryResult<AppNotification[]> {
  return useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: () => listNotifications(),
  })
}
