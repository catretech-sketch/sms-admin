import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listAuditLog, type AuditEntry, type AuditParams } from '../audit'
import { queryKeys } from '../queryKeys'

export function useAuditLog(params: AuditParams = {}): UseQueryResult<{ data: AuditEntry[]; nextCursor: string | null }> {
  return useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => listAuditLog(params),
  })
}
