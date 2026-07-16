import { request } from './client'
import { camelToSnake } from './mapper'

export interface SendFeeRemindersInput {
  invoiceIds?: string[]
  audience?: 'defaulters' | 'selected'
  channels: string[]
  includePayLink?: boolean
}

/** Bulk fee reminders — backend resolves recipients (defaulters or the given invoices). */
export async function sendFeeReminders(input: SendFeeRemindersInput): Promise<{ reach: number }> {
  return request<{ reach: number }>('/fees/reminders', {
    method: 'POST',
    body: camelToSnake(input),
  })
}
