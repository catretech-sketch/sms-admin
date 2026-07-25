import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'

/* Test isolation: give every test a clean slate so leaked state can't bleed
   between files/tests.

   - Storage: AppProvider persists UI/session to local/sessionStorage; a stale
     entry would make its mount restore effect clobber the current view.
   - fetch: default every test to a benign 200 empty-envelope response so no test
     accidentally hits the real network. A pending real request from one test can
     otherwise resolve during a later test, trip the API client's auth-failure
     path, and force a global logout() that resets the active view. Tests that
     need specific responses still override this with vi.stubGlobal('fetch', …). */
function benignFetch(): Response {
  return new Response(JSON.stringify({ data: [], next_cursor: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  globalThis.fetch = (() => Promise.resolve(benignFetch())) as typeof fetch
})

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
