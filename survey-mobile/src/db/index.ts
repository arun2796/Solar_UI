import * as FileSystem from 'expo-file-system/legacy'
import type { Client, ReportFields } from '../lib/types'
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

interface StoreData {
  drafts: Record<string, Draft>
  clients: Record<string, Client>
  meta: Record<string, string>
  surveyDrafts: Record<string, SurveyDraft>
  surveys: Record<string, any>
  assignedTasks: Record<string, AssignedSurveyTask>
}

let _store: StoreData | null = null
let _initPromise: Promise<StoreData> | null = null

const now = () => new Date().toISOString()
const DB_FILE = `${FileSystem.documentDirectory || ''}solar-survey-data.json`
const DB_TMP = `${DB_FILE}.tmp`
const DB_BACKUP = `${DB_FILE}.bak`

const deleteFile = (uri?: string | null) => {
  if (!uri) return
  try {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
  } catch {
    /* already gone */
  }
}

async function getStore(): Promise<StoreData> {
  if (_store) return _store
  if (!_initPromise) {
    _initPromise = (async () => {
      let data: StoreData = {
        drafts: {},
        clients: {},
        meta: {},
        surveyDrafts: {},
        surveys: {},
        assignedTasks: {},
      }
      // The main file, else the copy kept from the previous good save. A file that cannot be read is never overwritten
      // with an empty store: it is set aside (…corrupt-<time>.json) so nothing is lost silently.
      for (const file of [DB_FILE, DB_BACKUP]) {
        const parsed = await readStoreFile(file)
        if (parsed) {
          data = {
            drafts: parsed.drafts || {},
            clients: parsed.clients || {},
            meta: parsed.meta || {},
            surveyDrafts: parsed.surveyDrafts || {},
            surveys: parsed.surveys || {},
            assignedTasks: parsed.assignedTasks || {},
          }
          break
        }
      }
      _store = data
      return _store
    })()
  }
  return _initPromise
}

async function readStoreFile(file: string): Promise<Partial<StoreData> | null> {
  if (!FileSystem.documentDirectory) return null
  try {
    if (!(await FileSystem.getInfoAsync(file)).exists) return null
    const raw = await FileSystem.readAsStringAsync(file)
    if (!raw || !raw.trim()) return null
    return JSON.parse(raw) as Partial<StoreData>
  } catch (err) {
    console.warn(`[Storage] ${file} is unreadable; keeping it aside`, err)
    await FileSystem.copyAsync({ from: file, to: `${file}.corrupt-${Date.now()}.json` }).catch(() => {})
    return null
  }
}

let writeChain: Promise<void> = Promise.resolve()

/**
 * Saves the whole store without ever leaving a half-written file: write a temporary file, keep the current file as the
 * backup, then move the temporary file into place. Saves run one after another, never interleaved.
 */
function persistNow(): Promise<void> {
  writeChain = writeChain.then(async () => {
    if (!_store || !FileSystem.documentDirectory) return
    try {
      await FileSystem.writeAsStringAsync(DB_TMP, JSON.stringify(_store))
      if ((await FileSystem.getInfoAsync(DB_FILE)).exists) await FileSystem.copyAsync({ from: DB_FILE, to: DB_BACKUP })
      await FileSystem.moveAsync({ from: DB_TMP, to: DB_FILE })
    } catch (err) {
      console.warn('[Storage] Failed to persist survey store file', err)
    }
  })
  return writeChain
}

export function db(): Promise<any> {
  return Promise.resolve({
    runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    execAsync: async () => {},
    withTransactionAsync: async (cb: any) => cb(),
  })
}

export const drafts = {
  async all(owner: string): Promise<Draft[]> {
    const store = await getStore()
    return Object.values(store.drafts)
      .filter(d => d.ownerUserId === owner)
      .sort((a, b) => (b.localUpdatedAt || '').localeCompare(a.localUpdatedAt || ''))
      .map(d => ({ ...d }))
  },

  async get(localId: string): Promise<Draft | null> {
    if (!localId || localId === 'new') return null
    const store = await getStore()
    const d = store.drafts[localId]
    return d ? { ...d } : null
  },

  async create(d: Pick<Draft, 'localId' | 'clientId' | 'clientName' | 'fields' | 'ownerUserId'>): Promise<Draft> {
    const store = await getStore()
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
    store.drafts[d.localId] = item
    await persistNow()
    return { ...item }
  },

  async claimOrphans(owner: string) {
    const store = await getStore()
    let changed = false
    for (const d of Object.values(store.drafts)) {
      if (d.ownerUserId === null) {
        d.ownerUserId = owner
        changed = true
      }
    }
    if (changed) await persistNow()
  },

  async saveFields(localId: string, fields: ReportFields) {
    const store = await getStore()
    const d = store.drafts[localId]
    if (!d || LOCKED_STATES.includes(d.syncState)) return
    d.fields = fields
    d.dirty = 1
    d.editSeq = (d.editSeq || 0) + 1
    d.localUpdatedAt = now()
    if (d.syncState === 'synced' || d.syncState === 'failed') {
      d.syncState = 'local'
    }
    await persistNow()
  },

  async setSignature(localId: string, kind: 'engineer' | 'client', uri: string): Promise<boolean> {
    const store = await getStore()
    const d = store.drafts[localId]
    if (!d || LOCKED_STATES.includes(d.syncState)) {
      deleteFile(uri)
      return false
    }
    const old = kind === 'engineer' ? d.engineerSigUri : d.clientSigUri
    if (old && old !== uri) deleteFile(old)

    if (kind === 'engineer') {
      d.engineerSigUri = uri
      d.engineerSigPending = 1
    } else {
      d.clientSigUri = uri
      d.clientSigPending = 1
    }
    d.editSeq = (d.editSeq || 0) + 1
    d.localUpdatedAt = now()
    if (d.syncState === 'synced' || d.syncState === 'failed') {
      d.syncState = 'local'
    }
    await persistNow()
    return true
  },

  async patch(localId: string, p: Partial<Omit<Draft, 'fields'>> & { fields?: ReportFields }) {
    const store = await getStore()
    const d = store.drafts[localId]
    if (!d) return
    Object.assign(d, p)
    await persistNow()
  },

  async ackFields(localId: string, editSeq: number, version: number, serverFieldsJson: string): Promise<boolean> {
    const store = await getStore()
    const d = store.drafts[localId]
    if (!d) return false
    if (d.editSeq === editSeq) {
      d.dirty = 0
      d.version = version
      d.serverFieldsJson = serverFieldsJson
      await persistNow()
      return true
    } else {
      d.version = version
      d.serverFieldsJson = serverFieldsJson
      await persistNow()
      return false
    }
  },

  async ackSignature(localId: string, kind: 'engineer' | 'client', uploadedUri: string) {
    const store = await getStore()
    const d = store.drafts[localId]
    if (!d) return
    if (kind === 'engineer' && d.engineerSigUri === uploadedUri) {
      d.engineerSigPending = 0
    } else if (kind === 'client' && d.clientSigUri === uploadedUri) {
      d.clientSigPending = 0
    }
    await persistNow()
  },

  async markSyncedIfClean(localId: string, editSeq: number) {
    const store = await getStore()
    const d = store.drafts[localId]
    if (!d) return
    if (d.editSeq === editSeq && d.dirty === 0 && d.engineerSigPending === 0 && d.clientSigPending === 0 && d.submitRequested === 0) {
      d.syncState = 'synced'
      d.attempts = 0
      d.nextAttemptAt = null
      d.lastError = null
      await persistNow()
    }
  },

  async remove(localId: string) {
    const store = await getStore()
    const d = store.drafts[localId]
    if (d) {
      deleteFile(d.engineerSigUri)
      deleteFile(d.clientSigUri)
      delete store.drafts[localId]
      await persistNow()
    }
  },

  async pending(owner: string): Promise<Draft[]> {
    const store = await getStore()
    return Object.values(store.drafts)
      .filter(d =>
        d.ownerUserId === owner &&
        !['submitted', 'conflict', 'elsewhere', 'failed'].includes(d.syncState) &&
        (d.serverId === null || d.dirty === 1 || d.engineerSigPending === 1 || d.clientSigPending === 1 || d.submitRequested === 1)
      )
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
      .map(d => ({ ...d }))
  },

  async nextRetryAt(owner: string): Promise<string | null> {
    const store = await getStore()
    const times = Object.values(store.drafts)
      .filter(d => d.ownerUserId === owner && d.nextAttemptAt && !['submitted', 'conflict', 'elsewhere', 'failed'].includes(d.syncState))
      .map(d => d.nextAttemptAt!)
    if (!times.length) return null
    times.sort()
    return times[0]
  },

  async retryNow(owner: string) {
    const store = await getStore()
    let changed = false
    for (const d of Object.values(store.drafts)) {
      if (d.ownerUserId === owner) {
        if (d.syncState === 'failed') {
          d.syncState = d.submitRequested === 1 ? 'submitting' : 'local'
          d.attempts = 0
          d.nextAttemptAt = null
          d.lastError = null
          changed = true
        }
        if (d.nextAttemptAt !== null) {
          d.attempts = 0
          d.nextAttemptAt = null
          changed = true
        }
      }
    }
    if (changed) await persistNow()
  },

  async countFailed(owner: string): Promise<number> {
    const store = await getStore()
    return Object.values(store.drafts).filter(d => d.ownerUserId === owner && d.syncState === 'failed').length
  },

  async countUnsynced(owner: string): Promise<number> {
    const store = await getStore()
    return Object.values(store.drafts).filter(d => d.ownerUserId === owner && !['synced', 'submitted', 'elsewhere'].includes(d.syncState)).length
  },
}

export const clientsCache = {
  async replaceAll(list: Client[]) {
    const store = await getStore()
    store.clients = {}
    for (const c of list) {
      store.clients[c.id] = c
    }
    await persistNow()
  },

  async put(list: Client[]) {
    const store = await getStore()
    for (const c of list) {
      store.clients[c.id] = c
    }
    await persistNow()
  },

  async all(): Promise<Client[]> {
    const store = await getStore()
    return Object.values(store.clients).sort((a, b) => a.name.localeCompare(b.name))
  },

  async get(id: string): Promise<Client | null> {
    const store = await getStore()
    return store.clients[id] ?? null
  },
}

export const meta = {
  async get(key: string): Promise<string | null> {
    const store = await getStore()
    return store.meta[key] ?? null
  },

  async set(key: string, value: string) {
    const store = await getStore()
    store.meta[key] = value
    await persistNow()
  },
}

export const surveyDrafts = {
  async all(owner: string): Promise<SurveyDraft[]> {
    const store = await getStore()
    return Object.values(store.surveyDrafts)
      .filter(s => s.ownerUserId === owner)
      .sort((a, b) => (b.localUpdatedAt || '').localeCompare(a.localUpdatedAt || ''))
      .map(s => {
        const item = { ...s }
        if (item.serverId && (!item.version || item.version < 1)) {
          item.version = 1
          s.version = 1
        }
        return item
      })
  },

  async get(localId: string): Promise<SurveyDraft | null> {
    if (!localId || localId === 'new') return null
    const store = await getStore()
    const s = store.surveyDrafts[localId]
    if (!s) return null
    const item = { ...s }
    if (item.serverId && (!item.version || item.version < 1)) {
      item.version = 1
      s.version = 1
    }
    return item
  },

  async findByServerId(serverId: string, owner?: string | null): Promise<SurveyDraft | null> {
    if (!serverId) return null
    const store = await getStore()
    const found = Object.values(store.surveyDrafts).find(
      s => s.serverId === serverId && (!owner || s.ownerUserId === owner)
    )
    if (!found) return null
    const item = { ...found }
    if (item.serverId && (!item.version || item.version < 1)) {
      item.version = 1
      found.version = 1
    }
    return item
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
    const store = await getStore()
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
    store.surveyDrafts[d.localId] = item
    await persistNow()
    return { ...item }
  },

  async saveSections(
    localId: string,
    sections: SurveySections,
    overrides?: SurveyOverrides | null,
    calculations?: SurveyCalculations | null
  ) {
    if (!localId || localId === 'new') return
    const store = await getStore()
    const s = store.surveyDrafts[localId]
    if (!s) return
    if (s.syncState === 'submitting' || s.syncState === 'submitted') return
    const custName = sections?.section0?.customerName || sections?.section1?.contactPerson || 'Untitled Survey'
    const siteAddr = sections?.section0?.siteAddress || ''
    s.sections = sections
    if (overrides) s.overrides = overrides
    if (calculations !== undefined) s.calculations = calculations
    s.customerName = custName
    s.siteAddress = siteAddr
    s.dirty = 1
    s.editSeq = (s.editSeq || 0) + 1
    s.localUpdatedAt = now()
    if (s.syncState === 'synced' || s.syncState === 'failed') {
      s.syncState = 'local'
    }
    await persistNow()
  },

  async setSignature(localId: string, kind: 'engineer' | 'customer', uri: string): Promise<boolean> {
    if (!localId || localId === 'new') return false
    const store = await getStore()
    const s = store.surveyDrafts[localId]
    if (!s || s.syncState === 'submitted' || s.syncState === 'submitting') {
      deleteFile(uri)
      return false
    }
    const old = kind === 'engineer' ? s.engineerSigUri : s.customerSigUri
    if (old && old !== uri) deleteFile(old)

    if (kind === 'engineer') {
      s.engineerSigUri = uri
      s.engineerSigPending = 1
    } else {
      s.customerSigUri = uri
      s.customerSigPending = 1
    }
    s.editSeq = (s.editSeq || 0) + 1
    s.localUpdatedAt = now()
    if (s.syncState === 'synced' || s.syncState === 'failed') {
      s.syncState = 'local'
    }
    await persistNow()
    return true
  },

  async addPhoto(localId: string, photo: SurveyPhotoLocal) {
    if (!localId || localId === 'new') return
    const store = await getStore()
    const s = store.surveyDrafts[localId]
    if (!s) return
    s.photos = [...(s.photos || []).filter(p => p.id !== photo.id), photo]
    s.dirty = 1
    s.editSeq = (s.editSeq || 0) + 1
    s.localUpdatedAt = now()
    await persistNow()
  },

  async removePhoto(localId: string, photoId: string) {
    if (!localId || localId === 'new') return
    const store = await getStore()
    const s = store.surveyDrafts[localId]
    if (!s) return
    const target = (s.photos || []).find(p => p.id === photoId)
    if (target?.localUri) deleteFile(target.localUri)
    s.photos = (s.photos || []).filter(p => p.id !== photoId)
    s.dirty = 1
    s.editSeq = (s.editSeq || 0) + 1
    s.localUpdatedAt = now()
    await persistNow()
  },

  async patch(localId: string, p: Partial<Omit<SurveyDraft, 'sections' | 'overrides' | 'calculations' | 'photos'>>) {
    if (!localId || localId === 'new') return
    const store = await getStore()
    const s = store.surveyDrafts[localId]
    if (!s) return
    Object.assign(s, p)
    await persistNow()
  },

  async remove(localId: string) {
    if (!localId || localId === 'new') return
    const store = await getStore()
    const s = store.surveyDrafts[localId]
    if (s) {
      deleteFile(s.engineerSigUri)
      deleteFile(s.customerSigUri)
      if (s.photos) {
        for (const p of s.photos) {
          deleteFile(p.localUri)
        }
      }
      delete store.surveyDrafts[localId]
      await persistNow()
    }
  },

  async countUnsynced(owner: string): Promise<number> {
    const store = await getStore()
    return Object.values(store.surveyDrafts).filter(
      s => s.ownerUserId === owner && !['synced', 'submitted'].includes(s.syncState)
    ).length
  },
}

export const surveysCache = {
  async put(list: any[]) {
    const store = await getStore()
    for (const s of list) {
      if (s && s.id) {
        store.surveys[s.id] = s
      }
    }
    await persistNow()
  },

  async all(): Promise<any[]> {
    const store = await getStore()
    return Object.values(store.surveys)
  },

  async get(id: string): Promise<any | null> {
    const store = await getStore()
    return store.surveys[id] ?? null
  },
}

export const assignedTasksCache = {
  async replaceAll(list: AssignedSurveyTask[]) {
    const store = await getStore()
    store.assignedTasks = {}
    for (const t of list) {
      if (t && t.id) {
        store.assignedTasks[t.id] = t
      }
    }
    await persistNow()
  },

  async put(list: AssignedSurveyTask[]) {
    const store = await getStore()
    store.assignedTasks = store.assignedTasks || {}
    for (const t of list) {
      if (t && t.id) {
        store.assignedTasks[t.id] = t
      }
    }
    await persistNow()
  },

  async all(): Promise<AssignedSurveyTask[]> {
    const store = await getStore()
    return Object.values(store.assignedTasks || {})
      .sort((a, b) => (b.plannedVisitDate || b.createdAt || '').localeCompare(a.plannedVisitDate || a.createdAt || ''))
  },

  async get(id: string): Promise<AssignedSurveyTask | null> {
    const store = await getStore()
    return (store.assignedTasks && store.assignedTasks[id]) || null
  },
}
