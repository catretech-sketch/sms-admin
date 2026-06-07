/* ============================================================
   SchoolMate — Topbar (school switcher, search, language,
   theme toggle, notifications, user menu)
   ============================================================ */
import { useState } from 'react'
import { useApp, useTheme } from '@/lib/hooks'
import { Icon, IconBtn, Avatar, Badge, Popover, MenuItem, MenuSep, MenuLabel, TierPill } from '@/components/ui'
import { schools, notifications } from '@/data/mockDb'
import { ROLE_META } from '@/data/mockDb'

const LANGS = [{ v: 'en', l: 'English' }, { v: 'hi', l: 'हिन्दी Hindi' }, { v: 'ar', l: 'العربية (RTL)' }, { v: 'ta', l: 'தமிழ் Tamil' }]

export function Topbar() {
  const app = useApp()
  const theme = useTheme()
  const [q, setQ] = useState('')
  const isOwner = app.consoleKind === 'owner'
  const unread = notifications.filter((n) => n.unread).length

  return (
    <header className="sm-topbar">
      <button className="sm-iconbtn only-mobile" onClick={() => app.setMobileNav(true)} aria-label="Menu"><Icon name="menu" size={20} /></button>

      {!isOwner && app.ownerViewingSchool && (
        <button className="sm-btn sm-btn-sm sm-btn-ghost" onClick={app.exitToOwner}><Icon name="arrowLeft" size={14} />Owner</button>
      )}

      {!isOwner && (
        <Popover align="left" trigger={(_open, toggle) => (
          <button className="sm-school-switch" onClick={toggle}>
            <span className="sm-school-logo" style={{ background: app.school.color }}>{app.school.logo}</span>
            <span className="fw6 t-sm" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.school.name}</span>
            <Icon name="chevDown" size={15} />
          </button>
        )}>
          <MenuLabel>Switch school</MenuLabel>
          {schools.map((s) => (
            <MenuItem key={s.id} onClick={() => app.setSchoolId(s.id)}>
              <span className="sm-school-logo" style={{ background: s.color, width: 24, height: 24, fontSize: 10 }}>{s.logo}</span>
              <span className="flex1">{s.name}</span>
              <TierPill plan={s.plan} />
            </MenuItem>
          ))}
        </Popover>
      )}

      <div className="sm-search" style={{ flex: 1, maxWidth: 420 }}>
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isOwner ? 'Search schools, invoices…' : 'Search students, staff, classes…'} />
      </div>

      <div className="sm-topbar-spacer" />

      <Popover trigger={(open, toggle) => <IconBtn icon="globe" active={open} onClick={toggle} aria-label="Language" />}>
        <MenuLabel>Language</MenuLabel>
        {LANGS.map((l) => <MenuItem key={l.v} icon={app.lang === l.v ? 'check' : undefined} onClick={() => app.setLang(l.v)}>{l.l}</MenuItem>)}
      </Popover>

      <IconBtn icon={theme.theme === 'dark' ? 'sun' : 'moon'} onClick={theme.toggleTheme} aria-label="Toggle theme" />

      <Popover trigger={(open, toggle) => (
        <span style={{ position: 'relative' }}>
          <IconBtn icon="bell" active={open} onClick={toggle} aria-label="Notifications" />
          {unread > 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 99, background: 'var(--danger)' }} />}
        </span>
      )}>
        <MenuLabel>Notifications</MenuLabel>
        <div style={{ width: 320, maxHeight: 360, overflow: 'auto' }}>
          {notifications.map((n) => (
            <div key={n.id} className="row gap10" style={{ padding: '10px 11px', alignItems: 'flex-start' }}>
              <span className="sm-card-ic" style={{ flex: '0 0 auto' }}><Icon name={n.icon} size={15} /></span>
              <div className="flex1">
                <div className="t-sm fw6">{n.title}</div>
                <div className="t-xs muted">{n.body}</div>
              </div>
              <span className="t-xs muted3">{n.time}</span>
            </div>
          ))}
        </div>
      </Popover>

      <Popover trigger={(_open, toggle) => (
        <button className="row ai-center gap8" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={toggle}>
          <Avatar name={app.user?.name} hue={app.user?.hue} size={32} />
          <div style={{ textAlign: 'left' }} className="only-desktop">
            <div className="t-sm fw6" style={{ lineHeight: 1.1 }}>{app.user?.name}</div>
            <div className="t-xs muted3">{isOwner ? 'Owner' : ROLE_META[app.role].label}</div>
          </div>
          <Icon name="chevDown" size={14} />
        </button>
      )}>
        <div style={{ padding: '8px 11px' }}>
          <div className="t-sm fw6">{app.user?.name}</div>
          <div className="t-xs muted">{app.user?.email}</div>
          <div style={{ marginTop: 6 }}><Badge tone="brand">{isOwner ? 'Owner' : ROLE_META[app.role].label}</Badge></div>
        </div>
        <MenuSep />
        <MenuItem icon="user" onClick={() => app.go(isOwner ? 'owner.settings' : 'school.settings')}>Profile & settings</MenuItem>
        <MenuItem icon="logout" danger onClick={app.logout}>Sign out</MenuItem>
      </Popover>
    </header>
  )
}
