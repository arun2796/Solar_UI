import axios, { AxiosError } from 'axios'
import { File, Paths } from 'expo-file-system'
import { config } from './config'
import { accessToken, refresh, type AuthResponse, type DevUser } from './auth'
import { syncStore } from './store'
import { labelForKey, type Client, type EngineerDashboard, type Me, type Paged, type Report, type ReportFields, type ReportListItem, type SubmitResult } from './types'

export const http = axios.create({ timeout: 20_000 })
http.interceptors.request.use(c => { c.baseURL = config.apiUrl; return c })   // read per request: the address can change at runtime in test builds
http.interceptors.request.use(async (c) => { const t = await accessToken(); if (t) c.headers.Authorization = `Bearer ${t}`; return c })
http.interceptors.response.use(
  (res) => { if (syncStore.get().net !== 'online') syncStore.set({ net: 'online' }); return res },   // any response proves we are online
  async (error: AxiosError) => {
    if (error.response && syncStore.get().net !== 'online') syncStore.set({ net: 'online' })
    const cfg = error.config as (typeof error.config & { _retried?: boolean }) | undefined
    if (error.response?.status === 401 && cfg && !cfg._retried) {
      // access token expired early or the API restarted with a new key: refresh once and retry.
      // If the API refuses the refresh token, refresh() signs out (back to login; drafts stay on the phone).
      const token = await refreshedToken()
      if (token) { cfg._retried = true; cfg.headers.Authorization = `Bearer ${token}`; return http(cfg) }
    }
    return Promise.reject(error)
  })

async function refreshedToken(): Promise<string | null> {
  try { return await refresh() } catch { return null }   // offline: keep the session
}

export type Problem = { title?: string; detail?: string; status?: number; errors?: Record<string, string[]>; current?: Report }
export const isNetworkError = (e: unknown) => axios.isAxiosError(e) && !e.response
export const statusOf = (e: unknown) => (axios.isAxiosError(e) ? e.response?.status : undefined)
export function problemOf(e: unknown): Problem { const ax = e as AxiosError<Problem>; return ax?.response?.data && typeof ax.response.data === 'object' ? ax.response.data : { title: (e as Error)?.message ?? 'Request failed' } }
/** Readable message; validation errors are listed by field label (e.g. "Visit date: must be …"). */
export function errorMessage(e: unknown): string {
  if (isNetworkError(e)) return 'No connection to the server'
  const p = problemOf(e)
  if (p.errors && Object.keys(p.errors).length) return Object.entries(p.errors).map(([k, v]) => `${labelForKey(k)}: ${v.join(', ')}`).join('\n')
  return p.detail ?? p.title ?? 'Request failed'
}

export const api = {
  me: () => http.get<Me>('/me').then(r => r.data),
  auth: {
    login: (email: string, password: string) => axios.post<AuthResponse>(`${config.apiUrl}/auth/login`, { email, password }, { timeout: 20_000 }).then(r => r.data),
    changePassword: (currentPassword: string, newPassword: string) => http.post('/auth/change-password', { currentPassword, newPassword }).then(() => undefined),
  },
  dev: {
    users: () => axios.get<DevUser[]>(`${config.apiUrl}/dev/users`, { params: { role: 'engineer' }, timeout: 8000 }).then(r => r.data),
    login: (userId: string) => axios.post<AuthResponse>(`${config.apiUrl}/dev/login`, { userId }, { timeout: 8000 }).then(r => r.data),
  },
  /** All active clients (pages through the API's 100-per-page limit). */
  allClients: async (): Promise<Client[]> => {
    const out: Client[] = []
    for (let page = 1; page <= 100; page++) {
      const r = (await http.get<Paged<Client>>('/clients', { params: { page, pageSize: 100, sort: 'name' } })).data
      out.push(...r.items)
      if (out.length >= r.total || r.items.length === 0) break
    }
    return out
  },
  client: (id: string) => http.get<Client>(`/clients/${id}`).then(r => r.data),
  dashboard: () => http.get<EngineerDashboard>('/dashboard/engineer').then(r => r.data),
  /** May this engineer start the client today? canStart is false when the visit is assigned to someone else. */
  assignmentCheck: (clientId: string) => http.get<{ canStart: boolean; assignedTo?: string | null; scheduledDate?: string | null; message?: string | null }>('/appointments/check', { params: { clientId } }).then(r => r.data),
  reports: {
    /** Final reports (submitted, or corrected by an admin), newest first. */
    history: async (): Promise<ReportListItem[]> => {
      const lists = await Promise.all(['submitted', 'corrected'].map(status =>
        http.get<Paged<ReportListItem>>('/reports', { params: { status, pageSize: 100, sort: 'visit_desc' } }).then(r => r.data.items)))
      return lists.flat().sort((a, b) => b.visitDate.localeCompare(a.visitDate) || (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
    },
    get: (id: string) => http.get<Report>(`/reports/${id}`).then(r => r.data),
    /** created = false when the server already had this clientLocalId (idempotent retry); its fields may be older than ours. */
    create: async (clientLocalId: string, clientId: string, fields: ReportFields) => {
      const r = await http.post<Report>('/reports', { clientLocalId, clientId, fields })
      return { report: r.data, created: r.status === 201 }
    },
    update: (id: string, version: number, fields: ReportFields) => http.put<Report>(`/reports/${id}`, { version, fields }).then(r => r.data),
    /** Signature uploads do not change the report version. */
    signature: async (id: string, kind: 'engineer' | 'client', fileUri: string) => {
      const form = new FormData()
      form.append('file', { uri: fileUri, name: `${kind}.png`, type: 'image/png' } as unknown as Blob)
      // Do not set Content-Type: axios adds multipart/form-data with the boundary itself.
      return http.post<Report>(`/reports/${id}/signatures/${kind}`, form, { timeout: 60_000 }).then(r => r.data)
    },
    submit: (id: string, version: number, nextVisitDate?: string | null) => http.post<SubmitResult>(`/reports/${id}/submit`, { version, nextVisitDate }).then(r => r.data),
    /** Downloads the PDF to the cache directory. Refreshes the session and retries once on 401. */
    downloadPdf: async (id: string, fileName: string): Promise<File> => {
      const safeName = fileName.replace(/[^\w.-]+/g, '_')
      const attempt = async (token: string | null) => {
        if (!token) throw new Error('You are signed out. Sign in again to download the PDF.')
        const dest = new File(Paths.cache, safeName)
        if (dest.exists) dest.delete()
        return File.downloadFileAsync(`${config.apiUrl}/reports/${id}/pdf?download=true`, dest, { headers: { Authorization: `Bearer ${token}` } })
      }
      try { return await attempt(await accessToken()) }
      catch (e) {
        const msg = String((e as Error)?.message ?? e)
        if (/signed out/.test(msg)) throw e
        if (/401/.test(msg)) { const t = await refreshedToken(); if (t) return attempt(t) }
        if (/401|403/.test(msg)) throw new Error('Not allowed to download this report. Sign in again.')
        if (/404/.test(msg)) throw new Error('Report not found on the server.')
        if (/5\d\d/.test(msg)) throw new Error('The server could not create the PDF. Try again shortly.')
        throw new Error('Could not download the PDF. Check the connection and try again.')
      }
    },
  },
}
