import { AppState, type AppStateStatus } from 'react-native'
import { authStore, signOut } from './auth'
import { flushActiveDraft } from '../forms/useDraft'

/** Configurable idle timeout (default: 15 minutes of inactivity) */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000

let lastActivityTime = Date.now()
let idleTimer: ReturnType<typeof setTimeout> | null = null

/** Call whenever the user touches, taps, navigates, or types. */
export function recordUserActivity() {
  lastActivityTime = Date.now()
  if (idleTimer) clearTimeout(idleTimer)
  if (authStore.get().status === 'in') {
    idleTimer = setTimeout(() => {
      void performAutoLogout('idle')
    }, IDLE_TIMEOUT_MS)
  }
}

/** Logs out the user after saving any in-memory active drafts to SQLite first. */
export async function performAutoLogout(reason = 'idle') {
  if (authStore.get().status !== 'in') return
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  // Requirement 4: Save unsaved draft locally first so work is not lost
  try {
    await flushActiveDraft()
  } catch {
    // continue sign out even if flush encounters error
  }
  await signOut()
}

/** Initializes the idle tracker listener on app root layout. */
export function initIdleTracker() {
  recordUserActivity()

  const handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      const elapsed = Date.now() - lastActivityTime
      if (elapsed >= IDLE_TIMEOUT_MS) {
        void performAutoLogout('idle')
      } else {
        recordUserActivity()
      }
    } else {
      // App moving to background: immediately save active draft as precaution
      void flushActiveDraft()
    }
  }

  const sub = AppState.addEventListener('change', handleAppStateChange)
  return () => {
    sub.remove()
    if (idleTimer) clearTimeout(idleTimer)
  }
}
