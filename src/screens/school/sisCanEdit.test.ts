import { describe, it, expect } from 'vitest'
import { canEdit } from './sis'

describe('canEdit — owner ≡ admin gate', () => {
  it('returns true for admin', () => {
    expect(canEdit('admin')).toBe(true)
  })

  it('returns true for owner (must equal admin)', () => {
    expect(canEdit('owner')).toBe(true)
  })

  it('canEdit(owner) === canEdit(admin)', () => {
    expect(canEdit('owner')).toBe(canEdit('admin'))
  })

  it('returns true for principal', () => {
    expect(canEdit('principal')).toBe(true)
  })

  it('returns true for vice_principal', () => {
    expect(canEdit('vice_principal')).toBe(true)
  })

  it('returns false for teacher', () => {
    expect(canEdit('teacher')).toBe(false)
  })
})
