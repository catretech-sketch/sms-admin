/* ============================================================
   SchoolMate — App state: auth, console/role, current school,
   plan, language, view navigation.
   ============================================================ */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ConsoleKind, Role, School, Tier } from '@/types'
import { schools } from '@/data/mockDb'

export interface DemoAccount {
  email: string
  name: string
  role: Role
  console: ConsoleKind
  hue: number
}

/* Five role-locked demo accounts (per the design). Owner email domain
   routes to the Owner console; school accounts lock to their role. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'anil@schoolmate.io', name: 'Anil Mehta', role: 'admin', console: 'owner', hue: 250 },
  { email: 'admin@greenwood.edu', name: 'Ravi Menon', role: 'admin', console: 'school', hue: 200 },
  { email: 'principal@greenwood.edu', name: 'Sunita Rao', role: 'principal', console: 'school', hue: 330 },
  { email: 'vp@greenwood.edu', name: 'Arjun Banerjee', role: 'vice_principal', console: 'school', hue: 150 },
  { email: 'teacher@greenwood.edu', name: 'Meera Krishnan', role: 'teacher', console: 'school', hue: 20 },
]

export interface AppUser { name: string; email: string; role: Role; hue: number }

interface AppState {
  loggedIn: boolean
  user: AppUser | null
  consoleKind: ConsoleKind
  role: Role
  schoolId: string
  ownerViewingSchool: boolean
  lang: string
  dir: 'ltr' | 'rtl'
  view: string
  mobileNav: boolean
  /* cross-screen navigation payload */
  focus: string | null
  intent: string | null
  /* derived */
  school: School
  plan: Tier
  /* actions */
  login: (email: string) => void
  logout: () => void
  go: (view: string, opts?: { focus?: string; intent?: string }) => void
  clearIntent: () => void
  setSchoolId: (id: string) => void
  enterSchool: (id: string) => void
  exitToOwner: () => void
  upgrade: (tier: Tier) => void
  setLang: (lang: string) => void
  setMobileNav: (open: boolean) => void
}

const RTL_LANGS = ['ar', 'ur']
const AppCtx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false)
  const [user, setUser] = useState<AppUser | null>(null)
  const [consoleKind, setConsoleKind] = useState<ConsoleKind>('school')
  const [role, setRole] = useState<Role>('admin')
  const [schoolId, setSchoolId] = useState<string>('grv')
  const [ownerViewingSchool, setOwnerViewing] = useState(false)
  const [lang, setLangState] = useState('en')
  const [view, setView] = useState('school.dashboard')
  const [focus, setFocus] = useState<string | null>(null)
  const [intent, setIntent] = useState<string | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  /* plan overrides allow live "upgrade" without mutating the dataset */
  const [planOverride, setPlanOverride] = useState<Record<string, Tier>>({})

  const school = useMemo(() => schools.find((s) => s.id === schoolId) ?? schools[0], [schoolId])
  const plan: Tier = planOverride[schoolId] ?? school.plan
  const dir: 'ltr' | 'rtl' = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr'

  const login = (email: string) => {
    const acc = DEMO_ACCOUNTS.find((a) => a.email === email)
      ?? (email.endsWith('@schoolmate.io')
        ? { email, name: 'Owner', role: 'admin' as Role, console: 'owner' as ConsoleKind, hue: 250 }
        : { email, name: email.split('@')[0], role: 'admin' as Role, console: 'school' as ConsoleKind, hue: 210 })
    setUser({ name: acc.name, email: acc.email, role: acc.role, hue: acc.hue })
    setConsoleKind(acc.console)
    setRole(acc.role)
    setOwnerViewing(false)
    setView(acc.console === 'owner' ? 'owner.dashboard' : 'school.dashboard')
    setLoggedIn(true)
  }

  const logout = () => {
    setLoggedIn(false)
    setUser(null)
    setOwnerViewing(false)
    setView('school.dashboard')
    setMobileNav(false)
  }

  const go = (v: string, opts?: { focus?: string; intent?: string }) => {
    setView(v)
    setFocus(opts?.focus ?? null)
    setIntent(opts?.intent ?? null)
    setMobileNav(false)
  }
  const clearIntent = () => setIntent(null)

  const enterSchool = (id: string) => {
    setSchoolId(id)
    setConsoleKind('school')
    setOwnerViewing(true)
    setView('school.dashboard')
  }
  const exitToOwner = () => {
    setConsoleKind('owner')
    setOwnerViewing(false)
    setView('owner.schools')
  }
  const upgrade = (tier: Tier) => setPlanOverride((p) => ({ ...p, [schoolId]: tier }))
  const setLang = (l: string) => {
    setLangState(l)
    document.documentElement.setAttribute('dir', RTL_LANGS.includes(l) ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', l)
  }

  const value: AppState = {
    loggedIn, user, consoleKind, role, schoolId, ownerViewingSchool, lang, dir, view, mobileNav,
    focus, intent,
    school, plan,
    login, logout, go, clearIntent, setSchoolId, enterSchool, exitToOwner, upgrade, setLang, setMobileNav,
  }

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
