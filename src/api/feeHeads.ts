import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { FeeHead } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listFeeHeads(): Promise<FeeHead[]> {
  const env = await listRequest<ListEnvelope>('/fees/heads')
  return env.data.map((h) => snakeToCamel<FeeHead>(h))
}

export async function createFeeHead(input: { name: string; code?: string }): Promise<FeeHead> {
  const wire = await request<Record<string, unknown>>('/fees/heads', {
    method: 'POST',
    body: camelToSnake(input),
  })
  return snakeToCamel<FeeHead>(wire)
}

export async function updateFeeHead(id: string, patch: Partial<Pick<FeeHead, 'name' | 'code' | 'active'>>): Promise<FeeHead> {
  const wire = await request<Record<string, unknown>>(`/fees/heads/${id}`, {
    method: 'PATCH',
    body: camelToSnake(patch),
  })
  return snakeToCamel<FeeHead>(wire)
}

export async function deleteFeeHead(id: string): Promise<void> {
  await request<unknown>(`/fees/heads/${id}`, { method: 'DELETE' })
}
