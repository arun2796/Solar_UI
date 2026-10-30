// Sign-in session issued by the Solar API (/auth/login, /auth/refresh, /dev/login).
// The short-lived access token goes on every request; the refresh token is rotated by the API on each use.
// Kept in sessionStorage so fresh opens always show the login screen (not keeping an old session open indefinitely).
import axios from 'axios'
import type { Me } from './types'

export type AuthResponse = { accessToken: string; accessTokenExpiresAt: string; refreshToken: string; refreshTokenExpiresAt: string; user: Me }
export type Session = AuthResponse & { dev?: boolean }

const KEY = 'solar_session'
const SKEW_MS = 30_000
export const API_URL: string = import.meta.env.VITE_API_URL

const notify = () => window.dispatchEvent(new Event('solar-auth'))

function read(): Session | null {
  try {
    // Purge old indefinite localStorage key if present
    localStorage.removeItem(KEY)

    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (!s.refreshToken || new Date(s.refreshTokenExpiresAt).getTime() <= Date.now() + SKEW_MS) {
      sessionStorage.removeItem(KEY)
      return null
    }
    if (s.dev && import.meta.env.VITE_DEV_LOGIN !== 'true') {
      sessionStorage.removeItem(KEY)
      return null
    }
    return s
  } catch {
    sessionStorage.removeItem(KEY)
    return null
  }
}

/** The stored session, or null when signed out (or the session has expired). */
export const getSession = read

export function setSession(s: Session) {
  sessionStorage.setItem(KEY, JSON.stringify(s))
  localStorage.removeItem(KEY)
  localStorage.removeItem('solar_dev_session')
  localStorage.removeItem('solar_dev_token')
  notify()
}

export function clearSession() {
  sessionStorage.removeItem(KEY)
  localStorage.removeItem(KEY)
  notify()
}

export const logout = clearSession

const fresh = (s: Session) => new Date(s.accessTokenExpiresAt).getTime() > Date.now() + SKEW_MS

let inFlight: Promise<string | null> | null = null

/** Exchanges the refresh token for new tokens. Returns the new access token, or null (and signs out) if the API refuses. */
export function refresh(): Promise<string | null> {
  inFlight ??= (async () => {
    const s = read()
    if (!s) return null
    const before = s.refreshToken
    try {
      const r = await axios.post<AuthResponse>(`${API_URL}/auth/refresh`, { refreshToken: before }, { timeout: 30_000 })
      setSession({ ...r.data, dev: s.dev })
      return r.data.accessToken
    } catch {
      clearSession()
      return null
    }
  })().finally(() => { inFlight = null })
  return inFlight
}

/** A valid access token, refreshed first if it is about to expire. Null when signed out. */
export async function accessToken(): Promise<string | null> {
  const s = read()
  if (!s) return null
  if (fresh(s)) return s.accessToken
  return refresh()
}
