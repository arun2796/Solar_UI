// Mirrors backend DTOs (camelCase JSON). Field labels are the physical PMC form's wording.
export type YesNo = 'YES' | 'NO'
export type GoodDefect = 'GOOD' | 'DEFECT'
export type ReportStatus = 'draft' | 'submitted' | 'corrected'
export type AmcStatus = 'FREE_YEAR1' | 'AMC' | 'EXPIRED' | 'NONE'
export const AMC_LABELS: Record<string, string> = { FREE_YEAR1: 'Free 1st year', AMC: 'AMC active', EXPIRED: 'AMC expired', NONE: 'No AMC' }
export const amcLabel = (s?: string | null) => (s ? AMC_LABELS[s] ?? s : '—')

export type Me = { userId: string; role: 'admin' | 'engineer'; engineerId?: string | null; engineerName?: string | null; email?: string | null }

export type Client = {
  id: string; name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null; siteLocation?: string | null
  solarCapacityKwp?: number | null; moduleMake?: string | null; moduleModel?: string | null; moduleCount?: number | null; moduleWattage?: number | null
  inverterMake?: string | null; inverterModel?: string | null; inverterCapacityKw?: number | null; installationDate?: string | null
  previousMaintenanceDate?: string | null; nextDueDate?: string | null; amcStatus: AmcStatus; amcStartDate?: string | null; amcExpiryDate?: string | null; isActive: boolean
}

export type ReportFields = {
  visitDate: string; previousMaintenanceDate?: string | null; technicianCount?: number | null
  s1ModuleCleaning?: YesNo | null; s1BrokenModule?: YesNo | null; s1MountingStructure?: GoodDefect | null; s1NutBoltTightness?: GoodDefect | null; s1PhotosBeforeAfter?: YesNo | null; s1Remarks?: string | null
  s2DcCables?: GoodDefect | null; s2Mc4Connectors?: GoodDefect | null; s2DcJunctionBox?: GoodDefect | null; s2StringVoltage?: GoodDefect | null; s2CableInsulation?: GoodDefect | null; s2Remarks?: string | null
  s3InverterWorking?: GoodDefect | null; s3CoolingFans?: GoodDefect | null; s3AcOutputVoltage?: GoodDefect | null; s3OtherIssues?: GoodDefect | null; s3Remarks?: string | null
  s4AcCablesConnections?: GoodDefect | null; s4AcDistributionBoard?: GoodDefect | null; s4McbMccb?: GoodDefect | null; s4Remarks?: string | null
  s5EquipmentEarthing?: GoodDefect | null; s5LightningArrester?: GoodDefect | null; s5SurgeProtection?: GoodDefect | null; s5EarthingPit?: GoodDefect | null; s5Remarks?: string | null
  s6TotalGenerationKwh?: number | null; s6AvgDailyGenerationKwh?: number | null; s6ExpectedGenerationKwh?: number | null; s6PerformanceStatus?: GoodDefect | null; s6Remarks?: string | null
  s7ImportUnits?: number | null; s7ExportUnits?: number | null; s7NetMeterCondition?: GoodDefect | null; s7Remarks?: string | null
  s8GeneralObservations?: string | null; s8ActionRequired?: string | null; nextVisitDate?: string | null; clientRepName?: string | null
}

export type Report = {
  id: string; clientLocalId: string; reportRef?: string | null; status: ReportStatus; version: number; defectCount: number
  clientId: string; clientName: string; engineerId: string; engineerName: string; fields: ReportFields
  hasEngineerSignature: boolean; hasClientSignature: boolean; submittedAt?: string | null; createdAt: string; updatedAt: string
}
export type ReportListItem = { id: string; reportRef?: string | null; status: ReportStatus; visitDate: string; nextVisitDate?: string | null; clientId: string; clientName: string; engineerName: string; defectCount: number; submittedAt?: string | null; updatedAt: string }
export type SubmitResult = { id: string; reportRef: string; nextVisitDate: string; submittedAt: string; version: number }
/** A visit the office assigned to this engineer (scheduledTime "HH:mm:ss" or null). */
export type Appointment = { id: string; clientId: string; clientName: string; siteLocation?: string | null; clientPhone?: string | null; engineerId: string; engineerName: string
  scheduledDate: string; scheduledTime?: string | null; notes?: string | null; status: 'scheduled' | 'completed' | 'cancelled'; reportId?: string | null; reportRef?: string | null }
export type EngineerDashboard = { todayVisits: number; drafts: number; submittedThisMonth: number; upcoming: { clientId: string; clientName: string; siteLocation?: string | null; nextDueDate?: string | null; amcStatus: AmcStatus; isOverdue: boolean }[]; myVisits?: Appointment[] }
export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number }

export type FieldType = 'yn' | 'gd' | 'num'
export type SectionDef = { n: number; title: string; remarks: keyof ReportFields; remarksLabel?: string; rows: { key: keyof ReportFields; label: string; type: FieldType }[] }

export const SECTIONS: SectionDef[] = [
  { n: 1, title: 'Solar Module Inspection', remarks: 's1Remarks', rows: [
    { key: 's1ModuleCleaning', label: 'Solar module cleaning', type: 'yn' }, { key: 's1BrokenModule', label: 'Broken module', type: 'yn' },
    { key: 's1MountingStructure', label: 'Module mounting structure condition', type: 'gd' }, { key: 's1NutBoltTightness', label: 'Module nut and bolt tightness', type: 'gd' },
    { key: 's1PhotosBeforeAfter', label: 'Photos taken before and after cleaning', type: 'yn' } ] },
  { n: 2, title: 'DC System Inspection', remarks: 's2Remarks', rows: [
    { key: 's2DcCables', label: 'DC cables condition', type: 'gd' }, { key: 's2Mc4Connectors', label: 'MC4 connectors condition', type: 'gd' },
    { key: 's2DcJunctionBox', label: 'DC junction box condition', type: 'gd' }, { key: 's2StringVoltage', label: 'String voltage measurement', type: 'gd' },
    { key: 's2CableInsulation', label: 'Cable insulation condition', type: 'gd' } ] },
  { n: 3, title: 'Inverter Inspection', remarks: 's3Remarks', rows: [
    { key: 's3InverterWorking', label: 'Inverter working condition', type: 'gd' }, { key: 's3CoolingFans', label: 'Cooling fans working', type: 'gd' },
    { key: 's3AcOutputVoltage', label: 'Inverter AC output voltage', type: 'gd' }, { key: 's3OtherIssues', label: 'Other inverter issues', type: 'gd' } ] },
  { n: 4, title: 'AC System Inspection', remarks: 's4Remarks', rows: [
    { key: 's4AcCablesConnections', label: 'AC cables and electrical connections', type: 'gd' }, { key: 's4AcDistributionBoard', label: 'AC distribution board condition', type: 'gd' },
    { key: 's4McbMccb', label: 'MCB / MCCB condition', type: 'gd' } ] },
  { n: 5, title: 'Earthing and Safety', remarks: 's5Remarks', rows: [
    { key: 's5EquipmentEarthing', label: 'Equipment earthing condition', type: 'gd' }, { key: 's5LightningArrester', label: 'Lightning arrester condition', type: 'gd' },
    { key: 's5SurgeProtection', label: 'Surge protection device condition', type: 'gd' }, { key: 's5EarthingPit', label: 'Earthing pit condition', type: 'gd' } ] },
  { n: 6, title: 'Generation Performance', remarks: 's6Remarks', remarksLabel: 'Remarks / reasons for poor performance', rows: [
    { key: 's6TotalGenerationKwh', label: 'Total generation this month (kWh)', type: 'num' }, { key: 's6AvgDailyGenerationKwh', label: 'Average daily generation (kWh)', type: 'num' },
    { key: 's6ExpectedGenerationKwh', label: 'Expected generation (kWh)', type: 'num' }, { key: 's6PerformanceStatus', label: 'Performance status', type: 'gd' } ] },
  { n: 7, title: 'Net Meter / EB Check', remarks: 's7Remarks', rows: [
    { key: 's7ImportUnits', label: 'Import units', type: 'num' }, { key: 's7ExportUnits', label: 'Export units', type: 'num' },
    { key: 's7NetMeterCondition', label: 'Net meter condition', type: 'gd' } ] },
]
export const SECTION_8_TITLE = 'Observations and Issues'

/** Local calendar date as YYYY-MM-DD (never toISOString, which is UTC and shifts the day in IST). */
export const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Parses YYYY-MM-DD as a local date; null when it is not a real calendar date (e.g. 2026-02-30). */
export function parseIso(iso?: string | null): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null
}
export const isValidIso = (iso?: string | null) => parseIso(iso) !== null
export const todayIso = () => toIso(new Date())
export const addDays = (iso: string, days: number) => {
  const d = parseIso(iso) ?? new Date()
  d.setDate(d.getDate() + days)
  return toIso(d)
}
export const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const dt = d.length === 10 ? parseIso(d) : new Date(d)
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : d
}

/** Human labels for every report field (validation messages, conflict diffs). */
export const FIELD_LABELS: Record<string, string> = {
  visitDate: 'Visit date', previousMaintenanceDate: 'Previous maintenance date', technicianCount: 'Number of technicians',
  s8GeneralObservations: '8. General observations', s8ActionRequired: '8. Action required', nextVisitDate: '8. Next visit date', clientRepName: 'Client representative name',
  ...Object.fromEntries(SECTIONS.flatMap(s => [...s.rows.map(r => [r.key, `${s.n}. ${r.label}`]), [s.remarks, `${s.n}. ${s.remarksLabel ?? 'Remarks'}`]])),
}
/** Maps server error keys like "Fields.S6TotalGenerationKwh" to a field label. */
export function labelForKey(key: string): string {
  const k = key.replace(/^\$?\.?fields\./i, '')
  const camel = k.charAt(0).toLowerCase() + k.slice(1)
  return FIELD_LABELS[camel] ?? FIELD_LABELS[k] ?? k
}

export function generateUuid(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
