/* Display-time casing: lowercase names/cities → first letter capital (Title Case). */

const SMALL_WORDS = new Set(['of', 'and', 'the', 'in', 'on', 'at', 'for', 'to', 'a', 'an'])

function wordCase(word: string, index: number, opts?: { allowAcronym?: boolean }): string {
  if (!word) return word
  /* Keep tokens that already look like codes: IV-B, STU/26 */
  if (/[0-9/]/.test(word) && /[A-Za-z]/.test(word) === false) return word
  if (/^[A-Z0-9]{2,6}$/.test(word) && word === word.toUpperCase()) return word

  const letters = word.replace(/[^A-Za-z]/g, '')
  /* Short all-letter acronyms only when standalone (e.g. school name "scc") */
  if (
    opts?.allowAcronym
    && letters.length > 0
    && letters.length <= 3
    && word === word.toLowerCase()
    && !/[^a-z]/i.test(word)
  ) {
    return word.toUpperCase()
  }

  const lower = word.toLowerCase()
  if (index > 0 && SMALL_WORDS.has(lower)) return lower
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Person / school / exam display name — Title Case; short acronyms UPPER. */
export function properName(raw?: string | null): string {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s || s === '—' || s === '-') return s
  const allowAcronym = !/\s/.test(s)
  return s
    .split(/(\s+|[-–—])/g)
    .map((part, i, arr) => {
      if (/^\s+$/.test(part) || /^[-–—]$/.test(part)) return part
      const wordIndex = arr.slice(0, i).filter((p) => p && !/^\s+$/.test(p) && !/^[-–—]$/.test(p)).length
      return wordCase(part, wordIndex, { allowAcronym })
    })
    .join('')
}

/** City / place line — Title Case (keeps commas). */
export function properPlace(raw?: string | null): string {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return s
  return s
    .split(/(,\s*)/g)
    .map((part) => {
      if (/^,\s*$/.test(part)) return part
      return part
        .split(/\s+/)
        .map((w, i) => wordCase(w, i, { allowAcronym: false }))
        .join(' ')
    })
    .join('')
}
