import * as SQLite from 'expo-sqlite'
import * as FileSystem from 'expo-file-system/legacy'
import { defaultSurveySections } from '../lib/surveyTypes'
import type { AssignedSurveyTask, SurveyCalculations, SurveyDraft, SurveyOverrides, SurveyPhotoLocal, SurveySections } from '../lib/surveyTypes'
import { db, queuedWrites, serialWrite } from './index'
export type { SurveyDraft }

/* ------------------------------------------------------------------------------------------------------------------
 * Site survey storage, in the same SQLite database as the maintenance drafts (solar-maintenance.db), so one app keeps
 * both kinds of work. Tables are created on first use and only ever gain columns (never dropped or rebuilt).
 * One row per survey draft / cached item; nested objects are JSON text columns.
 * ---------------------------------------------------------------------------------------------------------------- */

/** [column, SQL type, stored as JSON text] */
type Col = [string, string, boolean?]

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

let _ready: Promise<SQLite.SQLiteDatabase> | null = null
function database(): Promise<SQLite.SQLiteDatabase> {
  if (!_ready) {
    _ready = setup().catch(err => {
      _ready = null   // let the next call try again
      throw err
    })
  }
  return _ready
}

async function setup(): Promise<SQLite.SQLiteDatabase> {
  const d = await db()
  await d.execAsync(`
    create table if not exists survey_drafts (${SURVEY_COLS.map(([c, t]) => `${c} ${t}`).join(', ')});
    create table if not exists surveys_cache (id text primary key not null, json text not null, cachedAt text);
    create table if not exists assigned_tasks (id text primary key not null, json text not null, cachedAt text);
    create index if not exists survey_drafts_owner on survey_drafts (ownerUserId);
    create index if not exists survey_drafts_server on survey_drafts (serverId);
  `)
  const have = new Set((await d.getAllAsync<{ name: string }>('pragma table_info(survey_drafts)')).map(c => c.name))
  for (const [name, type] of SURVEY_COLS) {
    if (!have.has(name)) await d.execAsync(`alter table survey_drafts add column ${name} ${type.replace(/primary key|not null/g, '')}`)
  }
  // A survey that exists on the server has at least version 1.
  await d.runAsync('update survey_drafts set version = 1 where serverId is not null and (version is null or version < 1)')
  return d
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
function write<T>(task: (d: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return serialWrite(async () => task(await database()))   // the queue shared with the maintenance store (./index)
}
async function reader(): Promise<SQLite.SQLiteDatabase> {
  const queued = queuedWrites()
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

const getSurveyRow = async (d: SQLite.SQLiteDatabase, localId: string) => {
  const r = await d.getFirstAsync<Row>('select * from survey_drafts where localId = ?', localId)
  return r ? toSurvey(r) : null
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
