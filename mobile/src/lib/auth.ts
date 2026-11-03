import axios, { isAxiosError } from 'axios'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from 'expo-sqlite/kv-store'
import { config } from './config'
import { createStore } from './store'
import type { Me } from './types'

// Sign-in session issued by the Solar API (/auth/login, /auth/refresh, /dev/login).
// Tokens live in the encrypted SecureStore (Android Keystore); the non-secret part (expiry times, user) in the kv store.
// A short-lived access token goes on every request; the refresh token is rotated by the API on each use.

/** Developer sign-in for local test builds only. The API serves /dev/* only in Development against a local database. */
export const DEV_LOGIN_ENABLED = process.env.EXPO_PUBLIC_DEV_LOGIN === 'true'

export type DevUser = { userId: string; role: 'admin' | 'engineer'; email?: string | null; engineerId?: string | null; engineerName?: string | null }
export type AuthResponse = { accessToken: string; accessTokenExpiresAt: string; refreshToken: string; refreshTokenExpiresAt: string; user: Me }
type Meta = { accessTokenExpiresAt: string; refreshTokenExpiresAt: string; user: Me; dev: boolean }
type Session = Meta & { accessToken: string; refreshToken: string }

export type AuthState = { status: 'loading' | 'in' | 'out'; dev: boolean; userId: string | null }
export const authStore = createStore<AuthState>({ status: 'loading', dev: false, userId: null })

/** Id of the signed-in user; drafts are owned by it. */
export const currentUserId = () => authStore.get().userId

const META = 'solar_session_meta', ACCESS = 'solar_access_token', REFRESH = 'solar_refresh_token'
const SKEW_MS = 30_000
const secure = Platform.OS === 'web'
  ? { get: (k: string) => AsyncStorage.getItem(k), set: (k: string, v: string) => AsyncStorage.setItem(k, v), del: (k: string) => AsyncStorage.removeItem(k) }
  : { get: (k: string) => SecureStore.getItemAsync(k), set: (k: string, v: string) => SecureStore.setItemAsync(k, v), del: (k: string) => SecureStore.deleteItemAsync(k) }

let session: Session | null = null

async function load(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(META)
    if (!raw) return null
    const meta = JSON.parse(raw) as Meta
    if (meta.dev && !DEV_LOGIN_ENABLED) return null                                  // a production build never honours a dev session
    if (new Date(meta.refreshTokenExpiresAt).getTime() <= Date.now() + SKEW_MS) return null
    const [accessToken, refreshToken] = await Promise.all([secure.get(ACCESS), secure.get(REFRESH)])
    return accessToken && refreshToken ? { ...meta, accessToken, refreshToken } : null
  } catch { return null }
}

async function save(r: AuthResponse, dev: boolean) {
  const meta: Meta = { accessTokenExpiresAt: r.accessTokenExpiresAt, refreshTokenExpiresAt: r.refreshTokenExpiresAt, user: r.user, dev }
  session = { ...meta, accessToken: r.accessToken, refreshToken: r.refreshToken }
  await Promise.all([secure.set(ACCESS, r.accessToken), secure.set(REFRESH, r.refreshToken), AsyncStorage.setItem(META, JSON.stringify(meta))])
  await AsyncStorage.removeItem('solar_dev_session').catch(() => {})                 // pre-migration key
}

async function clear() {
  session = null
  await Promise.all([secure.del(ACCESS), secure.del(REFRESH), AsyncStorage.removeItem(META)].map(p => p.catch(() => {})))
}

/** Stores a session returned by /auth/login or /dev/login and switches the app to signed in. */
export async function startSession(r: AuthResponse, dev = false) {
  await save(r, dev)
  markActive()
  authStore.set({ status: 'in', dev, userId: r.user.userId })
}

let inFlight: Promise<string | null> | null = null

/**
 * Exchanges the refresh token for new tokens. Returns the new access token, or null after signing out when the API
 * refuses it (expired, revoked, account deactivated). Network errors are re-thrown and keep the session: offline work continues.
 */
export function refresh(): Promise<string | null> {
  inFlight ??= (async () => {
    const s = session
    if (!s) return null
    try {
      const r = await axios.post<AuthResponse>(`${config.apiUrl}/auth/refresh`, { refreshToken: s.refreshToken }, { timeout: 20_000 })
      await save(r.data, s.dev)
      return r.data.accessToken
    } catch (e) {
      if (isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 400)) { await signOutLocal(); return null }
      throw e
    }
  })().finally(() => { inFlight = null })
  return inFlight
}

/** A valid access token, refreshing first when it is about to expire. Null when signed out. */
export async function accessToken(): Promise<string | null> {
  const s = session
  if (!s) return null
  if (new Date(s.accessTokenExpiresAt).getTime() > Date.now() + SKEW_MS) return s.accessToken
  return refresh()
}

async function signOutLocal() {
  await clear()
  authStore.set({ status: 'out', dev: false, userId: null })
}

/** Signs out this phone (revokes the refresh token at the API when reachable). Local drafts are kept on the device. */
export async function signOut() {
  const s = session
  await signOutLocal()
  if (s) await axios.post(`${config.apiUrl}/auth/logout`, { refreshToken: s.refreshToken }, { timeout: 8000 }).catch(() => { /* offline: the token expires on its own */ })
}

/** Idle sign-out: 15 minutes without a touch, also across app restarts (Android may close a backgrounded app). */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000
const LAST_ACTIVE = 'solar_last_active'

/** Remembers when the engineer last used the app, so a restart within the idle limit keeps them signed in. */
export function markActive(at = Date.now()) {
  void AsyncStorage.setItem(LAST_ACTIVE, String(at)).catch(() => {})
}

/**
 * Restores the stored session (works offline) unless the app was idle for longer than IDLE_TIMEOUT_MS;
 * then signs out properly, revoking the refresh token when the API is reachable. Call once from the root layout.
 */
export function initAuth(): () => void {
  let alive = true
  void (async () => {
    const s = await load()
    const last = Number(await AsyncStorage.getItem(LAST_ACTIVE).catch(() => null))
    if (!alive) return
    if (!s) { await clear(); authStore.set({ status: 'out', dev: false, userId: null }); return }
    session = s
    if (!last || Date.now() - last >= IDLE_TIMEOUT_MS) { await signOut(); return }
    markActive()
    authStore.set({ status: 'in', dev: s.dev, userId: s.user.userId })
  })()
  return () => { alive = false }
}
