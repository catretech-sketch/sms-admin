import type { ListEnvelope } from './types'

export type ClientStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
export type PlanTier = 'trial' | 'silver' | 'gold' | 'platinum' | 'metered' | 'exclusive'

export interface Client {
  id: string
  name: string
  slug: string
  country: string | null
  status: ClientStatus
  plan_id: string | null
  plan_name: string | null
  tier: string | null
  mrr: number
  students_count: number
  staff_count: number
  storage_gb: number
  created: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  health_score: number
}

export interface CreateClientBody {
  name: string
  slug: string
  country?: string
  admin_name?: string
  admin_email?: string
  admin_phone?: string
  plan_id: string
  trial_days: number
  address?: string
  csm?: string | null
}

export interface CreateMySchoolBody {
  name: string
  slug: string
  country?: string
  plan_id: string
  admin_name?: string
  admin_phone?: string
  address?: string
  trial_days?: number
}

export interface Plan {
  id: string
  name: string
  tier: string
  pricing: string
  price: number
  per_student: number | null
  min_students: number | null
  period: string
  visibility: string
  audience: string
  description: string | null
  color: string | null
}

export interface DashboardOverview {
  counts: { total: number; active: number; trial: number; suspended: number; cancelled: number }
  mrr: number
  trials_ending: number
  churn_pct: number
  months: string[]
  mrr_series: number[]
  signup_series: number[]
  plan_mix: { label: string; value: number; color: string | null }[]
  usage_alerts: { tenant: string; metric: string; used: number; limit: number; pct: number }[]
  system_health: { name: string; status: string; latency: string; uptime: string }[]
  recent_activity: { actor: string | null; action: string | null; target: string | null; kind: string | null; at: string }[]
}

/** School-wise student fee cash rollup for owner portfolio. */
export interface FeeSchoolSummary {
  tenant_id: string
  name: string
  collected: number
  outstanding: number
  payment_count: number
  invoice_count: number
}

export interface FeeSummaryResponse {
  period: { from: string; to: string }
  schools: FeeSchoolSummary[]
  totals: {
    collected: number
    outstanding: number
    payment_count: number
    invoice_count: number
  }
}

export type { ListEnvelope }
