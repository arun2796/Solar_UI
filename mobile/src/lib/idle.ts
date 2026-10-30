import { AppState, type AppStateStatus } from 'react-native'
import { authStore, IDLE_TIMEOUT_MS, markActive, signOut } from './auth'
import { flushActiveDraft } from '../forms/useDraft'

export { IDLE_TIMEOUT_MS }

let lastActivityTime = Date.now()
let lastPersisted = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null

/** Call whenever the user touches, taps, navigates, or types. */
export function recordUserActivity() {
  lastActivityTime = Date.now()
  if (lastActivityTime - lastPersisted > 30_000) { lastPersisted = lastActivityTime; markActive(lastActivityTime) }   // survives an app restart
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
      markActive(lastActivityTime)
      void flushActiveDraft()
    }
  }

  const sub = AppState.addEventListener('change', handleAppStateChange)
  return () => {
    sub.remove()
    if (idleTimer) clearTimeout(idleTimer)
  }
}
