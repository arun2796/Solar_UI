import NetInfo from '@react-native-community/netinfo'
import { AppState } from 'react-native'
import { api, errorMessage, isNetworkError, problemOf, statusOf } from '../lib/api'
import { currentUserId } from '../lib/auth'
import { syncStore } from '../lib/store'
import { FIELD_LABELS, type Report, type ReportFields } from '../lib/types'
import { draftProblems } from '../forms/schema'
import { clientsCache, drafts, meta, type Draft } from '../db'

/**
 * Sync engine. Per draft, in creation order: create (POST, idempotent on localId) → update fields (PUT with version)
 * → signatures (do not change the version) → submit (idempotent).
 *
 * Safety rules:
 *  - `dirty` is cleared only when no local edit happened during the request (editSeq check), so late edits are never lost.
 *  - A 409 caused by our own earlier write whose response was lost is resolved automatically; only a real change by
 *    someone else becomes a `conflict` for the engineer to decide.
 *  - Retryable errors keep a queued submit in `submitting`; the draft is never unlocked or deleted by the engine.
 */
let running = false
let queued = false
let timer: ReturnType<typeof setTimeout> | null = null
const MAX_ATTEMPTS = 8
const CLIENTS_REFRESH_MS = 30 * 60_000
const backoff = (n: number) => Math.min(10 * 60_000, 5000 * 2 ** Math.max(0, n - 1))

export function startSyncEngine() {
  const unsubNet = NetInfo.addEventListener(s => {
    // isInternetReachable is null while unknown (e.g. at start-up): only an explicit false means offline.
    const online = s.isConnected !== false && s.isInternetReachable !== false
    syncStore.set({ net: online ? 'online' : 'offline' })
    if (online) void runSync()
  })
  const sub = AppState.addEventListener('change', st => { if (st === 'active') void runSync() })
  const owner = currentUserId()
  void (owner ? drafts.claimOrphans(owner) : Promise.resolve()).then(() => runSync())
  return () => { unsubNet(); sub.remove(); if (timer) { clearTimeout(timer); timer = null } }
}

export function scheduleSync(ms = 1500) { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; void runSync() }, Math.max(0, ms)) }

/** User-initiated sync: failed drafts are re-queued, backoff is reset, and the offline flag is ignored (NetInfo can be wrong). */
export async function syncNow(): Promise<void> {
  const owner = currentUserId(); if (!owner) return
  await drafts.retryNow(owner)
  await runSync({ manual: true })
}

export async function runSync(opts: { manual?: boolean } = {}): Promise<void> {
  if (running) { queued = true; return }
  if (syncStore.get().net === 'offline' && !opts.manual) return
  const owner = currentUserId(); if (!owner) return
  running = true
  if (opts.manual) syncStore.set({ syncing: true })
  try {
    do {
      queued = false
      const now = Date.now()
      for (const d of await drafts.pending(owner)) {
        if (d.nextAttemptAt && new Date(d.nextAttemptAt).getTime() > now) continue
        await syncOne(d)
      }
      await refreshClients(opts.manual === true)
    } while (queued && syncStore.get().net !== 'offline')
    syncStore.set({ failed: await drafts.countFailed(owner), lastSyncAt: new Date().toISOString() })
    // Wake up when the earliest backoff ends (no NetInfo/AppState event may come while the app stays open).
    const next = await drafts.nextRetryAt(owner)
    if (next) scheduleSync(new Date(next).getTime() - Date.now() + 250)
  } finally {
    running = false
    syncStore.set(s => ({ syncing: false, tick: s.tick + 1 }))
  }
}

async function refreshClients(force: boolean) {
  try {
    const last = Number(await meta.get('clientsCachedAt') ?? 0)
    if (!force && Date.now() - last < CLIENTS_REFRESH_MS) return
    await clientsCache.replaceAll(await api.allClients())
    await meta.set('clientsCachedAt', String(Date.now()))
  } catch { /* offline: the cached list stays */ }
}

/** Order-independent, null/''-insensitive comparison key for report fields. */
export function fieldsKey(f: Partial<ReportFields>): string {
  const keys = ['visitDate', ...Object.keys(FIELD_LABELS).filter(k => k !== 'visitDate')].sort()
  return JSON.stringify(keys.map(k => {
    const v = (f as Record<string, unknown>)[k]
    return v === undefined || v === null || v === '' ? null : typeof v === 'number' ? Number(v) : v
  }))
}

/** PUT the current fields. Resolves 409s caused by our own lost responses; rethrows real conflicts. Returns the new version. */
async function putFields(d: Draft, serverId: string, version: number): Promise<number> {
  const sentKey = fieldsKey(d.fields)
  try {
    const r = await api.reports.update(serverId, version, d.fields)
    await drafts.ackFields(d.localId, d.editSeq, r.version, fieldsKey(r.fields))
    return r.version
  } catch (e) {
    const current = statusOf(e) === 409 ? problemOf(e).current : undefined
    if (!current || current.status !== 'draft') throw e
    const serverKey = fieldsKey(current.fields)
    if (serverKey === sentKey) {                       // our previous PUT did land; only the response was lost
      await drafts.ackFields(d.localId, d.editSeq, current.version, serverKey)
      return current.version
    }
    if (d.serverFieldsJson && serverKey === d.serverFieldsJson) {   // server still has what we last saw: version moved without content change
      const r = await api.reports.update(serverId, current.version, d.fields)
      await drafts.ackFields(d.localId, d.editSeq, r.version, fieldsKey(r.fields))
      return r.version
    }
    throw e
  }
}

async function syncOne(start: Draft): Promise<void> {
  let d = (await drafts.get(start.localId))
  if (!d) return
  const problems = draftProblems(d.fields)
  if (problems.length) {                               // never send a draft the server would reject; tell the engineer what to fix
    await drafts.patch(d.localId, { syncState: 'local', submitRequested: 0, lastError: `Not synced — fix: ${problems.join('; ')}` })
    return
  }
  try {
    await drafts.patch(d.localId, { syncState: d.submitRequested ? 'submitting' : 'syncing', lastError: null })
    let serverId = d.serverId; let version = d.version

    if (!serverId) {
      const seq = d.editSeq
      const { report, created } = await api.reports.create(d.localId, d.clientId, d.fields)
      serverId = report.id; version = report.version
      await drafts.patch(d.localId, { serverId, version })
      if (report.status !== 'draft') { await finalElsewhere(d, report); return }
      if (created) await drafts.ackFields(d.localId, seq, version, fieldsKey(report.fields))
      else await drafts.patch(d.localId, { serverFieldsJson: fieldsKey(report.fields), dirty: 1 })   // idempotent retry: server may hold older fields
    }

    d = (await drafts.get(d.localId))!
    if (d.dirty) version = await putFields(d, serverId, version)

    for (const kind of ['engineer', 'client'] as const) {
      d = (await drafts.get(d.localId))!
      const pending = kind === 'engineer' ? d.engineerSigPending : d.clientSigPending
      const uri = kind === 'engineer' ? d.engineerSigUri : d.clientSigUri
      if (pending && uri) { await api.reports.signature(serverId, kind, uri); await drafts.ackSignature(d.localId, kind, uri) }
    }

    d = (await drafts.get(d.localId))!
    if (d.submitRequested) {
      if (d.dirty) version = await putFields(d, serverId, d.version)             // edits that landed during this pass
      d = (await drafts.get(d.localId))!
      if (d.engineerSigPending || d.clientSigPending) { queued = true; return }   // a signature changed meanwhile: next pass
      const res = await api.reports.submit(serverId, version, d.fields.nextVisitDate ?? null)
      await drafts.patch(d.localId, { syncState: 'submitted', reportRef: res.reportRef, nextVisitDate: res.nextVisitDate, version: res.version, submitRequested: 0, dirty: 0, attempts: 0, nextAttemptAt: null, lastError: null })
      return
    }
    await drafts.markSyncedIfClean(d.localId, d.editSeq)
    const after = await drafts.get(d.localId)
    if (after?.syncState === 'syncing') { await drafts.patch(d.localId, { syncState: 'local' }); queued = true }   // edited during the pass
  } catch (e) {
    await handleError(d, e)
  }
}

async function handleError(d: Draft, e: unknown) {
  const status = statusOf(e)
  const fresh = (await drafts.get(d.localId)) ?? d
  if (status === 409) {
    const current = problemOf(e).current
    if (current && current.status !== 'draft') { await finalElsewhere(fresh, current); return }
    await drafts.patch(d.localId, { syncState: 'conflict', submitRequested: 0, conflictJson: current ? JSON.stringify(current) : null, lastError: 'Changed on another device or by an admin — choose which version to keep' })
  } else if (status === 423) {
    try { await finalElsewhere(fresh, await api.reports.get(fresh.serverId!)) }
    catch { await drafts.patch(d.localId, { syncState: fresh.submitRequested ? 'submitted' : 'elsewhere', submitRequested: 0, lastError: fresh.submitRequested ? null : 'Already submitted on the server' }) }
  } else if (status === 400) {
    // Server validation: the draft stays editable; the message lists the fields by name. Editing clears 'failed'.
    await drafts.patch(d.localId, { syncState: fresh.submitRequested ? 'local' : 'failed', submitRequested: 0, attempts: 0, nextAttemptAt: null, lastError: errorMessage(e) })
  } else if (status === 401) {
    await drafts.patch(d.localId, { syncState: fresh.submitRequested ? 'submitting' : 'local', lastError: 'Signed out — sign in again to sync' })
  } else if (isNetworkError(e) || (status !== undefined && status >= 500) || status === 429 || status === 408) {
    const attempts = fresh.attempts + 1
    const giveUp = !fresh.submitRequested && attempts >= MAX_ATTEMPTS   // a queued submit keeps retrying (max 10 min apart)
    await drafts.patch(d.localId, { attempts, nextAttemptAt: new Date(Date.now() + backoff(attempts)).toISOString(), syncState: fresh.submitRequested ? 'submitting' : giveUp ? 'failed' : 'local', lastError: errorMessage(e) })
    if (isNetworkError(e)) syncStore.set({ net: 'reconnecting' })
  } else {
    await drafts.patch(d.localId, { syncState: 'failed', lastError: errorMessage(e) })   // 403/404 etc.: needs attention
  }
}

/** The server report is final. If we had asked to submit, it was our own submit (response lost); otherwise someone else's. */
async function finalElsewhere(d: Draft, r: Report) {
  if (d.submitRequested) {
    await drafts.patch(d.localId, { serverId: r.id, version: r.version, syncState: 'submitted', reportRef: r.reportRef ?? null, nextVisitDate: r.fields.nextVisitDate ?? null, submitRequested: 0, dirty: 0, lastError: null, attempts: 0, nextAttemptAt: null })
    return
  }
  await drafts.patch(d.localId, { serverId: r.id, version: r.version, syncState: 'elsewhere', reportRef: r.reportRef ?? null, nextVisitDate: r.fields.nextVisitDate ?? null, conflictJson: JSON.stringify(r), submitRequested: 0,
    lastError: `Already submitted as ${r.reportRef ?? 'a final report'} from another device or by an admin. Your local copy was not sent.` })
}

/** Conflict resolution chosen by the engineer after seeing the differences. */
export async function resolveConflict(localId: string, choice: 'mine' | 'server') {
  const d = await drafts.get(localId); if (!d) return
  const server = d.conflictJson ? (JSON.parse(d.conflictJson) as Report) : null
  if (!server) { await drafts.patch(localId, { syncState: 'local', conflictJson: null, dirty: 1 }); scheduleSync(0); return }
  if (server.status !== 'draft') { await finalElsewhere({ ...d, submitRequested: 0 }, server); return }
  const serverKey = fieldsKey(server.fields)
  if (choice === 'server') await drafts.patch(localId, { fields: { ...server.fields }, version: server.version, dirty: 0, editSeq: d.editSeq + 1, serverFieldsJson: serverKey, syncState: 'synced', conflictJson: null, lastError: null })
  else await drafts.patch(localId, { version: server.version, dirty: 1, editSeq: d.editSeq + 1, serverFieldsJson: serverKey, syncState: 'local', conflictJson: null, lastError: null })   // re-send mine on top
  scheduleSync(0)
}

/** Field-by-field differences between the local draft and the server copy (for the conflict screen). */
export function conflictDiff(d: Draft): { label: string; mine: string; server: string }[] {
  if (!d.conflictJson) return []
  const server = (JSON.parse(d.conflictJson) as Report).fields as Record<string, unknown>
  const mine = d.fields as Record<string, unknown>
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))
  return Object.keys(FIELD_LABELS).filter(k => show(mine[k]) !== show(server[k])).map(k => ({ label: FIELD_LABELS[k], mine: show(mine[k]), server: show(server[k]) }))
}
