import { describe, expect, it } from 'vitest'
import { properName, properPlace } from './properCase'

describe('properName', () => {
  it('title-cases person names from lowercase', () => {
    expect(properName('rahul shrma')).toBe('Rahul Shrma')
    expect(properName('VAIBHAV Dubey')).toBe('Vaibhav Dubey')
  })

  it('uppercases short acronyms', () => {
    expect(properName('scc')).toBe('SCC')
    expect(properName('half')).toBe('Half')
  })

  it('preserves empty / dash', () => {
    expect(properName('')).toBe('')
    expect(properName('  ')).toBe('')
    expect(properName('—')).toBe('—')
  })
})

describe('properPlace', () => {
  it('title-cases city and state', () => {
    expect(properPlace('gorkhpur, Uttar Pradesh')).toBe('Gorkhpur, Uttar Pradesh')
    expect(properPlace('new delhi')).toBe('New Delhi')
  })
})
