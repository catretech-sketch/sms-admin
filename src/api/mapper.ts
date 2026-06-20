const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const snakeKey = (k: string): string => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const camelKey = (k: string): string => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())

function convert(input: unknown, keyFn: (k: string) => string): unknown {
  if (Array.isArray(input)) return input.map((v) => convert(v, keyFn))
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) out[keyFn(k)] = convert(v, keyFn)
    return out
  }
  return input
}

export function snakeToCamel<T = unknown>(input: unknown): T { return convert(input, snakeKey) as T }
export function camelToSnake(input: unknown): unknown { return convert(input, camelKey) }
