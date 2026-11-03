import * as SQLite from 'expo-sqlite'
import { File } from 'expo-file-system'
import type { Client, ReportFields } from '../lib/types'

/**
 * local       edited on the device, not yet (fully) on the server
 * syncing     upload in progress
 * synced      server has exactly what the device has
 * submitting  Submit Final requested; stays here through retries until the server confirms
 * submitted   server confirmed submission (locked)
 * failed      retries exhausted or non-retryable error; manual retry
 * conflict    server copy changed by someone else; engineer must choose
 * elsewhere   the server report was submitted from another device; local copy kept read-only for reference
 */
export type DraftSyncState = 'local' | 'syncing' | 'synced' | 'submitting' | 'submitted' | 'failed' | 'conflict' | 'elsewhere'
export const LOCKED_STATES: DraftSyncState[] = ['submitting', 'submitted', 'conflict', 'elsewhere']

export type Draft = {
  localId: string
  ownerUserId: string | null       // signed-in user who created the draft; drafts of other users are invisible and never synced
  serverId: string | null
  clientId: string
  clientName: string
  fields: ReportFields
  version: number                  // last server version seen (0 = never synced)
  dirty: number                    // 1 = local field changes not yet on server
  editSeq: number                  // bumped by every local edit; the engine only clears dirty if it did not change meanwhile
  serverFieldsJson: string | null  // fields last acknowledged by the server (to tell our own lost writes from real conflicts)
  syncState: DraftSyncState
  engineerSigUri: string | null; engineerSigPending: number
  clientSigUri: string | null; clientSigPending: number
  submitRequested: number
  reportRef: string | null
  nextVisitDate: string | null
  lastError: string | null
  attempts: number
  nextAttemptAt: string | null
  conflictJson: string | null      // server copy when a 409 was received
  localUpdatedAt: string
  createdAt: string
}

type Row = Omit<Draft, 'fields'> & { fields: string }

let _db: Promise<SQLite.SQLiteDatabase> | null = null
export function db(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) _db = open()
  return _db
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const d = await SQLite.openDatabaseAsync('solar-maintenance.db')
  await d.execAsync(`
    pragma journal_mode = wal;
    create table if not exists drafts (
      localId text primary key, ownerUserId text, serverId text, clientId text not null, clientName text not null, fields text not null,
      version integer not null default 0, dirty integer not null default 1, editSeq integer not null default 0, serverFieldsJson text,
      syncState text not null default 'local',
      engineerSigUri text, engineerSigPending integer not null default 0, clientSigUri text, clientSigPending integer not null default 0,
      submitRequested integer not null default 0, reportRef text, nextVisitDate text, lastError text, attempts integer not null default 0,
      nextAttemptAt text, conflictJson text, localUpdatedAt text not null, createdAt text not null);
    create table if not exists clients_cache (id text primary key, json text not null, cachedAt text not null);
    create table if not exists meta (key text primary key, value text);
  `)
  // Upgrade databases created by older app versions (add columns introduced later).
  const cols = new Set((await d.getAllAsync<{ name: string }>('pragma table_info(drafts)')).map(c => c.name))
  const add: [string, string][] = [['ownerUserId', 'text'], ['editSeq', 'integer not null default 0'], ['serverFieldsJson', 'text']]
  for (const [name, type] of add) if (!cols.has(name)) await d.execAsync(`alter table drafts add column ${name} ${type}`)
  return d
}

const parse = (r: Row): Draft => ({ ...r, fields: JSON.parse(r.fields) as ReportFields })
const now = () => new Date().toISOString()
const deleteFile = (uri?: string | null) => { if (!uri) return; try { const f = new File(uri); if (f.exists) f.delete() } catch { /* already gone */ } }

export const drafts = {
  async all(owner: string): Promise<Draft[]> {
    const rows = await (await db()).getAllAsync<Row>('select * from drafts where ownerUserId = ? order by localUpdatedAt desc', owner)
    return rows.map(parse)
  },
  async get(localId: string): Promise<Draft | null> { const r = await (await db()).getFirstAsync<Row>('select * from drafts where localId = ?', localId); return r ? parse(r) : null },
  async create(d: Pick<Draft, 'localId' | 'clientId' | 'clientName' | 'fields' | 'ownerUserId'>): Promise<Draft> {
    const t = now()
    await (await db()).runAsync('insert into drafts (localId, ownerUserId, clientId, clientName, fields, localUpdatedAt, createdAt) values (?,?,?,?,?,?,?)',
      d.localId, d.ownerUserId, d.clientId, d.clientName, JSON.stringify(d.fields), t, t)
    return (await this.get(d.localId))!
  },
  /** Drafts created before owners were recorded belong to whoever signs in first after the upgrade. */
  async claimOrphans(owner: string) { await (await db()).runAsync('update drafts set ownerUserId = ? where ownerUserId is null', owner) },

  /** Autosave: stores fields, marks dirty, bumps editSeq. Locked drafts are never changed. */
  async saveFields(localId: string, fields: ReportFields) {
    await (await db()).runAsync(`update drafts set fields = ?, dirty = 1, editSeq = editSeq + 1, localUpdatedAt = ?,
      syncState = case when syncState in ('synced','failed') then 'local' else syncState end
      where localId = ? and syncState not in ('submitting','submitted','conflict','elsewhere')`, JSON.stringify(fields), now(), localId)
  },
  async setSignature(localId: string, kind: 'engineer' | 'client', uri: string) {
    const col = kind === 'engineer' ? 'engineerSig' : 'clientSig'
    const before = await this.get(localId)
    if (!before || LOCKED_STATES.includes(before.syncState)) { deleteFile(uri); return false }
    await (await db()).runAsync(`update drafts set ${col}Uri = ?, ${col}Pending = 1, editSeq = editSeq + 1, localUpdatedAt = ?,
      syncState = case when syncState in ('synced','failed') then 'local' else syncState end where localId = ?`, uri, now(), localId)
    const old = kind === 'engineer' ? before.engineerSigUri : before.clientSigUri
    if (old && old !== uri) deleteFile(old)
    return true
  },
  /** Unconditional bookkeeping update (server ids, versions, states). */
  async patch(localId: string, p: Partial<Omit<Draft, 'fields'>> & { fields?: ReportFields }) {
    const cols: string[] = []; const vals: SQLite.SQLiteBindValue[] = []
    for (const [k, v] of Object.entries(p)) { cols.push(`${k} = ?`); vals.push(k === 'fields' ? JSON.stringify(v) : (v as SQLite.SQLiteBindValue)) }
    if (!cols.length) return
    vals.push(localId)
    await (await db()).runAsync(`update drafts set ${cols.join(', ')} where localId = ?`, ...vals)
  },
  /** Clears `dirty` only if no edit happened since `editSeq` was read. Returns false when the draft changed meanwhile. */
  async ackFields(localId: string, editSeq: number, version: number, serverFieldsJson: string): Promise<boolean> {
    const r = await (await db()).runAsync('update drafts set dirty = 0, version = ?, serverFieldsJson = ? where localId = ? and editSeq = ?', version, serverFieldsJson, localId, editSeq)
    if (r.changes === 0) await (await db()).runAsync('update drafts set version = ?, serverFieldsJson = ? where localId = ?', version, serverFieldsJson, localId)
    return r.changes > 0
  },
  /** Clears a signature's pending flag only if the uploaded file is still the current one. */
  async ackSignature(localId: string, kind: 'engineer' | 'client', uploadedUri: string) {
    const col = kind === 'engineer' ? 'engineerSig' : 'clientSig'
    await (await db()).runAsync(`update drafts set ${col}Pending = 0 where localId = ? and ${col}Uri = ?`, localId, uploadedUri)
  },
  /** Marks synced only if nothing changed and nothing is pending. */
  async markSyncedIfClean(localId: string, editSeq: number) {
    await (await db()).runAsync(`update drafts set syncState = 'synced', attempts = 0, nextAttemptAt = null, lastError = null
      where localId = ? and editSeq = ? and dirty = 0 and engineerSigPending = 0 and clientSigPending = 0 and submitRequested = 0`, localId, editSeq)
  },
  async remove(localId: string) {
    const d = await this.get(localId)
    await (await db()).runAsync('delete from drafts where localId = ?', localId)
    deleteFile(d?.engineerSigUri); deleteFile(d?.clientSigUri)
  },
  async pending(owner: string): Promise<Draft[]> {
    const rows = await (await db()).getAllAsync<Row>(`select * from drafts where ownerUserId = ? and syncState not in ('submitted','conflict','elsewhere','failed')
      and (serverId is null or dirty = 1 or engineerSigPending = 1 or clientSigPending = 1 or submitRequested = 1) order by createdAt`, owner)
    return rows.map(parse)
  },
  /** Earliest scheduled retry among this user's pending drafts (ISO), if any. */
  async nextRetryAt(owner: string): Promise<string | null> {
    const r = await (await db()).getFirstAsync<{ t: string | null }>(`select min(nextAttemptAt) as t from drafts where ownerUserId = ? and nextAttemptAt is not null and syncState not in ('submitted','conflict','elsewhere','failed')`, owner)
    return r?.t ?? null
  },
  /** Manual retry: failed drafts go back to the queue, and every backoff is reset. Queued submits stay queued. */
  async retryNow(owner: string) {
    await (await db()).runAsync(`update drafts set syncState = case when submitRequested = 1 then 'submitting' else 'local' end, attempts = 0, nextAttemptAt = null, lastError = null
      where ownerUserId = ? and syncState = 'failed'`, owner)
    await (await db()).runAsync(`update drafts set attempts = 0, nextAttemptAt = null where ownerUserId = ? and nextAttemptAt is not null`, owner)
  },
  async countFailed(owner: string) { return (await (await db()).getFirstAsync<{ n: number }>(`select count(*) as n from drafts where ownerUserId = ? and syncState = 'failed'`, owner))?.n ?? 0 },
  async countUnsynced(owner: string) {
    return (await (await db()).getFirstAsync<{ n: number }>(`select count(*) as n from drafts where ownerUserId = ? and syncState not in ('synced','submitted','elsewhere')`, owner))?.n ?? 0
  },
}

export const clientsCache = {
  /** Replaces the cache with the full server list (prunes clients that were removed or deactivated). */
  async replaceAll(list: Client[]) {
    const d = await db(); const t = now()
    await d.withTransactionAsync(async () => {
      await d.runAsync('delete from clients_cache')
      for (const c of list) await d.runAsync('insert or replace into clients_cache (id, json, cachedAt) values (?,?,?)', c.id, JSON.stringify(c), t)
    })
  },
  async put(list: Client[]) {
    const d = await db(); const t = now()
    await d.withTransactionAsync(async () => { for (const c of list) await d.runAsync('insert or replace into clients_cache (id, json, cachedAt) values (?,?,?)', c.id, JSON.stringify(c), t) })
  },
  async all(): Promise<Client[]> { const rows = await (await db()).getAllAsync<{ json: string }>('select json from clients_cache'); return rows.map(r => JSON.parse(r.json) as Client).sort((a, b) => a.name.localeCompare(b.name)) },
  async get(id: string): Promise<Client | null> { const r = await (await db()).getFirstAsync<{ json: string }>('select json from clients_cache where id = ?', id); return r ? (JSON.parse(r.json) as Client) : null },
}

export const meta = {
  async get(key: string) { return (await (await db()).getFirstAsync<{ value: string }>('select value from meta where key = ?', key))?.value ?? null },
  async set(key: string, value: string) { await (await db()).runAsync('insert or replace into meta (key, value) values (?, ?)', key, value) },
}
