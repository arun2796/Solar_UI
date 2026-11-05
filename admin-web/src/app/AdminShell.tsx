import { Suspense, useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, BarChart3, CalendarDays, Compass, FileText, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Sun, UserCog, Users, Wrench, X } from 'lucide-react'
import { errorMessage, signOut, statusOf } from '../lib/api'
import { isDevSession } from '../lib/devAuth'
import { initAdminIdleTracker } from '../lib/idle'
import { getSession } from '../lib/session'
import { useMe } from '../lib/useMe'
import { cx } from '../lib/format'
import type { Role } from '../lib/types'
import { Button, Skeleton } from '../components/ui'

/** 'in' while a session (unexpired refresh token) is stored, else 'out'. Reacts to sign-in/out in this or another tab. */
function useAuthState(): 'in' | 'out' {
  const [state, setState] = useState<'in' | 'out'>(() => (getSession() ? 'in' : 'out'))
  useEffect(() => {
    const check = () => setState(getSession() ? 'in' : 'out')
    window.addEventListener('solar-auth', check)
    return () => window.removeEventListener('solar-auth', check)
  }, [])
  return state
}

const Splash = () => <div className="flex min-h-screen items-center justify-center gap-3 bg-canvas text-sm font-medium text-slate-500" role="status"><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700" />Loading…</div>

export function AdminGuard() {
  const auth = useAuthState()
  const navigate = useNavigate()
  const location = useLocation()
  const me = useMe(auth === 'in')

  // Auto-logout after 15 minutes of idle time
  useEffect(() => {
    if (auth === 'in') {
      return initAdminIdleTracker(() => {
        navigate('/login?reason=idle', { replace: true })
      })
    }
  }, [auth, navigate])

  if (auth === 'out') return <Navigate to={`/login?from=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (me.isLoading) return <Splash />
  if (me.isError || me.data?.role !== 'admin') {
    const s = statusOf(me.error)
    const unreachable = me.isError && (s === undefined || s >= 500)
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <ShieldCheck className="h-10 w-10 text-red-600" aria-hidden />
      <h1 className="text-lg font-semibold">{unreachable ? 'API unreachable' : me.isError ? 'Sign-in not accepted' : 'This account is not authorized'}</h1>
      <p className="max-w-md text-sm text-slate-600">{me.isError ? errorMessage(me.error) || 'The API rejected this login. The user may not be registered in the Solar system.' : 'Engineer accounts use the mobile app.'}</p>
      <div className="flex gap-2">
        {me.isError && <Button onClick={() => void me.refetch()} loading={me.isFetching}>Retry</Button>}
        <Button variant="secondary" onClick={async () => { await signOut(); navigate('/login') }}>Sign out</Button>
      </div></div>
  }
  return <Shell />
}

/** Layout route that refuses pages the signed-in role may not open. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const role = useMe().data?.role
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />
  return <Outlet />
}

const ADMIN: Role[] = ['admin']
const nav: { to: string; label: string; icon: typeof Compass; end?: boolean; roles: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ADMIN },
  { to: '/surveys', label: 'Site Surveys', icon: Compass, roles: ADMIN },
  { to: '/reports', label: 'Reports', icon: FileText, roles: ADMIN },
  { to: '/clients', label: 'Clients', icon: Users, roles: ADMIN },
  { to: '/engineers', label: 'Engineers', icon: Wrench, roles: ADMIN },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, roles: ADMIN },
  { to: '/schedule', label: 'Upcoming & Overdue', icon: AlertTriangle, roles: ADMIN },
  { to: '/amc', label: 'AMC', icon: ShieldCheck, roles: ADMIN },
  { to: '/defects', label: 'Defect Summary', icon: BarChart3, roles: ADMIN },
  { to: '/users', label: 'Users', icon: UserCog, roles: ADMIN },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ADMIN },
]

function Shell() {
  const [open, setOpen] = useState(false)
  const me = useMe()
  const navigate = useNavigate()
  const doSignOut = async () => { await signOut(); navigate('/login') }
  const dev = isDevSession()
  const role = me.data?.role
  const links = nav.filter(n => role && n.roles.includes(role)).map(n => <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
    className={({ isActive }) => cx('group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ease-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500/25',
      isActive ? 'bg-sky-50 font-semibold text-sky-900 before:absolute before:inset-y-2 before:left-0 before:w-0.75 before:rounded-full before:bg-sky-600' : 'font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900')}>
    {({ isActive }) => <><n.icon className={cx('h-4.5 w-4.5 shrink-0 transition-colors', isActive ? 'text-sky-700' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />{n.label}</>}</NavLink>)
  const devBadge = dev && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-600/25">dev login</span>
  const email = me.data?.email ?? ''
  const roleName = 'Admin'
  const avatar = <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-sky-600 to-sky-800 text-sm font-semibold uppercase text-white shadow-button">{email.slice(0, 1) || 'A'}</span>
  const signOutBtn = (cls: string) => <button type="button" onClick={doSignOut} className={cls}><LogOut className="h-4 w-4" aria-hidden />Sign out</button>

  // One sign-out per layout: the top bar on desktop, the menu at phone width.
  return <div className="flex min-h-screen bg-canvas">
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-sky-800 focus:shadow-pop focus:outline-none focus:ring-4 focus:ring-sky-500/25">Skip to content</a>
    <aside className="hidden w-65 shrink-0 flex-col border-r border-slate-200/80 bg-white md:sticky md:top-0 md:flex md:h-screen">
      <div className="flex h-18 items-center px-5">
        <img src="/company-logo.png" alt="Shree Abhi Electricals & Engineering Pvt. Ltd." className="h-11 w-auto object-contain" />
      </div>
      <div className="px-5 pb-2 pt-3 text-[11px] font-semibold tracking-wide text-slate-400">Menu</div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">{links}</nav>
      <div className="m-3 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 ring-1 ring-inset ring-slate-900/4">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sky-700 shadow-card ring-1 ring-slate-900/6"><Sun className="h-4 w-4" /></span>
        <div className="min-w-0 leading-tight"><div className="text-xs font-semibold text-slate-700">Solar Maintenance</div><div className="text-[11px] text-slate-500">{roleName} workspace</div></div>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 hidden h-18 items-center justify-between border-b border-slate-200/70 bg-canvas/85 px-8 backdrop-blur-md md:flex">
        <div className="leading-tight"><div className="text-sm font-semibold text-slate-800">Solar Maintenance System</div><div className="text-xs text-slate-500">Shree Abhi Electricals &amp; Engineering</div></div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl bg-white py-1.5 pl-1.5 pr-3 shadow-card ring-1 ring-slate-900/6">
            {avatar}
            <div className="min-w-0 leading-tight"><div className="max-w-[16rem] truncate text-sm font-semibold text-slate-800" title={email}>{email}</div><div className="text-[11px] text-slate-500">Signed in · {roleName}</div></div>
            {devBadge}
          </div>
          {signOutBtn('inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors duration-200 ease-soft hover:bg-red-50 hover:text-red-700 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500/25')}
        </div>
      </header>

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-2.5 backdrop-blur-md md:hidden">
        <img src="/company-logo.png" alt="Shree Abhi Electricals & Engineering Pvt. Ltd." className="h-9 w-auto object-contain" />
        <button type="button" onClick={() => setOpen(o => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-nav"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500/25">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </header>
      {open && <nav id="mobile-nav" aria-label="Main" className="flex flex-col gap-0.5 border-b border-slate-200 bg-white p-3 shadow-lift md:hidden">
        {links}
        <div className="mt-3 flex items-center gap-3 border-t border-slate-100 px-1 pt-3">{avatar}<div className="min-w-0 flex-1 leading-tight"><div className="truncate text-sm font-semibold text-slate-800">{email}</div><div className="text-[11px] text-slate-500">Signed in · {roleName}</div></div>{devBadge}</div>
        {signOutBtn('mt-2 flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50')}
      </nav>}

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 focus:outline-none md:px-8 md:py-8"><div className="mx-auto w-full max-w-350"><Suspense fallback={<Skeleton rows={6} />}><Outlet /></Suspense></div></main>
    </div>
  </div>
}
