import type { SalaryProfile, SalaryStructure, UpsertSalaryInput, PersonType } from '@/api/payroll'
import { toAmount } from '@/lib/payroll'

const amt = (n: number): string => (n > 0 ? String(n) : '')

export function salaryStructureToFormFields(s: SalaryStructure): Record<string, string> {
  return {
    basicSalary: amt(s.basic),
    hra: amt(s.hra),
    allowances: amt(s.allowances),
    epf: amt(s.epf),
    profTax: amt(s.profTax),
    otherDeductions: amt(s.otherDeductions),
  }
}

/** Profile overrides structure; zero/blank profile fields inherit structure for display. */
export function mergeSalaryDisplayFields(
  profile: SalaryProfile | undefined,
  structure: SalaryStructure | undefined,
): Record<string, string> {
  const struct = structure ? salaryStructureToFormFields(structure) : {}
  if (!profile) return struct

  const pick = (profileVal: number, structKey: string) =>
    profileVal > 0 ? String(profileVal) : struct[structKey] ?? ''

  return {
    basicSalary: pick(profile.basicSalary, 'basicSalary'),
    hra: pick(profile.hra, 'hra'),
    allowances: pick(profile.allowances, 'allowances'),
    epf: pick(profile.epf, 'epf'),
    profTax: pick(profile.profTax, 'profTax'),
    otherDeductions: pick(profile.otherDeductions, 'otherDeductions'),
    uan: profile.uan ?? '',
    accHolder: profile.bankHolder ?? '',
    accNumber: profile.bankAccount ?? '',
    bankName: profile.bankName ?? '',
    ifsc: profile.ifsc ?? '',
    branch: profile.bankBranch ?? '',
  }
}

export function findSalaryProfile(
  profiles: SalaryProfile[] | undefined,
  personType: PersonType,
  personId: string,
): SalaryProfile | undefined {
  return (profiles ?? []).find((p) => p.personType === personType && p.personId === personId)
}

export function findSalaryStructure(
  structures: SalaryStructure[] | undefined,
  personType: PersonType,
  roleKey: string,
): SalaryStructure | undefined {
  const key = roleKey.trim().toLowerCase()
  if (!key) return undefined
  return (structures ?? []).find(
    (s) => s.personType === personType && s.roleKey.trim().toLowerCase() === key,
  )
}

/** Save effective pay — blank form fields inherit the role structure before upsert. */
export function upsertInputFromForm(
  f: Record<string, string>,
  structure?: SalaryStructure,
): UpsertSalaryInput {
  const pick = (formKey: string, structVal = 0) => {
    const v = toAmount(f[formKey])
    if (v > 0) return v
    return structVal > 0 ? structVal : 0
  }

  return {
    basicSalary: pick('basicSalary', structure?.basic),
    hra: pick('hra', structure?.hra),
    allowances: pick('allowances', structure?.allowances),
    epf: pick('epf', structure?.epf),
    profTax: pick('profTax', structure?.profTax),
    otherDeductions: pick('otherDeductions', structure?.otherDeductions),
    uan: String(f.uan ?? '').trim() || undefined,
    bankHolder: String(f.accHolder ?? '').trim() || undefined,
    bankAccount: String(f.accNumber ?? '').trim() || undefined,
    bankName: String(f.bankName ?? '').trim() || undefined,
    ifsc: String(f.ifsc ?? '').trim() || undefined,
    bankBranch: String(f.branch ?? '').trim() || undefined,
  }
}
