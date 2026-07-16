import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { sendFeeReminders, type SendFeeRemindersInput } from '../feeReminders'

export function useSendFeeReminders(): UseMutationResult<{ reach: number }, Error, SendFeeRemindersInput> {
  return useMutation({
    mutationFn: (input: SendFeeRemindersInput) => sendFeeReminders(input),
  })
}
