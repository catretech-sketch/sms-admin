import { describe, it, expect } from 'vitest'
import { config } from './config'

describe('config', () => {
  it('exposes an apiBaseUrl ending in /v1', () => {
    expect(config.apiBaseUrl).toMatch(/\/v1$/)
  })
})
