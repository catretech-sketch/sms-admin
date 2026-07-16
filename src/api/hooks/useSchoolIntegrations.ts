import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import {
  getSchoolIntegrations, saveSchoolIntegrations, verifySchoolRazorpay, type SaveSchoolIntegrationsInput,
} from '../schoolIntegrations'
import { queryKeys } from '../queryKeys'
import type { SchoolIntegrations, RazorpayStatus } from '@/types'

export function useSchoolIntegrations(): UseQueryResult<SchoolIntegrations> {
  return useQuery({ queryKey: queryKeys.school.integrations, queryFn: () => getSchoolIntegrations() })
}

export function useSaveSchoolIntegrations(): UseMutationResult<SchoolIntegrations, Error, SaveSchoolIntegrationsInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveSchoolIntegrationsInput) => saveSchoolIntegrations(input),
    onSuccess: (data) => { qc.setQueryData(queryKeys.school.integrations, data) },
  })
}

export function useVerifySchoolRazorpay(): UseMutationResult<{ status: RazorpayStatus }, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => verifySchoolRazorpay(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: queryKeys.school.integrations }) },
  })
}
