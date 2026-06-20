export class ApiError extends Error {
  status: number
  code: string
  details: Record<string, string[]> | null
  constructor(status: number, code: string, message: string, details: Record<string, string[]> | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
