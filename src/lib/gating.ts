/* ============================================================
   SchoolMate — Tier + role gating
   Ported from data.jsx. UI-side gating only; the future
   .NET API must enforce the same matrix server-side.
   ============================================================ */
import type { Tier, Role, Cap, UserOverrides, CellState } from '@/types'
import { TIERS, FEATURE_TIER, PERMS } from '@/data/mockDb'

export function tierIncludes(plan: Tier, feature: string): boolean {
  const need = FEATURE_TIER[feature] || 'silver'
  return TIERS.indexOf(plan) >= TIERS.indexOf(need)
}

export function requiredTier(feature: string): Tier {
  return FEATURE_TIER[feature] || 'silver'
}

export function can(role: Role, module: string, cap: Cap): boolean {
  const m = PERMS[module]
  if (!m) return false
  return (m[role] || []).indexOf(cap) >= 0
}

export function caps(role: Role, module: string): Cap[] {
  return (PERMS[module] || {})[role] || []
}

const CAP_ORDER: Cap[] = ['V', 'E', 'A']

/** Next state when a per-user capability cell is clicked. */
export const NEXT_CELL_STATE: Record<CellState, CellState> = {
  inherit: 'grant',
  grant: 'revoke',
  revoke: 'inherit',
}

/** Override state of a single capability cell for a user (inherit if unset). */
export function cellState(module: string, cap: Cap, overrides: UserOverrides): CellState {
  return overrides[module]?.[cap] ?? 'inherit'
}

/** Effective caps for a user = role caps + grants − revokes, ordered V→E→A. */
export function effectiveCaps(role: Role, module: string, overrides: UserOverrides): Cap[] {
  const set = new Set<Cap>(caps(role, module))
  const mod = overrides[module]
  if (mod) {
    for (const cap of CAP_ORDER) {
      if (mod[cap] === 'grant') set.add(cap)
      else if (mod[cap] === 'revoke') set.delete(cap)
    }
  }
  return CAP_ORDER.filter((c) => set.has(c))
}

/** Count of non-inherit cells across all modules. */
export function overrideCount(overrides: UserOverrides): number {
  return Object.values(overrides).reduce((n, m) => n + Object.keys(m).length, 0)
}
