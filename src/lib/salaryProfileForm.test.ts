import { describe, expect, it } from 'vitest'
import { mergeSalaryDisplayFields, upsertInputFromForm } from './salaryProfileForm'
import type { SalaryProfile, SalaryStructure } from '@/api/payroll'

const hodStructure: SalaryStructure = {
  personType: 'teacher',
  roleKey: 'HOD',
  basic: 12000,
  hra: 3000,
  allowances: 1500,
  epf: 0,
  profTax: 200,
  otherDeductions: 0,
}

const profilePartial: SalaryProfile = {
  personType: 'teacher',
  personId: 't1',
  basicSalary: 15000,
  hra: 0,
  allowances: 0,
  epf: 0,
  profTax: 0,
  otherDeductions: 0,
}

describe('mergeSalaryDisplayFields', () => {
  it('inherits structure when profile component is zero', () => {
    const fields = mergeSalaryDisplayFields(profilePartial, hodStructure)
    expect(fields.basicSalary).toBe('15000')
    expect(fields.hra).toBe('3000')
    expect(fields.allowances).toBe('1500')
    expect(fields.profTax).toBe('200')
  })
})

describe('upsertInputFromForm', () => {
  it('fills blank form fields from structure on save', () => {
    const input = upsertInputFromForm({ basicSalary: '15000' }, hodStructure)
    expect(input.basicSalary).toBe(15000)
    expect(input.hra).toBe(3000)
    expect(input.allowances).toBe(1500)
    expect(input.profTax).toBe(200)
  })
})
