import { describe, it, expect } from 'vitest'
import { normalizePhone, findAccountByIdentifier } from './LoginScreen'

describe('LoginScreen helpers', () => {
  it('normalizePhone strips non-digits', () => {
    expect(normalizePhone('+91 98100 10002')).toBe('919810010002')
    expect(normalizePhone('98100-10002')).toBe('9810010002')
  })

  it('findAccountByIdentifier matches by email, any case', () => {
    expect(findAccountByIdentifier('admin@greenwood.edu')?.name).toBe('Ravi Menon')
    expect(findAccountByIdentifier('  ADMIN@greenwood.edu ')?.name).toBe('Ravi Menon')
  })

  it('findAccountByIdentifier matches by phone, formatted or raw', () => {
    expect(findAccountByIdentifier('+91 98100 10003')?.name).toBe('Sunita Rao')
    expect(findAccountByIdentifier('9810010003')?.name).toBe('Sunita Rao')
  })

  it('findAccountByIdentifier honours the 10-digit guard and tail-matches', () => {
    expect(findAccountByIdentifier('nobody@nowhere.com')).toBeNull()
    expect(findAccountByIdentifier('0000000000')).toBeNull()
    expect(findAccountByIdentifier('')).toBeNull()
    expect(findAccountByIdentifier('981001000')).toBeNull()            // 9 digits — below the 10-digit guard
    expect(findAccountByIdentifier('00919810010002')?.name).toBe('Ravi Menon') // 14 digits, last-10 tail matches admin
  })
})
