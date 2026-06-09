/* ============================================================
   SchoolMate — Form field validators (pure, framework-free).
   Each returns an error message string, or null when valid.
   Empty/optional values are treated as valid; required-ness is
   enforced separately via `required`.
   ============================================================ */

export interface FileLike {
  name: string
  size: number
  type?: string
}

export const ALLOWED_FILE_TYPES = ['pdf', 'jpg', 'jpeg', 'png']
export const MAX_FILE_MB = 4

const isBlank = (v: string | null | undefined): boolean => !v || !v.trim()

/** Non-empty check for required fields. */
export function required(value: string | null | undefined): string | null {
  return isBlank(value) ? 'This field is required' : null
}

/** Aadhaar: exactly 12 digits (spaces ignored). Empty is allowed. */
export function validateAadhaar(value: string | null | undefined): string | null {
  if (isBlank(value)) return null
  const digits = (value as string).replace(/\s+/g, '')
  return /^\d{12}$/.test(digits) ? null : 'Aadhaar must be exactly 12 digits'
}

/** File type (by extension) + size ceiling. null file is allowed. */
export function validateFile(
  file: FileLike | null | undefined,
  opts: { maxMb?: number; types?: string[] } = {},
): string | null {
  if (!file) return null
  const maxMb = opts.maxMb ?? MAX_FILE_MB
  const types = opts.types ?? ALLOWED_FILE_TYPES
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!types.includes(ext)) return `Allowed formats: ${types.map((t) => t.toUpperCase()).join(', ')}`
  if (file.size > maxMb * 1024 * 1024) return `File must be ${maxMb} MB or smaller`
  return null
}

/** Basic email shape. Empty is allowed. */
export function validateEmail(value: string | null | undefined): string | null {
  if (isBlank(value)) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value as string).trim()) ? null : 'Enter a valid email address'
}

/** Basic phone: 10–13 digits after stripping non-digits. Empty is allowed. */
export function validatePhone(value: string | null | undefined): string | null {
  if (isBlank(value)) return null
  const digits = (value as string).replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 13 ? null : 'Enter a valid phone number'
}
