import { signOut } from './api'
import { getSession } from './session'

/** Configurable idle timeout (default: 15 minutes of inactivity) */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000

let idleTimer: ReturnType<typeof setTimeout> | null = null

export function resetIdleTimer(onIdle?: () => void) {
  if (idleTimer) clearTimeout(idleTimer)
  if (!getSession()) return

  idleTimer = setTimeout(async () => {
    try {
      await signOut()
    } catch {
      // ignore
    }
    if (onIdle) onIdle()
    else window.location.href = '/login?reason=idle'
  }, IDLE_TIMEOUT_MS)
}

/** Tracks user interactions (mouse, keyboard, touch, scroll) and logs out after 15 minutes of idle time. */
export function initAdminIdleTracker(onIdle?: () => void) {
  const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
  const handler = () => resetIdleTimer(onIdle)

  events.forEach(e => window.addEventListener(e, handler, { passive: true }))
  resetIdleTimer(onIdle)

  return () => {
    if (idleTimer) clearTimeout(idleTimer)
    events.forEach(e => window.removeEventListener(e, handler))
  }
}
