/* ============================================================
   SchoolMate — App root: providers + shell
   ============================================================ */
import { ToastProvider } from '@/context/ToastProvider'
import { ThemeProvider } from '@/context/ThemeProvider'
import { AppProvider } from '@/context/AppProvider'
import { useApp } from '@/lib/hooks'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { Tweaks } from '@/components/shell/Tweaks'
import { LoginScreen } from '@/screens/LoginScreen'
import { Router } from '@/router'

function Shell() {
  const app = useApp()
  if (!app.loggedIn) return <LoginScreen />
  return (
    <div className={['sm-app', app.mobileNav && 'nav-open'].filter(Boolean).join(' ')}>
      {app.mobileNav && <div className="sm-scrim only-mobile" onClick={() => app.setMobileNav(false)} />}
      <Sidebar />
      <div className="sm-main">
        <Topbar />
        <main className="sm-content">
          <div className="sm-content-narrow">
            <Router />
          </div>
        </main>
      </div>
      <Tweaks />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AppProvider>
          <Shell />
        </AppProvider>
      </ThemeProvider>
    </ToastProvider>
  )
}
