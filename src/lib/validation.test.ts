import { describe, it, expect } from 'vitest'
import {
  required, validateAadhaar, validateFile, validateEmail, validatePhone, MAX_FILE_MB,
} from './validation'

describe('required', () => {
  it('rejects empty / whitespace', () => {
    expect(required('')).not.toBeNull()
    expect(required('   ')).not.toBeNull()
    expect(required(undefined)).not.toBeNull()
  })
  it('accepts non-empty', () => {
    expect(required('Aarav')).toBeNull()
  })
})

describe('validateAadhaar', () => {
  it('accepts exactly 12 digits', () => {
    expect(validateAadhaar('123456789012')).toBeNull()
  })
  it('accepts 12 digits with spaces', () => {
    expect(validateAadhaar('1234 5678 9012')).toBeNull()
  })
  it('treats empty as valid (optional)', () => {
    expect(validateAadhaar('')).toBeNull()
    expect(validateAadhaar(undefined)).toBeNull()
  })
  it('rejects wrong length', () => {
    expect(validateAadhaar('1234567890')).not.toBeNull()
    expect(validateAadhaar('1234567890123')).not.toBeNull()
  })
  it('rejects non-digits', () => {
    expect(validateAadhaar('12345678901X')).not.toBeNull()
  })
})

describe('validateFile', () => {
  it('accepts a valid pdf under the size limit', () => {
    expect(validateFile({ name: 'aadhaar.pdf', size: 1_000_000 })).toBeNull()
  })
  it('accepts jpg/jpeg/png', () => {
    expect(validateFile({ name: 'photo.JPG', size: 100 })).toBeNull()
    expect(validateFile({ name: 'photo.jpeg', size: 100 })).toBeNull()
    expect(validateFile({ name: 'photo.png', size: 100 })).toBeNull()
  })
  it('treats null as valid (optional)', () => {
    expect(validateFile(null)).toBeNull()
  })
  it('rejects disallowed types', () => {
    expect(validateFile({ name: 'doc.docx', size: 100 })).not.toBeNull()
    expect(validateFile({ name: 'noext', size: 100 })).not.toBeNull()
  })
  it('rejects files over the size limit', () => {
    expect(validateFile({ name: 'big.png', size: (MAX_FILE_MB + 1) * 1024 * 1024 })).not.toBeNull()
  })
})

describe('validateEmail', () => {
  it('accepts a normal address', () => {
    expect(validateEmail('a.b@school.edu')).toBeNull()
  })
  it('treats empty as valid', () => {
    expect(validateEmail('')).toBeNull()
  })
  it('rejects malformed', () => {
    expect(validateEmail('not-an-email')).not.toBeNull()
    expect(validateEmail('a@b')).not.toBeNull()
  })
})

describe('validatePhone', () => {
  it('accepts 10-digit numbers', () => {
    expect(validatePhone('9876543210')).toBeNull()
  })
  it('accepts +91 prefixed numbers', () => {
    expect(validatePhone('+91 98765 43210')).toBeNull()
  })
  it('treats empty as valid', () => {
    expect(validatePhone('')).toBeNull()
  })
  it('rejects too-short numbers', () => {
    expect(validatePhone('12345')).not.toBeNull()
  })
})
