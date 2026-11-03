import axios, { AxiosError } from 'axios'
import type { DevUser } from './devAuth'
import { accessToken, API_URL, logout, refresh, setSession, type AuthResponse } from './session'
import { queryClient } from './queryClient'
import { SECTIONS } from './types'
import type { Appointment, AppointmentUpsert, AppUser, Client, ClientUpsert, Company, DashboardSummary, DefectSummaryItem, Engineer, Me, Paged, Report, ReportFields, ReportListItem, ScheduleItem, ShareLink, SurveyComment, SurveyDetail, SurveyListItem, SurveyReassign, SurveyTaskCreate, UserCreate } from './types'

export { API_URL }

export const http = axios.create({ baseURL: API_URL, timeout: 30_000 })

/** Forgets cached server data (e.g. before a different user signs in). */
export function resetLocalState() {
  queryClient.clear()
}

/** Signs out this browser: revokes the refresh token at the API and clears local state. */
export async function signOut() {
  resetLocalState()
  await logout()
}

/** Stores a session returned by /auth/login or /dev/login. */
export function startSession(r: AuthResponse, dev = false) {
  resetLocalState()
  setSession({ ...r, dev })
}

const toLogin = () => {
  if (window.location.pathname === '/login') return
  window.location.assign(`/login?from=${encodeURIComponent(window.location.pathname + window.location.search)}`)
}

http.interceptors.request.use(async (config) => {
  const t = await accessToken()
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})
http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const cfg = error.config as (typeof error.config & { _retried?: boolean }) | undefined
  if (error.response?.status !== 401 || !cfg || cfg._retried) return Promise.reject(error)
  try {
    const t = await refresh()                                        // access token expired or the API restarted with a new key
    if (t) { cfg._retried = true; cfg.headers.Authorization = `Bearer ${t}`; return http(cfg) }
  } catch { return Promise.reject(error) }                           // API unreachable: keep the session
  await signOut(); toLogin()
  return Promise.reject(error)
})

export type Problem = { title?: string; detail?: string; status?: number; errors?: Record<string, string[]>; current?: unknown }
export const statusOf = (e: unknown) => (axios.isAxiosError(e) ? e.response?.status : undefined)
export function problemOf(e: unknown): Problem {
  const ax = e as AxiosError<Problem>
  const data = ax?.response?.data
  if (data && typeof data === 'object' && !(data instanceof Blob)) return data
  return { title: ax?.message ?? 'Request failed', status: ax?.response?.status }
}

// Human labels for validation keys such as "Fields.S3InverterWorking", "s6TotalGenerationKwh", "engineerSignature".
const LABELS: Record<string, string> = Object.fromEntries([
  ...SECTIONS.flatMap(s => [...s.rows.map(r => [r.key.toLowerCase(), r.label] as const), [String(s.remarks).toLowerCase(), `${s.title} remarks`] as const]),
  ['visitdate', 'Visit date'], ['nextvisitdate', 'Next visit date'], ['previousmaintenancedate', 'Previous maintenance date'], ['techniciancount', 'Number of technicians'],
  ['engineersignature', 'Engineer signature'], ['clientsignature', 'Client signature'], ['reason', 'Reason'], ['clientrepname', 'Client representative name'],
])
export const fieldLabel = (key: string) => { const k = key.split('.').pop()!.replace(/^\$/, ''); return LABELS[k.toLowerCase()] ?? k }

export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e) && !e.response) return e.code === 'ECONNABORTED' ? 'The API did not respond in time. Try again.' : `Cannot reach the API at ${API_URL}. Check that it is running.`
  const p = problemOf(e)
  const fieldErrors = p.errors ? Object.entries(p.errors).map(([k, v]) => `${fieldLabel(k)}: ${v.join(', ')}`).join('; ') : ''
  return [p.detail ?? p.title, fieldErrors].filter(Boolean).join(' — ')
}

/** Blob requests return error bodies as Blobs; turn a JSON ProblemDetails blob back into an object so errorMessage works. */
async function unblobError(e: unknown): Promise<never> {
  if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
    try { e.response.data = JSON.parse(await e.response.data.text()) } catch { /* not JSON */ }
  }
  throw e
}

const q = (params: Record<string, unknown>) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))

export const api = {
  me: () => http.get<Me>('/me').then(r => r.data),
  auth: {
    login: (email: string, password: string) => axios.post<AuthResponse>(`${API_URL}/auth/login`, { email, password }, { timeout: 30_000 }).then(r => r.data),
    changePassword: (currentPassword: string, newPassword: string) => http.post('/auth/change-password', { currentPassword, newPassword }).then(() => undefined),
  },
  dev: {
    users: (role?: string) => axios.get<DevUser[]>(`${API_URL}/dev/users`, { params: q({ role }), timeout: 10_000 }).then(r => r.data),
    login: (userId: string) => axios.post<AuthResponse>(`${API_URL}/dev/login`, { userId }, { timeout: 10_000 }).then(r => r.data),
  },
  clients: {
    list: (p: { search?: string; active?: boolean; page?: number; pageSize?: number; sort?: string }) => http.get<Paged<Client>>('/clients', { params: q(p) }).then(r => r.data),
    get: (id: string) => http.get<Client>(`/clients/${id}`).then(r => r.data),
    create: (d: ClientUpsert) => http.post<Client>('/clients', d).then(r => r.data),
    update: (id: string, d: ClientUpsert) => http.put<Client>(`/clients/${id}`, d).then(r => r.data),
    setActive: (id: string, active: boolean) => http.post<Client>(`/clients/${id}/${active ? 'activate' : 'deactivate'}`).then(r => r.data),
    updateAmc: (id: string, d: { amcStatus: string; amcStartDate?: string | null; amcExpiryDate?: string | null }) => http.put<Client>(`/clients/${id}/amc`, d).then(r => r.data),
  },
  engineers: {
    list: (active?: boolean) => http.get<Engineer[]>('/engineers', { params: q({ active }) }).then(r => r.data),
    create: (d: { name: string; phone?: string | null; email: string; employeeCode?: string | null; password: string }) => http.post<Engineer>('/engineers', d).then(r => r.data),
    update: (id: string, d: { name: string; phone?: string | null; employeeCode?: string | null }) => http.put<Engineer>(`/engineers/${id}`, d).then(r => r.data),
    setActive: (id: string, active: boolean) => http.post<Engineer>(`/engineers/${id}/${active ? 'activate' : 'deactivate'}`).then(r => r.data),
    setPassword: (id: string, password: string) => http.post<Engineer>(`/engineers/${id}/password`, { password }).then(r => r.data),
  },
  users: {
    list: () => http.get<AppUser[]>('/users').then(r => r.data),
    create: (d: UserCreate) => http.post<AppUser>('/users', d).then(r => r.data),
    setActive: (id: string, active: boolean) => http.post<AppUser>(`/users/${id}/${active ? 'activate' : 'deactivate'}`).then(r => r.data),
    setPassword: (id: string, newPassword: string) => http.post<AppUser>(`/users/${id}/password`, { newPassword }).then(r => r.data),
  },
  reports: {
    list: (p: { search?: string; engineerId?: string; clientId?: string; from?: string; to?: string; status?: string; amcStatus?: string; page?: number; pageSize?: number; sort?: string }) =>
      http.get<Paged<ReportListItem>>('/reports', { params: q(p) }).then(r => r.data),
    get: (id: string) => http.get<Report>(`/reports/${id}`).then(r => r.data),
    correct: (id: string, d: { version: number; reason: string; fields: ReportFields }) => http.post<Report>(`/reports/${id}/corrections`, d).then(r => r.data),
    pdfUrl: (id: string, download = false) => `${API_URL}/reports/${id}/pdf${download ? '?download=true' : ''}`,
    pdfBlob: (id: string) => http.get(`/reports/${id}/pdf`, { responseType: 'blob', timeout: 90_000 }).then(r => r.data as Blob, unblobError),
    shareLink: (id: string) => http.post<ShareLink>(`/reports/${id}/share-link`).then(r => r.data),
  },
  appointments: {
    list: (p: { from: string; to: string; engineerId?: string; clientId?: string; status?: string }) => http.get<Appointment[]>('/appointments', { params: q(p) }).then(r => r.data),
    create: (d: AppointmentUpsert) => http.post<Appointment>('/appointments', d).then(r => r.data),
    update: (id: string, d: AppointmentUpsert) => http.put<Appointment>(`/appointments/${id}`, d).then(r => r.data),
    cancel: (id: string, reason?: string) => http.post<Appointment>(`/appointments/${id}/cancel`, { reason: reason || null }).then(r => r.data),
  },
  /** All active clients, sorted by name (pages through the API's 100-per-page limit). */
  activeClients: async (): Promise<Client[]> => {
    const out: Client[] = []
    for (let page = 1; page <= 100; page++) {
      const r = (await http.get<Paged<Client>>('/clients', { params: { active: true, page, pageSize: 100, sort: 'name' } })).data
      out.push(...r.items)
      if (out.length >= r.total || r.items.length === 0) break
    }
    return out
  },
  dashboard: { summary: () => http.get<DashboardSummary>('/dashboard/summary').then(r => r.data) },
  schedule: {
    range: (from?: string, to?: string) => http.get<ScheduleItem[]>('/schedule', { params: q({ from, to }) }).then(r => r.data),
    overdue: () => http.get<ScheduleItem[]>('/schedule/overdue').then(r => r.data),
  },
  amc: (p: { status?: string; expiringWithinDays?: number }) => http.get<Client[]>('/amc', { params: q(p) }).then(r => r.data),
  defects: (from?: string, to?: string) => http.get<DefectSummaryItem[]>('/defects/summary', { params: q({ from, to }) }).then(r => r.data),
  company: {
    get: () => http.get<Company>('/company').then(r => r.data),
    update: (d: Omit<Company, 'logoUrl' | 'updatedAt'>) => http.put<Company>('/company', d).then(r => r.data),
    logo: (file: File) => { const f = new FormData(); f.append('file', file); return http.post<Company>('/company/logo', f).then(r => r.data) },
  },
  surveys: {
    list: (p: { search?: string; engineerId?: string; clientId?: string; from?: string; to?: string; status?: string; siteType?: string; verdict?: string; page?: number; pageSize?: number; sort?: string }) =>
      http.get<Paged<SurveyListItem>>('/surveys', { params: q(p) }).then(r => r.data),
    get: (id: string) => http.get<SurveyDetail>(`/surveys/${id}`).then(r => r.data),
    createTask: (d: SurveyTaskCreate) => http.post<SurveyDetail>('/surveys/tasks', d).then(r => r.data),
    reassign: (id: string, d: SurveyReassign) => http.post<SurveyDetail>(`/surveys/${id}/reassign`, d).then(r => r.data),
    update: (id: string, d: { version: number; data: any; overrides?: any }) =>
      http.put<SurveyDetail>(`/surveys/${id}`, d).then(r => r.data),
    updateStatus: (id: string, d: { status: string; internalComments?: string | null }) =>
      http.post<SurveyDetail>(`/surveys/${id}/status`, d).then(r => r.data),
    approve: (id: string) => http.post<SurveyDetail>(`/surveys/${id}/approve`).then(r => r.data),
    comments: {
      list: (id: string) => http.get<SurveyComment[]>(`/surveys/${id}/comments`).then(r => r.data),
      add: (id: string, body: string) => http.post<SurveyComment>(`/surveys/${id}/comments`, { body }).then(r => r.data),
    },
    pdfUrl: (id: string, download = false) => `${API_URL}/surveys/${id}/pdf${download ? '?download=true' : ''}`,
    pdfBlob: (id: string) => http.get(`/surveys/${id}/pdf`, { responseType: 'blob', timeout: 90_000 }).then(r => r.data as Blob, unblobError),
    shareLink: (id: string) => http.post<{ url: string; expiresAt: string }>(`/surveys/${id}/share-link`).then(r => r.data),
    email: (id: string, email?: string) => http.post<{ message: string }>(`/surveys/${id}/email`, { email }).then(r => r.data),
    settings: {
      get: () => http.get<Record<string, string>>('/surveys/settings').then(r => r.data),
      update: (d: Record<string, string>) => http.put<Record<string, string>>('/surveys/settings', d).then(r => r.data),
    },
  },
}
