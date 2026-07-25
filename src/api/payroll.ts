import { request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

export type PersonType = 'teacher' | 'staff' | 'leadership'
export type PayrollStatus = 'draft' | 'run' | 'approved'

export interface SalaryProfile {
  personType: PersonType
  personId: string
  basicSalary: number
  hra: number
  allowances: number
  epf: number
  profTax: number
  otherDeductions: number
  uan?: string
  bankHolder?: string
  bankAccount?: string
  bankName?: string
  ifsc?: string
  bankBranch?: string
}

export interface UpsertSalaryInput {
  basicSalary: number
  hra: number
  allowances: number
  epf: number
  profTax: number
  otherDeductions: number
  uan?: string
  bankHolder?: string
  bankAccount?: string
  bankName?: string
  ifsc?: string
  bankBranch?: string
}

/** Salary structure template keyed by teacher designation or staff role. */
export interface SalaryStructure {
  personType: PersonType
  roleKey: string
  basic: number
  hra: number
  allowances: number
  epf: number
  profTax: number
  otherDeductions: number
}

export interface UpsertSalaryStructureInput {
  personType: PersonType
  roleKey: string
  basic: number
  hra: number
  allowances: number
  epf: number
  profTax: number
  otherDeductions: number
}

export interface PayrollLine {
  personType: PersonType
  personId: string
  name: string
  role?: string
  dept?: string
  basic: number
  hra: number
  allowances: number
  epf: number
  profTax: number
  otherDeductions: number
  gross: number
  deductions: number
  net: number
}

export interface PayrollRun {
  period: string
  year: number
  month?: string
  status: PayrollStatus
  staffCount: number
  gross: number
  deductions: number
  net: number
  runAt?: string
  approvedAt?: string
  lines: PayrollLine[]
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toProfile(row: Record<string, unknown>): SalaryProfile {
  const c = snakeToCamel<Record<string, unknown>>(row)
  return {
    personType: (String(c.personType ?? 'staff').toLowerCase() as PersonType),
    personId: String(c.personId ?? ''),
    basicSalary: num(c.basicSalary),
    hra: num(c.hra),
    allowances: num(c.allowances),
    epf: num(c.epf),
    profTax: num(c.profTax),
    otherDeductions: num(c.otherDeductions),
    uan: c.uan != null ? String(c.uan) : undefined,
    bankHolder: c.bankHolder != null ? String(c.bankHolder) : undefined,
    bankAccount: c.bankAccount != null ? String(c.bankAccount) : undefined,
    bankName: c.bankName != null ? String(c.bankName) : undefined,
    ifsc: c.ifsc != null ? String(c.ifsc) : undefined,
    bankBranch: c.bankBranch != null ? String(c.bankBranch) : undefined,
  }
}

function toStructure(row: Record<string, unknown>): SalaryStructure {
  const c = snakeToCamel<Record<string, unknown>>(row)
  return {
    personType: (String(c.personType ?? 'staff').toLowerCase() as PersonType),
    roleKey: String(c.roleKey ?? ''),
    basic: num(c.basic),
    hra: num(c.hra),
    allowances: num(c.allowances),
    epf: num(c.epf),
    profTax: num(c.profTax),
    otherDeductions: num(c.otherDeductions),
  }
}

function toLine(row: Record<string, unknown>): PayrollLine {
  const c = snakeToCamel<Record<string, unknown>>(row)
  return {
    personType: (String(c.personType ?? 'staff').toLowerCase() as PersonType),
    personId: String(c.personId ?? ''),
    name: String(c.name ?? ''),
    role: c.role != null ? String(c.role) : undefined,
    dept: c.dept != null ? String(c.dept) : undefined,
    basic: num(c.basic),
    hra: num(c.hra),
    allowances: num(c.allowances),
    epf: num(c.epf),
    profTax: num(c.profTax),
    otherDeductions: num(c.otherDeductions),
    gross: num(c.gross),
    deductions: num(c.deductions),
    net: num(c.net),
  }
}

function toRun(raw: unknown): PayrollRun {
  const c = snakeToCamel<Record<string, unknown>>((raw ?? {}) as Record<string, unknown>)
  const status = String(c.status ?? 'draft').toLowerCase() as PayrollStatus
  const lines = Array.isArray(c.lines) ? (c.lines as Record<string, unknown>[]).map(toLine) : []
  return {
    period: String(c.period ?? ''),
    year: num(c.year),
    month: c.month != null ? String(c.month) : undefined,
    status,
    staffCount: num(c.staffCount),
    gross: num(c.gross),
    deductions: num(c.deductions),
    net: num(c.net),
    runAt: c.runAt != null ? String(c.runAt) : undefined,
    approvedAt: c.approvedAt != null ? String(c.approvedAt) : undefined,
    lines,
  }
}

export async function listSalaryProfiles(): Promise<SalaryProfile[]> {
  const data = await request<Record<string, unknown>[] | null>('/payroll/salary-profiles')
  return (data ?? []).map(toProfile)
}

export async function upsertSalaryProfile(
  personType: PersonType,
  personId: string,
  input: UpsertSalaryInput,
): Promise<SalaryProfile> {
  const data = await request<Record<string, unknown>>(
    `/payroll/salary-profiles/${personType}/${personId}`,
    { method: 'PUT', body: camelToSnake(input) },
  )
  return toProfile(data)
}

export async function listSalaryStructures(): Promise<SalaryStructure[]> {
  const data = await request<Record<string, unknown>[] | null>('/payroll/salary-structures')
  return (data ?? []).map(toStructure)
}

export async function upsertSalaryStructure(input: UpsertSalaryStructureInput): Promise<SalaryStructure> {
  const data = await request<Record<string, unknown>>(
    '/payroll/salary-structures',
    { method: 'PUT', body: camelToSnake(input) },
  )
  return toStructure(data)
}

export async function getPayrollRun(period: string, preview = false): Promise<PayrollRun> {
  const qs = preview ? '?preview=true' : ''
  const data = await request<Record<string, unknown>>(`/payroll/runs/${period}${qs}`)
  return toRun(data)
}

export async function runPayroll(period: string): Promise<PayrollRun> {
  const data = await request<Record<string, unknown>>(`/payroll/runs/${period}/run`, { method: 'POST' })
  return toRun(data)
}

export async function approvePayroll(period: string): Promise<PayrollRun> {
  const data = await request<Record<string, unknown>>(`/payroll/runs/${period}/approve`, { method: 'POST' })
  return toRun(data)
}
