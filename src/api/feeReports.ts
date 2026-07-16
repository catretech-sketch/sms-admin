import { request } from './client'
import { snakeToCamel } from './mapper'
import type { FeeReportSummary } from '@/types'

export async function getFeeReportSummary(): Promise<FeeReportSummary> {
  const wire = await request<Record<string, unknown>>('/fees/reports/summary')
  return snakeToCamel<FeeReportSummary>(wire)
}
