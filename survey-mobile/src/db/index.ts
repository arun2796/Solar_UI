import * as SQLite from 'expo-sqlite'
import * as FileSystem from 'expo-file-system/legacy'
import type { Client, ReportFields } from '../lib/types'
import { defaultSurveySections } from '../lib/surveyTypes'
import type { AssignedSurveyTask, SurveyCalculations, SurveyDraft, SurveyOverrides, SurveyPhotoLocal, SurveySections } from '../lib/surveyTypes'
export type { SurveyDraft }

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

/* ------------------------------------------------------------------------------------------------------------------
 * Storage: one SQLite database, one row per draft / survey draft / cached item / meta key. Every change is a
 * single-row UPDATE/INSERT (or one transaction for a list replace), so closing the app mid-survey loses nothing that
 * was already saved. Nested objects are JSON text columns; anything filtered or sorted on is a plain column.
 * ---------------------------------------------------------------------------------------------------------------- */

const DB_NAME = 'solar-survey.db'
const LEGACY_FILE = `${FileSystem.documentDirectory || ''}solar-survey-data.json`
const LEGACY_BACKUP = `${LEGACY_FILE}.bak`
const LEGACY_MIGRATION = 'legacy-json-store'

/** [column, SQL type, stored as JSON text] */
type Col = [string, string, boolean?]

const DRAFT_COLS: Col[] = [
  ['localId', 'text primary key not null'],
  ['ownerUserId', 'text'],
  ['serverId', 'text'],
  ['clientId', 'text'],
  ['clientName', 'text'],
  ['fields', 'text', true],
  ['version', 'integer default 0'],
  ['dirty', 'integer default 1'],
  ['editSeq', 'integer default 0'],
  ['serverFieldsJson', 'text'],
  ['syncState', "text default 'local'"],
  ['engineerSigUri', 'text'],
  ['engineerSigPending', 'integer default 0'],
  ['clientSigUri', 'text'],
  ['clientSigPending', 'integer default 0'],
  ['submitRequested', 'integer default 0'],
  ['reportRef', 'text'],
  ['nextVisitDate', 'text'],
  ['lastError', 'text'],
  ['attempts', 'integer default 0'],
  ['nextAttemptAt', 'text'],
  ['conflictJson', 'text'],
  ['localUpdatedAt', 'text'],
  ['createdAt', 'text'],
]

const SURVEY_COLS: Col[] = [
  ['localId', 'text primary key not null'],
  ['ownerUserId', 'text'],
  ['serverId', 'text'],
  ['surveyNumber', 'text'],
  ['customerName', 'text'],
  ['siteAddress', 'text'],
  ['sections', 'text', true],
  ['overrides', 'text', true],
  ['calculations', 'text', true],
  ['version', 'integer default 0'],
  ['dirty', 'integer default 1'],
  ['editSeq', 'integer default 0'],
  ['syncState', "text default 'local'"],
  ['engineerSigUri', 'text'],
  ['engineerSigPending', 'integer default 0'],
  ['customerSigUri', 'text'],
  ['customerSigPending', 'integer default 0'],
  ['photos', "text default '[]'", true],
  ['submitRequested', 'integer default 0'],
  ['lastError', 'text'],
  ['attempts', 'integer default 0'],
  ['nextAttemptAt', 'text'],
  ['localUpdatedAt', 'text'],
  ['createdAt', 'text'],
  ['pendingPhotoDeletes', 'text', true],
  ['forceOverwrite', 'integer'],
]
/** Optional SurveyDraft properties: a null column means the property is absent. */
const SURVEY_OPTIONAL = new Set(['pendingPhotoDeletes', 'forceOverwrite'])

type Row = Record<string, any>

let _db: Promise<SQLite.SQLiteDatabase> | null = null
function database(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = open().catch(err => {
      _db = null   // let the next call try again
      throw err
    })
  }
  return _db
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const d = await SQLite.openDatabaseAsync(DB_NAME)
  const table = (name: string, cols: Col[]) => `create table if not exists ${name} (${cols.map(([c, t]) => `${c} ${t}`).join(', ')});`
  await d.execAsync(`
    pragma journal_mode = wal;
    ${table('drafts', DRAFT_COLS)}
    ${table('survey_drafts', SURVEY_COLS)}
    create table if not exists clients_cache (id text primary key not null, json text not null, cachedAt text);
    create table if not exists surveys_cache (id text primary key not null, json text not null, cachedAt text);
    create table if not exists assigned_tasks (id text primary key not null, json text not null, cachedAt text);
    create table if not exists meta (key text primary key not null, value text);
    create table if not exists migrations (name text primary key not null, doneAt text not null);
    create index if not exists drafts_owner on drafts (ownerUserId);
    create index if not exists survey_drafts_owner on survey_drafts (ownerUserId);
    create index if not exists survey_drafts_server on survey_drafts (serverId);
  `)
  // Upgrade databases created by older app versions: add columns introduced later (never drop or rebuild a table).
  await addMissingColumns(d, 'drafts', DRAFT_COLS)
  await addMissingColumns(d, 'survey_drafts', SURVEY_COLS)
  await importLegacyJson(d)
  // A survey that exists on the server has at least version 1.
  await d.runAsync('update survey_drafts set version = 1 where serverId is not null and (version is null or version < 1)')
  return d
}

async function addMissingColumns(d: SQLite.SQLiteDatabase, tableName: string, cols: Col[]) {
  const have = new Set((await d.getAllAsync<{ name: string }>(`pragma table_info(${tableName})`)).map(c => c.name))
  for (const [name, type] of cols) {
    if (!have.has(name)) await d.execAsync(`alter table ${tableName} add column ${name} ${type.replace(/primary key|not null/g, '')}`)
  }
}

/* ---------------------------------------------- one-time JSON import ---------------------------------------------- */

interface LegacyStore {
  drafts?: Record<string, Draft>
  clients?: Record<string, Client>
  meta?: Record<string, string>
  surveyDrafts?: Record<string, SurveyDraft>
  surveys?: Record<string, any>
  assignedTasks?: Record<string, AssignedSurveyTask>
}

type LegacyRead = { status: 'missing' } | { status: 'unreadable' } | { status: 'ok'; data: LegacyStore }

async function readLegacyFile(file: string): Promise<LegacyRead> {
  try {
    if (!(await FileSystem.getInfoAsync(file)).exists) return { status: 'missing' }
    const raw = await FileSystem.readAsStringAsync(file)
    if (!raw || !raw.trim()) return { status: 'missing' }
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') throw new Error('not a store object')
    return { status: 'ok', data: data as LegacyStore }
  } catch (err) {
    console.warn(`[Storage] ${file} is unreadable; keeping it and starting without it`, err)
    return { status: 'unreadable' }
  }
}

/**
 * Older app versions kept everything in solar-survey-data.json (+ .bak). On first open it is copied into SQLite in one
 * transaction (insert-or-ignore, so a retry never duplicates or overwrites), then renamed to *.migrated (kept, not
 * deleted). An unreadable file is left in place and the app starts without it. Never throws.
 */
async function importLegacyJson(d: SQLite.SQLiteDatabase) {
  try {
    if (!FileSystem.documentDirectory) return
    if (await d.getFirstAsync('select name from migrations where name = ?', LEGACY_MIGRATION)) return

    const files = [LEGACY_FILE, LEGACY_BACKUP]
    const reads: LegacyRead[] = []
    for (const f of files) reads.push(await readLegacyFile(f))
    const found = reads.find((r): r is { status: 'ok'; data: LegacyStore } => r.status === 'ok')
    if (!found && reads.some(r => r.status === 'unreadable')) return   // keep the file(s); try again next launch

    const t = now()
    await d.withTransactionAsync(async () => {
      if (found) {
        const data = found.data
        for (const [key, v] of Object.entries(data.drafts || {})) {
          if (v && typeof v === 'object') await insertRow(d, 'insert or ignore', 'drafts', DRAFT_COLS, { ...v, localId: v.localId || key })
        }
        for (const [key, v] of Object.entries(data.surveyDrafts || {})) {
          if (v && typeof v === 'object') await insertRow(d, 'insert or ignore', 'survey_drafts', SURVEY_COLS, { ...v, localId: v.localId || key })
        }
        for (const [key, v] of Object.entries(data.clients || {})) {
          if (v) await d.runAsync('insert or ignore into clients_cache (id, json, cachedAt) values (?,?,?)', v.id || key, JSON.stringify(v), t)
        }
        for (const [key, v] of Object.entries(data.surveys || {})) {
          if (v) await d.runAsync('insert or ignore into surveys_cache (id, json, cachedAt) values (?,?,?)', v.id || key, JSON.stringify(v), t)
        }
        for (const [key, v] of Object.entries(data.assignedTasks || {})) {
          if (v) await d.runAsync('insert or ignore into assigned_tasks (id, json, cachedAt) values (?,?,?)', v.id || key, JSON.stringify(v), t)
        }
        for (const [key, v] of Object.entries(data.meta || {})) {
          if (v != null) await d.runAsync('insert or ignore into meta (key, value) values (?,?)', key, String(v))
        }
      }
      await d.runAsync('insert or ignore into migrations (name, doneAt) values (?,?)', LEGACY_MIGRATION, t)
    })

    for (const f of files) {
      try {
        if ((await FileSystem.getInfoAsync(f)).exists) await FileSystem.moveAsync({ from: f, to: `${f}.migrated` })
      } catch (err) {
        console.warn(`[Storage] Imported ${f} but could not rename it`, err)
      }
    }
  } catch (err) {
    console.warn('[Storage] Could not import the old survey store file; starting without it', err)
  }
}

/* ---------------------------------------------------- helpers ---------------------------------------------------- */

const now = () => new Date().toISOString()

const deleteFile = (uri?: string | null) => {
  if (!uri) return
  try {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
  } catch {
    /* already gone */
  }
}

/**
 * All writes run one after another on the single connection, so a read-modify-write (photos list, signatures) can never
 * interleave with another write. Reads wait for the writes already queued, so they see every change made before them.
 */
let writeTail: Promise<unknown> = Promise.resolve()
function write<T>(task: (d: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = writeTail.then(async () => task(await database()))
  writeTail = run.catch(() => {})
  return run
}
async function reader(): Promise<SQLite.SQLiteDatabase> {
  const queued = writeTail
  const d = await database()
  await queued
  return d
}

function toBind(v: unknown, json: boolean | undefined): SQLite.SQLiteBindValue {
  if (v === undefined || v === null) return null
  if (json) return JSON.stringify(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return v as SQLite.SQLiteBindValue
}

function parseJson<T>(text: unknown, fallback: () => T): T {
  if (typeof text !== 'string') return fallback()
  try {
    return JSON.parse(text) as T
  } catch (err) {
    console.warn('[Storage] Unreadable JSON column; using a default', err)
    return fallback()
  }
}

/** Inserts the columns of `obj` that are set; the rest take the column defaults. */
async function insertRow(d: SQLite.SQLiteDatabase, verb: 'insert or ignore' | 'insert or replace', tableName: string, cols: Col[], obj: Record<string, any>) {
  const names: string[] = []
  const vals: SQLite.SQLiteBindValue[] = []
  for (const [name, , json] of cols) {
    if (obj[name] === undefined) continue
    names.push(name)
    vals.push(toBind(obj[name], json))
  }
  await d.runAsync(`${verb} into ${tableName} (${names.join(', ')}) values (${names.map(() => '?').join(', ')})`, ...vals)
}

/** Builds `a = ?, b = ?` for the known columns in `p` (unknown keys are ignored). */
function setClause(cols: Col[], p: Record<string, any>): { sql: string; vals: SQLite.SQLiteBindValue[] } {
  const parts: string[] = []
  const vals: SQLite.SQLiteBindValue[] = []
  for (const [key, v] of Object.entries(p)) {
    const col = cols.find(c => c[0] === key)
    if (!col || key === 'localId') {
      if (key !== 'localId') console.warn(`[Storage] Ignoring unknown column ${key}`)
      continue
    }
    parts.push(`${key} = ?`)
    vals.push(toBind(v, col[2]))
  }
  return { sql: parts.join(', '), vals }
}

const byText = (get: (x: any) => string | null | undefined, desc = false) => (a: any, b: any) =>
  desc ? (get(b) || '').localeCompare(get(a) || '') : (get(a) || '').localeCompare(get(b) || '')

const lockedList = LOCKED_STATES.map(s => `'${s}'`).join(',')

function toDraft(r: Row): Draft {
  const out: Row = {}
  for (const [name, , json] of DRAFT_COLS) out[name] = json ? parseJson(r[name], () => ({})) : r[name]
  return out as Draft
}

function toSurvey(r: Row): SurveyDraft {
  const out: Row = {}
  for (const [name, , json] of SURVEY_COLS) {
    const v = r[name]
    if (v === null && SURVEY_OPTIONAL.has(name)) continue
    if (!json) out[name] = v
    else if (name === 'sections') out[name] = parseJson(v, () => defaultSurveySections())
    else if (name === 'overrides') out[name] = parseJson(v, () => ({ capacityKw: null, numberOfPanels: null, overrideReason: null }))
    else if (name === 'calculations') out[name] = parseJson(v, () => null)
    else out[name] = parseJson(v, () => [])
  }
  if (out.serverId && (!out.version || out.version < 1)) out.version = 1
  return out as SurveyDraft
}

const getDraftRow = async (d: SQLite.SQLiteDatabase, localId: string) => {
  const r = await d.getFirstAsync<Row>('select * from drafts where localId = ?', localId)
  return r ? toDraft(r) : null
}
const getSurveyRow = async (d: SQLite.SQLiteDatabase, localId: string) => {
  const r = await d.getFirstAsync<Row>('select * from survey_drafts where localId = ?', localId)
  return r ? toSurvey(r) : null
}

/* -------------------------------------------------- maintenance drafts -------------------------------------------------- */

export const drafts = {
  async all(owner: string): Promise<Draft[]> {
    const rows = await (await reader()).getAllAsync<Row>('select * from drafts where ownerUserId = ? order by rowid', owner)
    return rows.map(toDraft).sort(byText(d => d.localUpdatedAt, true))
  },

  async get(localId: string): Promise<Draft | null> {
    if (!localId || localId === 'new') return null
    return getDraftRow(await reader(), localId)
  },

  async create(d: Pick<Draft, 'localId' | 'clientId' | 'clientName' | 'fields' | 'ownerUserId'>): Promise<Draft> {
    const t = now()
    const item: Draft = {
      localId: d.localId,
      ownerUserId: d.ownerUserId ?? null,
      serverId: null,
      clientId: d.clientId,
      clientName: d.clientName,
      fields: d.fields,
      version: 0,
      dirty: 1,
      editSeq: 0,
      serverFieldsJson: null,
      syncState: 'local',
      engineerSigUri: null,
      engineerSigPending: 0,
      clientSigUri: null,
      clientSigPending: 0,
      submitRequested: 0,
      reportRef: null,
      nextVisitDate: null,
      lastError: null,
      attempts: 0,
      nextAttemptAt: null,
      conflictJson: null,
      localUpdatedAt: t,
      createdAt: t,
    }
    await write(db => insertRow(db, 'insert or replace', 'drafts', DRAFT_COLS, item))
    return { ...item }
  },

  /** Drafts created before owners were recorded belong to whoever signs in first after the upgrade. */
  async claimOrphans(owner: string) {
    await write(db => db.runAsync('update drafts set ownerUserId = ? where ownerUserId is null', owner))
  },

  /** Autosave: stores fields, marks dirty, bumps editSeq. Locked drafts are never changed. */
  async saveFields(localId: string, fields: ReportFields) {
    await write(db => db.runAsync(`update drafts set fields = ?, dirty = 1, editSeq = coalesce(editSeq, 0) + 1, localUpdatedAt = ?,
      syncState = case when syncState in ('synced','failed') then 'local' else syncState end
      where localId = ? and coalesce(syncState, '') not in (${lockedList})`, JSON.stringify(fields), now(), localId))
  },

  async setSignature(localId: string, kind: 'engineer' | 'client', uri: string): Promise<boolean> {
    return write(async db => {
      const before = await getDraftRow(db, localId)
      if (!before || LOCKED_STATES.includes(before.syncState)) {
        deleteFile(uri)
        return false
      }
      const col = kind === 'engineer' ? 'engineerSig' : 'clientSig'
      await db.runAsync(`update drafts set ${col}Uri = ?, ${col}Pending = 1, editSeq = coalesce(editSeq, 0) + 1, localUpdatedAt = ?,
        syncState = case when syncState in ('synced','failed') then 'local' else syncState end where localId = ?`, uri, now(), localId)
      const old = kind === 'engineer' ? before.engineerSigUri : before.clientSigUri
      if (old && old !== uri) deleteFile(old)
      return true
    })
  },

  /** Unconditional bookkeeping update (server ids, versions, states): only the columns given are written. */
  async patch(localId: string, p: Partial<Omit<Draft, 'fields'>> & { fields?: ReportFields }) {
    const { sql, vals } = setClause(DRAFT_COLS, p)
    if (!sql) return
    await write(db => db.runAsync(`update drafts set ${sql} where localId = ?`, ...vals, localId))
  },

  /** Clears `dirty` only if no edit happened since `editSeq` was read. Returns false when the draft changed meanwhile. */
  async ackFields(localId: string, editSeq: number, version: number, serverFieldsJson: string): Promise<boolean> {
    return write(async db => {
      const r = await db.runAsync('update drafts set dirty = 0, version = ?, serverFieldsJson = ? where localId = ? and editSeq = ?', version, serverFieldsJson, localId, editSeq)
      if (r.changes > 0) return true
      await db.runAsync('update drafts set version = ?, serverFieldsJson = ? where localId = ?', version, serverFieldsJson, localId)
      return false
    })
  },

  /** Clears a signature's pending flag only if the uploaded file is still the current one. */
  async ackSignature(localId: string, kind: 'engineer' | 'client', uploadedUri: string) {
    const col = kind === 'engineer' ? 'engineerSig' : 'clientSig'
    await write(db => db.runAsync(`update drafts set ${col}Pending = 0 where localId = ? and ${col}Uri = ?`, localId, uploadedUri))
  },

  /** Marks synced only if nothing changed and nothing is pending. */
  async markSyncedIfClean(localId: string, editSeq: number) {
    await write(db => db.runAsync(`update drafts set syncState = 'synced', attempts = 0, nextAttemptAt = null, lastError = null
      where localId = ? and editSeq = ? and dirty = 0 and engineerSigPending = 0 and clientSigPending = 0 and submitRequested = 0`, localId, editSeq))
  },

  async remove(localId: string) {
    await write(async db => {
      const d = await getDraftRow(db, localId)
      if (!d) return
      await db.runAsync('delete from drafts where localId = ?', localId)
      deleteFile(d.engineerSigUri)
      deleteFile(d.clientSigUri)
    })
  },

  async pending(owner: string): Promise<Draft[]> {
    const rows = await (await reader()).getAllAsync<Row>(`select * from drafts where ownerUserId = ?
      and coalesce(syncState, '') not in ('submitted','conflict','elsewhere','failed')
      and (serverId is null or dirty = 1 or engineerSigPending = 1 or clientSigPending = 1 or submitRequested = 1) order by rowid`, owner)
    return rows.map(toDraft).sort(byText(d => d.createdAt))
  },

  /** Earliest scheduled retry among this user's pending drafts (ISO), if any. */
  async nextRetryAt(owner: string): Promise<string | null> {
    const r = await (await reader()).getFirstAsync<{ t: string | null }>(`select min(nextAttemptAt) as t from drafts where ownerUserId = ?
      and nextAttemptAt is not null and nextAttemptAt <> '' and coalesce(syncState, '') not in ('submitted','conflict','elsewhere','failed')`, owner)
    return r?.t ?? null
  },

  /** Manual retry: failed drafts go back to the queue, and every backoff is reset. Queued submits stay queued. */
  async retryNow(owner: string) {
    await write(db => db.withTransactionAsync(async () => {
      await db.runAsync(`update drafts set syncState = case when submitRequested = 1 then 'submitting' else 'local' end,
        attempts = 0, nextAttemptAt = null, lastError = null where ownerUserId = ? and syncState = 'failed'`, owner)
      await db.runAsync('update drafts set attempts = 0, nextAttemptAt = null where ownerUserId = ? and nextAttemptAt is not null', owner)
    }))
  },

  async countFailed(owner: string): Promise<number> {
    const r = await (await reader()).getFirstAsync<{ n: number }>(`select count(*) as n from drafts where ownerUserId = ? and syncState = 'failed'`, owner)
    return r?.n ?? 0
  },

  async countUnsynced(owner: string): Promise<number> {
    const r = await (await reader()).getFirstAsync<{ n: number }>(`select count(*) as n from drafts where ownerUserId = ?
      and coalesce(syncState, '') not in ('synced','submitted','elsewhere')`, owner)
    return r?.n ?? 0
  },
}

/* ------------------------------------------------------ caches ------------------------------------------------------ */

/** Upsert that keeps the row's position (rowid), like re-assigning an existing key of a JS object. */
const upsertJson = (db: SQLite.SQLiteDatabase, tableName: string, id: string, value: unknown, t: string) =>
  db.runAsync(`insert into ${tableName} (id, json, cachedAt) values (?,?,?) on conflict(id) do update set json = excluded.json, cachedAt = excluded.cachedAt`,
    id, JSON.stringify(value), t)

async function allJson<T>(tableName: string): Promise<T[]> {
  const rows = await (await reader()).getAllAsync<{ json: string }>(`select json from ${tableName} order by rowid`)
  const out: T[] = []
  for (const r of rows) {
    const v = parseJson<T | null>(r.json, () => null)
    if (v != null) out.push(v)
  }
  return out
}

async function getJson<T>(tableName: string, id: string): Promise<T | null> {
  if (id == null) return null
  const r = await (await reader()).getFirstAsync<{ json: string }>(`select json from ${tableName} where id = ?`, id)
  return r ? parseJson<T | null>(r.json, () => null) : null
}

export const clientsCache = {
  /** Replaces the cache with the full server list (prunes clients that were removed or deactivated). */
  async replaceAll(list: Client[]) {
    await write(db => db.withTransactionAsync(async () => {
      const t = now()
      await db.runAsync('delete from clients_cache')
      for (const c of list) if (c && c.id) await upsertJson(db, 'clients_cache', c.id, c, t)
    }))
  },

  async put(list: Client[]) {
    await write(db => db.withTransactionAsync(async () => {
      const t = now()
      for (const c of list) if (c && c.id) await upsertJson(db, 'clients_cache', c.id, c, t)
    }))
  },

  async all(): Promise<Client[]> {
    return (await allJson<Client>('clients_cache')).sort((a, b) => a.name.localeCompare(b.name))
  },

  async get(id: string): Promise<Client | null> {
    return getJson<Client>('clients_cache', id)
  },
}

export const meta = {
  async get(key: string): Promise<string | null> {
    const r = await (await reader()).getFirstAsync<{ value: string | null }>('select value from meta where key = ?', key)
    return r?.value ?? null
  },

  async set(key: string, value: string) {
    await write(db => db.runAsync('insert into meta (key, value) values (?, ?) on conflict(key) do update set value = excluded.value', key, value))
  },
}

/* --------------------------------------------------- survey drafts --------------------------------------------------- */

export const surveyDrafts = {
  async all(owner: string): Promise<SurveyDraft[]> {
    const rows = await (await reader()).getAllAsync<Row>('select * from survey_drafts where ownerUserId = ? order by rowid', owner)
    return rows.map(toSurvey).sort(byText(s => s.localUpdatedAt, true))
  },

  async get(localId: string): Promise<SurveyDraft | null> {
    if (!localId || localId === 'new') return null
    return getSurveyRow(await reader(), localId)
  },

  async findByServerId(serverId: string, owner?: string | null): Promise<SurveyDraft | null> {
    if (!serverId) return null
    const db = await reader()
    const r = owner
      ? await db.getFirstAsync<Row>('select * from survey_drafts where serverId = ? and ownerUserId = ? order by rowid limit 1', serverId, owner)
      : await db.getFirstAsync<Row>('select * from survey_drafts where serverId = ? order by rowid limit 1', serverId)
    return r ? toSurvey(r) : null
  },

  async create(d: {
    localId: string
    ownerUserId: string | null
    serverId?: string | null
    surveyNumber?: string | null
    version?: number
    customerName: string
    siteAddress: string
    sections: SurveySections
  }): Promise<SurveyDraft> {
    const t = now()
    const initialVersion = (d.version && d.version > 0) ? d.version : (d.serverId ? 1 : 0)
    const item: SurveyDraft = {
      localId: d.localId,
      ownerUserId: d.ownerUserId ?? null,
      serverId: d.serverId ?? null,
      surveyNumber: d.surveyNumber ?? null,
      customerName: d.customerName,
      siteAddress: d.siteAddress,
      sections: d.sections,
      overrides: { capacityKw: null, numberOfPanels: null, overrideReason: null },
      calculations: null,
      version: initialVersion,
      dirty: 1,
      editSeq: 0,
      syncState: 'local',
      engineerSigUri: null,
      engineerSigPending: 0,
      customerSigUri: null,
      customerSigPending: 0,
      photos: [],
      submitRequested: 0,
      lastError: null,
      attempts: 0,
      nextAttemptAt: null,
      localUpdatedAt: t,
      createdAt: t,
    }
    await write(db => insertRow(db, 'insert or replace', 'survey_drafts', SURVEY_COLS, item))
    return { ...item }
  },

  /** Autosave: stores the sections (and overrides/calculations when given), marks dirty, bumps editSeq. */
  async saveSections(
    localId: string,
    sections: SurveySections,
    overrides?: SurveyOverrides | null,
    calculations?: SurveyCalculations | null
  ) {
    if (!localId || localId === 'new') return
    const custName = sections?.section0?.customerName || sections?.section1?.contactPerson || 'Untitled Survey'
    const siteAddr = sections?.section0?.siteAddress || ''
    const sets = ['sections = ?', 'customerName = ?', 'siteAddress = ?']
    const vals: SQLite.SQLiteBindValue[] = [JSON.stringify(sections), custName, siteAddr]
    if (overrides) { sets.push('overrides = ?'); vals.push(JSON.stringify(overrides)) }
    if (calculations !== undefined) { sets.push('calculations = ?'); vals.push(calculations === null ? null : JSON.stringify(calculations)) }
    await write(db => db.runAsync(`update survey_drafts set ${sets.join(', ')}, dirty = 1, editSeq = coalesce(editSeq, 0) + 1, localUpdatedAt = ?,
      syncState = case when syncState in ('synced','failed') then 'local' else syncState end
      where localId = ? and coalesce(syncState, '') not in ('submitting','submitted')`, ...vals, now(), localId))
  },

  async setSignature(localId: string, kind: 'engineer' | 'customer', uri: string): Promise<boolean> {
    if (!localId || localId === 'new') return false
    return write(async db => {
      const s = await getSurveyRow(db, localId)
      if (!s || s.syncState === 'submitted' || s.syncState === 'submitting') {
        deleteFile(uri)
        return false
      }
      const col = kind === 'engineer' ? 'engineerSig' : 'customerSig'
      await db.runAsync(`update survey_drafts set ${col}Uri = ?, ${col}Pending = 1, editSeq = coalesce(editSeq, 0) + 1, localUpdatedAt = ?,
        syncState = case when syncState in ('synced','failed') then 'local' else syncState end where localId = ?`, uri, now(), localId)
      const old = kind === 'engineer' ? s.engineerSigUri : s.customerSigUri
      if (old && old !== uri) deleteFile(old)
      return true
    })
  },

  async addPhoto(localId: string, photo: SurveyPhotoLocal) {
    if (!localId || localId === 'new') return
    await write(async db => {
      const s = await getSurveyRow(db, localId)
      if (!s) return
      const photos = [...(s.photos || []).filter(p => p.id !== photo.id), photo]
      await db.runAsync('update survey_drafts set photos = ?, dirty = 1, editSeq = coalesce(editSeq, 0) + 1, localUpdatedAt = ? where localId = ?',
        JSON.stringify(photos), now(), localId)
    })
  },

  async removePhoto(localId: string, photoId: string) {
    if (!localId || localId === 'new') return
    await write(async db => {
      const s = await getSurveyRow(db, localId)
      if (!s) return
      const target = (s.photos || []).find(p => p.id === photoId)
      const photos = (s.photos || []).filter(p => p.id !== photoId)
      const sets = ['photos = ?']
      const vals: SQLite.SQLiteBindValue[] = [JSON.stringify(photos)]
      if (target?.serverId) {   // already uploaded: delete it there too
        sets.push('pendingPhotoDeletes = ?')
        vals.push(JSON.stringify([...(s.pendingPhotoDeletes || []), target.serverId]))
      }
      await db.runAsync(`update survey_drafts set ${sets.join(', ')}, dirty = 1, editSeq = coalesce(editSeq, 0) + 1, localUpdatedAt = ? where localId = ?`,
        ...vals, now(), localId)
      if (target?.localUri) deleteFile(target.localUri)
    })
  },

  /** Unconditional bookkeeping update (server ids, versions, states): only the columns given are written. */
  async patch(localId: string, p: Partial<Omit<SurveyDraft, 'sections' | 'overrides' | 'calculations' | 'photos'>>) {
    if (!localId || localId === 'new') return
    const { sql, vals } = setClause(SURVEY_COLS, p)
    if (!sql) return
    await write(db => db.runAsync(`update survey_drafts set ${sql} where localId = ?`, ...vals, localId))
  },

  /**
   * The server accepted the fields sent at `editSeq`. The draft is clean only if nothing was edited meanwhile;
   * otherwise it stays dirty so the newer edits go up on the next sync.
   */
  async ackFields(localId: string, editSeq: number, version: number) {
    await write(db => db.runAsync(`update survey_drafts set version = ?, lastError = null, forceOverwrite = 0,
      dirty = case when editSeq = ? then 0 else dirty end,
      syncState = case when editSeq = ? and coalesce(syncState, '') <> 'submitting' and coalesce(submitRequested, 0) <> 1 then 'synced' else syncState end
      where localId = ?`, version, editSeq, editSeq, localId))
  },

  /** A photo reached the server: never upload it again, and remember its server id. */
  async ackPhoto(localId: string, photoId: string, serverPhotoId: string | null) {
    await write(async db => {
      const s = await getSurveyRow(db, localId)
      if (!s) return
      const photos = (s.photos || []).map(p => (p.id === photoId ? { ...p, pending: 0, serverId: serverPhotoId } : p))
      await db.runAsync('update survey_drafts set photos = ? where localId = ?', JSON.stringify(photos), localId)
    })
  },

  async ackPhotoDelete(localId: string, serverPhotoId: string) {
    await write(async db => {
      const s = await getSurveyRow(db, localId)
      if (!s) return
      const rest = (s.pendingPhotoDeletes || []).filter(id => id !== serverPhotoId)
      await db.runAsync('update survey_drafts set pendingPhotoDeletes = ? where localId = ?', JSON.stringify(rest), localId)
    })
  },

  async remove(localId: string) {
    if (!localId || localId === 'new') return
    await write(async db => {
      const s = await getSurveyRow(db, localId)
      if (!s) return
      await db.runAsync('delete from survey_drafts where localId = ?', localId)
      deleteFile(s.engineerSigUri)
      deleteFile(s.customerSigUri)
      for (const p of s.photos || []) deleteFile(p.localUri)
    })
  },

  async countUnsynced(owner: string): Promise<number> {
    const r = await (await reader()).getFirstAsync<{ n: number }>(`select count(*) as n from survey_drafts where ownerUserId = ?
      and coalesce(syncState, '') not in ('synced','submitted')`, owner)
    return r?.n ?? 0
  },
}

export const surveysCache = {
  async put(list: any[]) {
    await write(db => db.withTransactionAsync(async () => {
      const t = now()
      for (const s of list) if (s && s.id) await upsertJson(db, 'surveys_cache', s.id, s, t)
    }))
  },

  async all(): Promise<any[]> {
    return allJson<any>('surveys_cache')
  },

  async get(id: string): Promise<any | null> {
    return getJson<any>('surveys_cache', id)
  },
}

export const assignedTasksCache = {
  async replaceAll(list: AssignedSurveyTask[]) {
    await write(db => db.withTransactionAsync(async () => {
      const t = now()
      await db.runAsync('delete from assigned_tasks')
      for (const task of list) if (task && task.id) await upsertJson(db, 'assigned_tasks', task.id, task, t)
    }))
  },

  async put(list: AssignedSurveyTask[]) {
    await write(db => db.withTransactionAsync(async () => {
      const t = now()
      for (const task of list) if (task && task.id) await upsertJson(db, 'assigned_tasks', task.id, task, t)
    }))
  },

  async all(): Promise<AssignedSurveyTask[]> {
    return (await allJson<AssignedSurveyTask>('assigned_tasks'))
      .sort((a, b) => (b.plannedVisitDate || b.createdAt || '').localeCompare(a.plannedVisitDate || a.createdAt || ''))
  },

  async get(id: string): Promise<AssignedSurveyTask | null> {
    return getJson<AssignedSurveyTask>('assigned_tasks', id)
  },
}
