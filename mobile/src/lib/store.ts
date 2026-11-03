import { useSyncExternalStore } from 'react'

/** Minimal external store (no extra dependency). */
export function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
  return {
    get: () => state,
    set: (patch: Partial<T> | ((s: T) => Partial<T>)) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; listeners.forEach(l => l()) },
    subscribe,
    use: <R,>(sel: (s: T) => R) => useSyncExternalStore(subscribe, () => sel(state), () => sel(state)),
  }
}

export type NetState = 'online' | 'offline' | 'reconnecting'
export type SyncState = { net: NetState; syncing: boolean; failed: number; lastError?: string | null; lastSyncAt?: string | null; tick: number }
export const syncStore = createStore<SyncState>({ net: 'online', syncing: false, failed: 0, lastError: null, lastSyncAt: null, tick: 0 })
