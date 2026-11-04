import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import { api, errorMessage, startSession, statusOf } from '../../lib/api'
import { DEV_LOGIN_ENABLED } from '../../lib/devAuth'
import { Button, Field, Input, Notice } from '../../components/ui'

// Same rule as the API's accounts (any address with an @), so e.g. admin@local can sign in during development.
const schema = z.object({ email: z.string().trim().regex(/^[^\s@]+@[^\s@]+$/, 'Enter a valid email'), password: z.string().min(1, 'Password is required') })
type Form = z.infer<typeof schema>

/** Only allow same-site relative redirects after login. */
const safeFrom = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/login') ? v : '/')

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })
  const [error, setError] = useState<string | null>(null)
  const [showForgot, setShowForgot] = useState(false)
  const [devBusy, setDevBusy] = useState<string | null>(null)
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const from = safeFrom(sp.get('from'))

  const onSubmit = async (f: Form) => {
    setError(null)
    try {
      startSession(await api.auth.login(f.email.trim(), f.password)) // replaces any previous user's session and cached data
      navigate(from, { replace: true })
    } catch (e) {
      const s = statusOf(e)
      setError(s === 401 ? 'Invalid email or password.' : s === 429 ? 'Too many sign-in attempts. Wait a minute and try again.' : errorMessage(e))
    }
  }

  const devUsers = useQuery({ queryKey: ['dev-users'], queryFn: () => api.dev.users('admin'), enabled: DEV_LOGIN_ENABLED, retry: false, staleTime: 0 })
  const devLogin = async (userId: string) => {
    setError(null); setDevBusy(userId)
    try {
      startSession(await api.dev.login(userId), true)
      navigate(from, { replace: true })
    } catch (e) { setError(`Dev login failed: ${errorMessage(e)}`) } finally { setDevBusy(null) }
  }

  return <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
    {/* Brand side (desktop only): calm navy surface with a soft sun glow */}
    <aside aria-hidden className="relative hidden overflow-hidden bg-sky-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full bg-sky-500/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-size-[48px_48px]" />
      <div className="relative inline-flex w-max items-center rounded-xl bg-white px-4 py-3 shadow-pop"><img src="/company-logo.png" alt="" className="h-10 w-auto object-contain" /></div>
      <div className="relative max-w-md">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">Admin console</p>
        <p className="mt-4 text-[34px] font-bold leading-[1.15] tracking-[-0.02em] text-white">Every site visit, report and survey in one place.</p>
        <p className="mt-4 text-sm leading-relaxed text-sky-100/80">Plan maintenance, follow up on defects and AMC renewals, and review site surveys from the field.</p>
      </div>
      <p className="relative text-xs text-sky-200/60">Shree Abhi Electricals &amp; Engineering Pvt. Ltd.</p>
    </aside>

    <div className="flex items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-[400px]">
        <div className="mb-8">
          <img src="/company-logo.png" alt="Shree Abhi Electricals & Engineering Pvt. Ltd." className="mb-6 h-12 w-auto object-contain lg:hidden" />
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-slate-900">Solar Maintenance System</h1>
          <p className="mt-1.5 text-sm text-slate-500">Shree Abhi Electricals &amp; Engineering Pvt. Ltd. · Admin</p>
        </div>
        {sp.get('reason') === 'idle' && <Notice tone="info" className="mb-4">You were signed out due to 15 minutes of inactivity. Please sign in again.</Notice>}
        {DEV_LOGIN_ENABLED && <div className="mb-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-inset ring-sky-200">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sky-900"><Zap className="h-4 w-4" />Quick sign-in (local test setup)</div>
          {devUsers.isLoading ? <p className="text-sm text-sky-800">Loading users…</p>
            : devUsers.isError ? <p className="text-sm text-sky-800">Not available: the API is not running in Development with DevAuth enabled.</p>
            : !devUsers.data?.length ? <p className="text-sm text-sky-800">No active admin users in the database.</p>
            : <div className="space-y-2">{devUsers.data.map(u => <Button key={u.userId} type="button" variant="primary" loading={devBusy === u.userId} onClick={() => devLogin(u.userId)} className="w-full justify-center">
                Sign in as {u.email ?? u.userId.slice(0, 8)}</Button>)}</div>}
        </div>}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-900/6 sm:p-7">
          <h2 className="text-base font-semibold text-slate-900">Sign in with email</h2>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
          <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
          <Button type="submit" variant="primary" loading={isSubmitting} className="min-h-11 w-full justify-center">Sign in</Button>
          <button type="button" onClick={() => setShowForgot(v => !v)} className="rounded text-xs font-medium text-sky-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500/25">Forgot password?</button>
          {showForgot && <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-900/4">Administrator passwords are reset by whoever runs the server, with the API's create-admin command. Engineers: ask an administrator to reset yours.</p>}
        </form>      </div>
    </div>
  </div>
}
