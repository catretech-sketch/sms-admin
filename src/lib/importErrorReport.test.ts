import { describe, it, expect } from 'vitest'
import { errorRowsToCsv } from './importErrorReport'

describe('errorRowsToCsv', () => {
  it('renders CSV with headers and data rows including errorReason', () => {
    const csv = errorRowsToCsv([
      { row: '182', firstName: 'Rahul', lastName: 'Sharma', cls: 'X-A', phone: 'XXXXX', errorReason: 'Invalid phone number' },
      { row: '427', firstName: 'Amit', lastName: 'Kumar', cls: 'IX-B', phone: 'XXXXX', errorReason: 'Invalid class' },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('row,firstName,lastName,cls,phone,errorReason')
    expect(lines[1]).toBe('182,Rahul,Sharma,X-A,XXXXX,Invalid phone number')
    expect(lines[2]).toBe('427,Amit,Kumar,IX-B,XXXXX,Invalid class')
  })

  it('returns empty string for an empty list', () => {
    expect(errorRowsToCsv([])).toBe('')
  })

  it('escapes values containing commas by wrapping in quotes', () => {
    const csv = errorRowsToCsv([
      { name: 'Smith, Jr.', reason: 'Test' },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('name,reason')
    expect(lines[1]).toBe('"Smith, Jr.",Test')
  })

  it('escapes values containing double-quotes by doubling internal quotes', () => {
    const csv = errorRowsToCsv([
      { quote: 'Said "hello" there', reason: 'Test' },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('quote,reason')
    expect(lines[1]).toBe('"Said ""hello"" there",Test')
  })

  it('escapes values containing newlines by wrapping in quotes', () => {
    const csv = errorRowsToCsv([
      { multiline: 'Line1\nLine2', reason: 'Test' },
    ])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('multiline,reason')
    expect(lines[1]).toBe('"Line1')
    expect(lines[2]).toBe('Line2",Test')
  })
})
