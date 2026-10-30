import { Suspense, useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, BarChart3, CalendarDays, FileText, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Users, Wrench, X } from 'lucide-react'
import { errorMessage, signOut, statusOf } from '../lib/api'
import { isDevSession } from '../lib/devAuth'
import { initAdminIdleTracker } from '../lib/idle'
import { getSession } from '../lib/session'
import { useMe } from '../lib/useMe'
import { cx } from '../lib/format'
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

const Splash = () => <div className="flex min-h-screen items-center justify-center text-slate-500" role="status">Loading…</div>

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
      <h1 className="text-lg font-semibold">{unreachable ? 'API unreachable' : me.isError ? 'Sign-in not accepted' : 'This account is not an administrator'}</h1>
      <p className="max-w-md text-sm text-slate-600">{me.isError ? errorMessage(me.error) || 'The API rejected this login. The user may not be registered in the Solar system.' : 'Engineer accounts use the mobile app.'}</p>
      <div className="flex gap-2">
        {me.isError && <Button onClick={() => void me.refetch()} loading={me.isFetching}>Retry</Button>}
        <Button variant="secondary" onClick={async () => { await signOut(); navigate('/login') }}>Sign out</Button>
      </div></div>
  }
  return <Shell />
}

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/engineers', label: 'Engineers', icon: Wrench },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/schedule', label: 'Upcoming & Overdue', icon: AlertTriangle },
  { to: '/amc', label: 'AMC', icon: ShieldCheck },
  { to: '/defects', label: 'Defect Summary', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Shell() {
  const [open, setOpen] = useState(false)
  const me = useMe()
  const navigate = useNavigate()
  const doSignOut = async () => { await signOut(); navigate('/login') }
  const dev = isDevSession()
  const links = nav.map(n => <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
    className={({ isActive }) => cx('flex items-center gap-3 rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500', isActive ? 'bg-sky-100 font-medium text-sky-900' : 'text-slate-700 hover:bg-slate-100')}><n.icon className="h-4 w-4" aria-hidden />{n.label}</NavLink>)
  const devBadge = dev && <div className="mx-3 mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">dev login</div>

  return <div className="flex min-h-screen">
    {/* Sidebar with Logo at top left */}
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="border-b border-slate-200 bg-white p-4">
        <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <img
            src="/company-logo.png"
            alt="Shree Abhi Electricals & Engineering Pvt. Ltd."
            className="h-10 w-auto object-contain"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3 pt-2">
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">{links}</nav>
        <div className="border-t border-slate-200 pt-3 text-xs text-slate-500">
          <div className="truncate px-3 font-medium text-slate-700">{me.data?.email}</div>
          {devBadge}
          <button
            type="button"
            onClick={doSignOut}
            className="mt-2 flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />Sign out
          </button>
        </div>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      {/* Desktop Top Header Bar with Visible Logout */}
      <header className="hidden md:flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex flex-col justify-center">
          <div className="text-xs font-bold tracking-wider uppercase text-sky-800">
            Solar Maintenance
          </div>
          <div className="text-sm font-bold text-slate-800">
            Shree Abhi Electricals & Engineering Pvt. Ltd.
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600">{me.data?.email}</span>
          <button
            type="button"
            onClick={doSignOut}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      </header>

      {/* Mobile Header with Logo and Logout */}
      <header className="flex items-center justify-between bg-gradient-to-r from-sky-600 to-sky-800 px-4 py-2.5 text-white md:hidden">
        <div className="flex items-center gap-2">
          <div className="rounded bg-white p-1 shadow-sm">
            <img
              src="/company-logo.png"
              alt="Shree Abhi Electricals"
              className="h-6 w-auto object-contain"
            />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">Solar PMC</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={doSignOut}
            className="flex items-center gap-1.5 rounded bg-white/20 px-2.5 py-1 text-xs font-semibold hover:bg-white/30"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="rounded p-1 hover:bg-white/20"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {open && <nav id="mobile-nav" aria-label="Main" className="flex flex-col gap-1 border-b border-slate-200 bg-white p-3 md:hidden">
        {links}
        <div className="px-3 text-xs text-slate-500">{me.data?.email}</div>
        {devBadge}
        <button type="button" onClick={doSignOut} className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          <LogOut className="h-4 w-4" aria-hidden />Sign out
        </button>
      </nav>}

      <main className="min-w-0 flex-1 p-4 md:p-6"><Suspense fallback={<Skeleton rows={6} />}><Outlet /></Suspense></main>
    </div>
  </div>
}
