import {
  useQuery, useMutation, useQueryClient,
  type UseQueryResult, type UseMutationResult,
} from '@tanstack/react-query'
import {
  listSalaryProfiles, getPayrollRun, runPayroll, approvePayroll, upsertSalaryProfile,
  listSalaryStructures, upsertSalaryStructure,
  type SalaryProfile, type PayrollRun, type PersonType, type UpsertSalaryInput,
  type SalaryStructure, type UpsertSalaryStructureInput,
} from '../payroll'
import { queryKeys } from '../queryKeys'

export function useSalaryProfiles(): UseQueryResult<SalaryProfile[]> {
  return useQuery({ queryKey: queryKeys.payroll.salaryProfiles, queryFn: () => listSalaryProfiles() })
}

export function useSalaryStructures(): UseQueryResult<SalaryStructure[]> {
  return useQuery({ queryKey: queryKeys.payroll.salaryStructures, queryFn: () => listSalaryStructures() })
}

export function useUpsertSalaryStructure(): UseMutationResult<
  SalaryStructure,
  Error,
  UpsertSalaryStructureInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertSalaryStructureInput) => upsertSalaryStructure(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payroll.salaryStructures })
      // A structure change re-prices any draft payroll run + its payslips + the preview.
      qc.invalidateQueries({ queryKey: queryKeys.payroll.runAll })
      qc.invalidateQueries({ queryKey: ['payroll', 'preview'] })
    },
  })
}

export function usePayrollRun(period: string, enabled = true): UseQueryResult<PayrollRun> {
  return useQuery({
    queryKey: queryKeys.payroll.run(period),
    queryFn: () => getPayrollRun(period),
    enabled: enabled && !!period,
  })
}

/** Live re-priced preview from current salary structures/profiles (ignores any frozen run). */
export function usePayrollPreview(period: string, enabled = true): UseQueryResult<PayrollRun> {
  return useQuery({
    queryKey: queryKeys.payroll.preview(period),
    queryFn: () => getPayrollRun(period, true),
    enabled: enabled && !!period,
  })
}

export function useRunPayroll(): UseMutationResult<PayrollRun, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (period: string) => runPayroll(period),
    onSuccess: (run) => {
      qc.setQueryData(queryKeys.payroll.run(run.period), run)
    },
  })
}

export function useApprovePayroll(): UseMutationResult<PayrollRun, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (period: string) => approvePayroll(period),
    onSuccess: (run) => {
      qc.setQueryData(queryKeys.payroll.run(run.period), run)
    },
  })
}

export function useUpsertSalaryProfile(): UseMutationResult<
  SalaryProfile,
  Error,
  { personType: PersonType; personId: string; input: UpsertSalaryInput }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ personType, personId, input }) => upsertSalaryProfile(personType, personId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payroll.salaryProfiles })
      // A person's pay change re-prices any draft payroll run + its payslips + the preview.
      qc.invalidateQueries({ queryKey: queryKeys.payroll.runAll })
      qc.invalidateQueries({ queryKey: ['payroll', 'preview'] })
    },
  })
}
