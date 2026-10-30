import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { drafts, LOCKED_STATES, type Draft } from '../db'
import { syncStore } from '../lib/store'
import type { ReportFields } from '../lib/types'
import { scheduleSync } from '../sync/engine'

type DraftFlusher = () => Promise<void>
let activeFlusher: DraftFlusher | null = null

export function registerActiveDraftFlusher(fn: DraftFlusher | null) {
  activeFlusher = fn
}

/** Flushes any open, unsaved in-memory draft directly to local SQLite storage. */
export async function flushActiveDraft() {
  if (activeFlusher) {
    try {
      await activeFlusher()
    } catch {
      // ignore flush error on exit
    }
  }
}

/**
 * Loads a local draft and autosaves field changes to SQLite (debounced 1.2 s), then nudges the sync engine.
 * Pending edits are flushed when the screen loses focus, unmounts, or the app goes to the background
 * (Android may kill a backgrounded app; JS timers do not run there).
 */
export function useDraft(localId: string) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<ReportFields | null>(null)

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (pending.current) { const f = pending.current; pending.current = null; await drafts.saveFields(localId, f); scheduleSync(2000) }
  }, [localId])

  /** Reload from SQLite, keeping unsaved local edits on top so a reload never reverts what the engineer just typed. */
  const reload = useCallback(async () => {
    const d = await drafts.get(localId)
    setDraft(d && pending.current ? { ...d, fields: pending.current } : d)
    setLoading(false)
  }, [localId])

  useFocusEffect(useCallback(() => { void reload(); return () => { void flush() } }, [reload, flush]))
  useEffect(() => () => { void flush() }, [flush])
  useEffect(() => { const s = AppState.addEventListener('change', st => { if (st !== 'active') void flush() }); return () => s.remove() }, [flush])

  // Register with global flusher so auto-logout saves any pending draft before signing out
  useEffect(() => {
    registerActiveDraftFlusher(flush)
    return () => registerActiveDraftFlusher(null)
  }, [flush])

  // Sync state changes (synced, conflict, submitted…) must show up while the screen is open.
  const tick = syncStore.use(s => s.tick)
  useEffect(() => { if (tick) void reload() }, [tick, reload])

  const locked = !!draft && LOCKED_STATES.includes(draft.syncState)

  const setFields = useCallback((patch: Partial<ReportFields>) => {
    setDraft(d => {
      if (!d || LOCKED_STATES.includes(d.syncState)) return d
      const fields = { ...d.fields, ...patch }
      pending.current = fields
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), 1200)
      return { ...d, fields, dirty: 1, syncState: d.syncState === 'synced' || d.syncState === 'failed' ? 'local' : d.syncState }
    })
  }, [flush])

  return { draft, loading, locked, fields: draft?.fields, setFields, flush, reload }
}
