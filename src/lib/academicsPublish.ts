/* School-scoped draft / published snapshots for Academics tabs
   (Periods, Timetable, Tests) until dedicated APIs exist. */
import { tokenStore } from '@/api/auth/tokenStore'

export type AcademicsPublishTab = 'periods' | 'timetable' | 'tests'

export type PublishStatus = 'empty' | 'draft' | 'published' | 'unpublished'

export interface PublishEnvelope<T> {
  draft: T | null
  published: T | null
  draftSavedAt: string | null
  publishedAt: string | null
}

function tenantKey(): string {
  return tokenStore.getTenantId() || 'default'
}

function storageKey(tab: AcademicsPublishTab): string {
  return `sms_academics_pub:${tenantKey()}:${tab}`
}

function emptyEnvelope<T>(): PublishEnvelope<T> {
  return { draft: null, published: null, draftSavedAt: null, publishedAt: null }
}

export function loadPublishEnvelope<T>(tab: AcademicsPublishTab): PublishEnvelope<T> {
  try {
    const raw = localStorage.getItem(storageKey(tab))
    if (!raw) return emptyEnvelope()
    const parsed = JSON.parse(raw) as Partial<PublishEnvelope<T>>
    return {
      draft: parsed.draft ?? null,
      published: parsed.published ?? null,
      draftSavedAt: parsed.draftSavedAt ?? null,
      publishedAt: parsed.publishedAt ?? null,
    }
  } catch {
    return emptyEnvelope()
  }
}

function writeEnvelope<T>(tab: AcademicsPublishTab, env: PublishEnvelope<T>): void {
  localStorage.setItem(storageKey(tab), JSON.stringify(env))
}

export function saveDraftSnapshot<T>(tab: AcademicsPublishTab, draft: T): PublishEnvelope<T> {
  const prev = loadPublishEnvelope<T>(tab)
  const next: PublishEnvelope<T> = {
    ...prev,
    draft,
    draftSavedAt: new Date().toISOString(),
  }
  writeEnvelope(tab, next)
  return next
}

export function publishSnapshot<T>(tab: AcademicsPublishTab, draft: T): PublishEnvelope<T> {
  const now = new Date().toISOString()
  const next: PublishEnvelope<T> = {
    draft,
    published: draft,
    draftSavedAt: now,
    publishedAt: now,
  }
  writeEnvelope(tab, next)
  return next
}

export function publishStatusOf<T>(env: PublishEnvelope<T>, current: T): PublishStatus {
  const cur = JSON.stringify(current)
  const pub = env.published == null ? null : JSON.stringify(env.published)
  if (pub == null && env.draft == null && (current == null || cur === 'null' || cur === '[]' || cur === '{}')) {
    return 'empty'
  }
  if (pub == null) return 'draft'
  if (pub === cur) return 'published'
  return 'unpublished'
}

/** Prefer draft for editors; published (fallback draft) for view-only. */
export function activeSnapshot<T>(env: PublishEnvelope<T>, editable: boolean, fallback: T): T {
  if (editable) {
    if (env.draft != null) return env.draft
    if (env.published != null) return env.published
    return fallback
  }
  if (env.published != null) return env.published
  if (env.draft != null) return env.draft
  return fallback
}

export function statusLabel(s: PublishStatus): string {
  switch (s) {
    case 'empty': return 'Nothing saved'
    case 'draft': return 'Draft'
    case 'published': return 'Published'
    case 'unpublished': return 'Unpublished changes'
  }
}

export function statusTone(s: PublishStatus): 'neutral' | 'warning' | 'success' | 'info' {
  switch (s) {
    case 'empty': return 'neutral'
    case 'draft': return 'info'
    case 'published': return 'success'
    case 'unpublished': return 'warning'
  }
}

export function formatPublishTime(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return null
  }
}

/** Human-readable draft / published timestamps for tab headers. */
export function publishMetaLine(draftSavedAt: string | null, publishedAt: string | null): string | null {
  const draft = formatPublishTime(draftSavedAt)
  const pub = formatPublishTime(publishedAt)
  if (pub && draft && publishedAt !== draftSavedAt) return `Draft ${draft} · Published ${pub}`
  if (pub) return `Published ${pub}`
  if (draft) return `Draft saved ${draft}`
  return null
}

/** Show Publish only when work is saved as draft and differs from the live published copy. */
export function showPublishButton<T>(status: PublishStatus, env: PublishEnvelope<T>, current: T): boolean {
  if (status === 'published' || status === 'empty') return false
  if (env.draft == null) return false
  return JSON.stringify(env.draft) === JSON.stringify(current)
}
