import { describe, it, expect } from 'vitest'
import { ApiError } from './ApiError'

describe('ApiError', () => {
  it('carries status, code, message, and details', () => {
    const e = new ApiError(404, 'not_found', 'missing', { id: ['required'] })
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(404)
    expect(e.code).toBe('not_found')
    expect(e.message).toBe('missing')
    expect(e.details).toEqual({ id: ['required'] })
  })

  it('defaults details to null', () => {
    expect(new ApiError(500, 'internal_error', 'boom').details).toBeNull()
  })
})
