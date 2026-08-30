/** Local, per-browser log of AI Mode queries the local resolver couldn't handle
 *  (Unsupported/WriteBlocked) — collected so real usage patterns can be reviewed
 *  later and used to intentionally improve intent matching. This never changes
 *  AI behavior automatically: it is write-only until a developer reviews it,
 *  and reviewing it never happens inside this app. */

export interface AiSearchLogEntry {
  question: string
  language: string | null
  intent: string | null
  role: string
  timestamp: string
}

const STORAGE_KEY = 'sm_ai_search_unsupported_log'
const MAX_ENTRIES = 200

function readLog(): AiSearchLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Best-effort — logging must never break the app if localStorage is unavailable or full. */
export function logUnsupportedAiQuery(entry: Omit<AiSearchLogEntry, 'timestamp'>): void {
  try {
    const log = readLog()
    log.push({ ...entry, timestamp: new Date().toISOString() })
    const trimmed = log.length > MAX_ENTRIES ? log.slice(log.length - MAX_ENTRIES) : log
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    /* ignore */
  }
}

export function getAiSearchQueryLog(): AiSearchLogEntry[] {
  try {
    return readLog()
  } catch {
    return []
  }
}

export function clearAiSearchQueryLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
