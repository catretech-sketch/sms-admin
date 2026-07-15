import type { AuthTokens } from '../types'

const REFRESH_KEY = 'sms_admin_refresh'
const ACCESS_KEY = 'sms_admin_access'
const TENANT_KEY = 'sms_admin_tenant'
const EMAIL_KEY = 'sms_admin_email'
const UI_KEY = 'sms_admin_ui'
const BRAND_KEY = 'sms_admin_school_brand'

let accessToken: string | null = sessionStorage.getItem(ACCESS_KEY)

export interface PersistedUi {
  view?: string
  consoleKind?: 'owner' | 'school'
  schoolId?: string
  ownerViewingSchool?: boolean
}

/** school = staff login shows school logo; saas = Catre owner product welcome. */
export type LoginBrandMode = 'school' | 'saas'

export interface SchoolBrand {
  name: string
  logoUrl: string | null
  mode?: LoginBrandMode
}

/** Keep login-panel marks under localStorage quota (huge data-URL logos break setItem). */
const MAX_BRAND_MARK_CHARS = 90_000

/** Prefer logo, then school image; skip oversized data URLs so the other mark can win. */
export function pickBrandMarkUrl(
  logoUrl?: string | null,
  imageUrl?: string | null,
): string | null {
  for (const u of [logoUrl, imageUrl]) {
    if (!u?.trim()) continue
    if (/^https?:\/\//i.test(u) || u.length <= MAX_BRAND_MARK_CHARS) return u
  }
  return null
}

export const tokenStore = {
  getAccess(): string | null {
    if (accessToken) return accessToken
    accessToken = sessionStorage.getItem(ACCESS_KEY)
    return accessToken
  },
  getRefresh(): string | null { return localStorage.getItem(REFRESH_KEY) },
  getTenantId(): string | null { return localStorage.getItem(TENANT_KEY) },
  getEmail(): string | null { return localStorage.getItem(EMAIL_KEY) },
  setEmail(email: string | null): void {
    if (email) localStorage.setItem(EMAIL_KEY, email)
    else localStorage.removeItem(EMAIL_KEY)
  },
  setTenantId(id: string | null): void {
    if (id) localStorage.setItem(TENANT_KEY, id)
    else localStorage.removeItem(TENANT_KEY)
  },
  set(tokens: AuthTokens): void {
    accessToken = tokens.access_token
    sessionStorage.setItem(ACCESS_KEY, tokens.access_token)
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
  },
  getUi(): PersistedUi | null {
    try {
      const raw = sessionStorage.getItem(UI_KEY)
      return raw ? JSON.parse(raw) as PersistedUi : null
    } catch {
      return null
    }
  },
  setUi(ui: PersistedUi | null): void {
    if (!ui) sessionStorage.removeItem(UI_KEY)
    else sessionStorage.setItem(UI_KEY, JSON.stringify(ui))
  },
  /** Last school branding for login panel (name + logo across sessions). */
  getSchoolBrand(): SchoolBrand | null {
    try {
      const raw = localStorage.getItem(BRAND_KEY)
      return raw ? JSON.parse(raw) as SchoolBrand : null
    } catch {
      return null
    }
  },
  setSchoolBrand(brand: SchoolBrand | null): void {
    try {
      if (!brand) {
        localStorage.removeItem(BRAND_KEY)
        return
      }
      const logoUrl =
        brand.logoUrl &&
        ( /^https?:\/\//i.test(brand.logoUrl) || brand.logoUrl.length <= MAX_BRAND_MARK_CHARS)
          ? brand.logoUrl
          : null
      localStorage.setItem(
        BRAND_KEY,
        JSON.stringify({ name: brand.name, logoUrl, mode: brand.mode ?? 'school' }),
      )
    } catch {
      /* QuotaExceeded — keep name so welcome copy still works. */
      try {
        if (brand) {
          localStorage.setItem(
            BRAND_KEY,
            JSON.stringify({ name: brand.name, logoUrl: null, mode: brand.mode ?? 'school' }),
          )
        }
      } catch {
        /* ignore */
      }
    }
  },
  clear(): void {
    accessToken = null
    sessionStorage.removeItem(ACCESS_KEY)
    sessionStorage.removeItem(UI_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(TENANT_KEY)
    localStorage.removeItem(EMAIL_KEY)
    /* Keep school brand so login still shows school logo after sign-out. */
  },
  /** True when a reload can resume the session (refresh token present). */
  hasSession(): boolean {
    return !!localStorage.getItem(REFRESH_KEY)
  },
}
