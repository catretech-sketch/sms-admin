import { request } from './client'
import type { DashboardOverview } from './ownerTypes'

export function getOverview(): Promise<DashboardOverview> {
  return request<DashboardOverview>('/dashboard/overview')
}
