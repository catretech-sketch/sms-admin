/* ============================================================
   SchoolMate — Tier + role gating
   Ported from data.jsx. UI-side gating only; the future
   .NET API must enforce the same matrix server-side.
   ============================================================ */
import type { Tier, Role, Cap } from '@/types'
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
