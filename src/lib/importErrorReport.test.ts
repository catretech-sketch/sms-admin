import { describe, it, expect } from 'vitest'
import { errorRowsToCsv } from './importErrorReport'

describe('errorRowsToCsv', () => {
  it('renders headers from the first row plus a trailing Error Reason column', () => {
    const csv = errorRowsToCsv([
      { row: '182', firstName: 'Rahul', lastName: 'Sharma', cls: 'X-A', phone: 'XXXXX', errorReason: 'Invalid phone number' },
      { row: '427', firstName: 'Amit', lastName: 'Kumar', cls: 'IX-B', phone: 'XXXXX', errorReason: 'Invalid class' },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('row,firstName,lastName,cls,phone,errorReason')
    expect(lines[1]).toBe('182,Rahul,Sharma,X-A,XXXXX,Invalid phone number')
    expect(lines[2]).toBe('427,Amit,Kumar,IX-B,XXXXX,Invalid class')
  })

  it('returns just a header row for an empty list', () => {
    expect(errorRowsToCsv([])).toBe('')
  })
})
