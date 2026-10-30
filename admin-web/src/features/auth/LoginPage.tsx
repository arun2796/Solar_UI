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

  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-100 via-sky-50 to-slate-100 p-4">
    <div className="w-full max-w-sm">
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-md">
        <div className="flex justify-center">
          <img
            src="/company-logo.png"
            alt="Shree Abhi Electricals & Engineering Pvt. Ltd."
            className="h-14 w-auto object-contain"
          />
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3 text-center">
          <h1 className="text-lg font-bold text-slate-800">Solar Maintenance System</h1>
          <p className="text-xs font-medium text-slate-500">Shree Abhi Electricals & Engineering Pvt. Ltd. · Admin</p>
        </div>
      </div>
      {sp.get('reason') === 'idle' && <Notice tone="info" className="mb-4">You were signed out due to 15 minutes of inactivity. Please sign in again.</Notice>}
      {DEV_LOGIN_ENABLED && <div className="mb-4 rounded-xl border-2 border-sky-600 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-900"><Zap className="h-4 w-4" />Quick sign-in (local test setup)</div>
        {devUsers.isLoading ? <p className="text-sm text-sky-800">Loading users…</p>
          : devUsers.isError ? <p className="text-sm text-sky-800">Not available: the API is not running in Development with DevAuth enabled.</p>
          : !devUsers.data?.length ? <p className="text-sm text-sky-800">No active admin users in the database.</p>
          : <div className="space-y-2">{devUsers.data.map(u => <Button key={u.userId} type="button" variant="primary" loading={devBusy === u.userId} onClick={() => devLogin(u.userId)} className="w-full justify-center">
              Sign in as {u.email ?? u.userId.slice(0, 8)}</Button>)}</div>}
      </div>}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Sign in with email</h2>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full justify-center">Sign in</Button>
        <button type="button" onClick={() => setShowForgot(v => !v)} className="text-xs text-sky-700 hover:underline">Forgot password?</button>
        {showForgot && <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">Password reset for admins is managed by database access in development, or contact your team lead.</p>}
      </form>
    </div>
  </div>
}
