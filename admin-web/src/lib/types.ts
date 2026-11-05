// Mirrors backend/Application/Dtos/Dtos.cs (camelCase JSON)
export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number }
export type Role = 'admin' | 'engineer' | 'site_engineer'
/** Roles that work in the field; what they may do follows their permissions. */
export type FieldRole = 'engineer' | 'site_engineer'
export type Me = { userId: string; role: Role; engineerId?: string | null; engineerName?: string | null; email?: string | null; permissions?: string[] }

export type SurveyStatus = 'assigned' | 'draft' | 'submitted' | 'reviewed' | 'proposal_sent' | 'won' | 'lost'
export type SurveyVerdict = 'FEASIBLE' | 'CONDITIONAL' | 'NOT_FEASIBLE'
export type SiteType = 'gated_community' | 'commercial' | 'industrial' | 'maintenance'

export type SurveyListItem = {
  id: string
  clientLocalId: string
  surveyRef?: string | null
  engineerId: string
  engineerName: string
  clientId?: string | null
  customerName: string
  siteAddress: string
  siteType: SiteType
  status: SurveyStatus
  verdict?: SurveyVerdict | null
  recommendedSystemSizeKw?: number | null
  createdAt: string
  updatedAt: string
  submittedAt?: string | null
  assignedEngineerId?: string | null
  assignedEngineerName?: string | null
  plannedVisitDate?: string | null
  customerType?: 'Commercial' | 'Individual' | string | null
  companyName?: string | null
  contactPerson?: string | null
  contactPhone?: string | null
  cityArea?: string | null
  googleMapsUrl?: string | null
  assignmentNotes?: string | null
}

export type SurveyPhoto = {
  id: string
  surveyId: string
  sectionNumber: number
  tag?: string | null
  filePath: string
  caption?: string | null
  gpsLatitude?: number | null
  gpsLongitude?: number | null
  takenAt: string
  createdAt: string
}

export type SurveyDetail = {
  id: string
  clientLocalId: string
  surveyRef?: string | null
  engineerId: string
  engineerName: string
  clientId?: string | null
  customerName: string
  siteAddress: string
  gpsLatitude?: number | null
  gpsLongitude?: number | null
  gpsAccuracy?: number | null
  siteType: SiteType
  status: SurveyStatus
  verdict?: SurveyVerdict | null
  data: any
  calculations?: any
  overrides?: any
  engineerSignaturePath?: string | null
  customerSignaturePath?: string | null
  customerRepName?: string | null
  pdfPath?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  internalComments?: string | null
  risks?: string | null
  version: number
  createdAt: string
  updatedAt: string
  submittedAt?: string | null
  photos: SurveyPhoto[]
  assignedEngineerId?: string | null
  assignedEngineerName?: string | null
  assignedByUserId?: string | null
  assignedByUserName?: string | null
  assignedAt?: string | null
  customerType?: 'Commercial' | 'Individual' | string | null
  companyName?: string | null
  contactPerson?: string | null
  contactPhone?: string | null
  cityArea?: string | null
  googleMapsUrl?: string | null
  plannedVisitDate?: string | null
  assignmentNotes?: string | null
  approvedForProposalBy?: string | null
  approvedForProposalByName?: string | null
  approvedForProposalAt?: string | null
}

/** Office discussion on a survey (never shown to engineers). */
export type SurveyComment = { id: string; surveyId: string; userId?: string | null; authorName: string; authorRole?: Role | null; body: string; createdAt: string }

export type SurveyTaskCreate = {
  customerType: 'Commercial' | 'Individual'
  companyName?: string | null
  contactPerson: string
  contactPhone: string
  siteAddress: string
  cityArea?: string | null
  googleMapsUrl?: string | null
  gpsLatitude?: number | null
  gpsLongitude?: number | null
  siteType: SiteType
  plannedVisitDate?: string | null
  assignmentNotes?: string | null
  engineerId: string
  clientId?: string | null
}

export type SurveyReassign = {
  engineerId: string
  reason?: string | null
}

export type AmcStatus = 'FREE_YEAR1' | 'AMC' | 'EXPIRED' | 'NONE'
export const AMC_STATUSES: AmcStatus[] = ['FREE_YEAR1', 'AMC', 'EXPIRED', 'NONE']

export type Client = {
  id: string; name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null; siteLocation?: string | null
  solarCapacityKwp?: number | null; moduleMake?: string | null; moduleModel?: string | null; moduleCount?: number | null; moduleWattage?: number | null
  inverterMake?: string | null; inverterModel?: string | null; inverterCapacityKw?: number | null; installationDate?: string | null
  previousMaintenanceDate?: string | null; nextDueDate?: string | null; amcStatus: AmcStatus; amcStartDate?: string | null; amcExpiryDate?: string | null
  isActive: boolean; createdAt: string; updatedAt: string
}
export type ClientUpsert = Omit<Client, 'id' | 'isActive' | 'createdAt' | 'updatedAt' | 'amcStatus'> & { amcStatus?: AmcStatus | null }

/** Sign-in account. Admin accounts are managed on the Users page, engineers on the Engineers page. */
export type AppUser = { id: string; name?: string | null; email?: string | null; role: Role; isActive: boolean; hasPassword: boolean; engineerId?: string | null; lastLoginAt?: string | null; createdAt: string }
export type UserCreate = { name?: string | null; email: string; password: string; role: 'admin' }

export type Engineer = { id: string; name: string; phone?: string | null; email: string; employeeCode?: string | null; isActive: boolean; userId?: string | null; hasPassword?: boolean; createdAt: string; role: FieldRole; permissions: string[] }

// ---------------------------------------------------------------- permissions (field roles)
export type PermissionInfo = { key: string; label: string; description: string }
export type PermissionMatrix = { catalogue: PermissionInfo[]; roles: { role: FieldRole; label: string; permissions: string[] }[] }
/** overrides: permission -> true (allowed for this person) or false (denied); missing = follows the role. */
export type UserPermissions = { engineerId: string; role: FieldRole; roleLabel: string; rolePermissions: string[]; overrides: Record<string, boolean>; effective: string[] }

export type YesNo = 'YES' | 'NO'
export type GoodDefect = 'GOOD' | 'DEFECT'
export type ReportStatus = 'draft' | 'submitted' | 'corrected'

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

export type ReportListItem = {
  id: string; reportRef?: string | null; status: ReportStatus; visitDate: string; nextVisitDate?: string | null
  clientId: string; clientName: string; clientAmcStatus: AmcStatus; engineerId: string; engineerName: string; defectCount: number
  submittedAt?: string | null; updatedAt: string
}
export type Report = {
  id: string; clientLocalId: string; reportRef?: string | null; status: ReportStatus; version: number; defectCount: number
  clientId: string; clientName: string; engineerId: string; engineerName: string; fields: ReportFields
  hasEngineerSignature: boolean; hasClientSignature: boolean; submittedAt?: string | null; createdAt: string; updatedAt: string
}

export type DashboardSummary = { visitsThisMonth: number; submittedReports: number; pendingDrafts: number; defectsIdentified: number; upcomingVisits: number; overdueVisits: number; amcExpiringSoon: number }
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled'
export type Appointment = { id: string; clientId: string; clientName: string; siteLocation?: string | null; clientPhone?: string | null; engineerId: string; engineerName: string
  scheduledDate: string; scheduledTime?: string | null; notes?: string | null; status: AppointmentStatus; reportId?: string | null; reportRef?: string | null; createdAt: string }
/** scheduledTime: "HH:mm" or null */
export type AppointmentUpsert = { clientId: string; engineerId: string; scheduledDate: string; scheduledTime?: string | null; notes?: string | null }
export type ScheduleItem = { clientId: string; clientName: string; siteLocation?: string | null; nextDueDate?: string | null; previousMaintenanceDate?: string | null; amcStatus: AmcStatus; isOverdue: boolean }
export type DefectSummaryItem = { field: string; label: string; count: number }
export type Company = {
  companyName: string; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; state?: string | null; pincode?: string | null
  phone?: string | null; email?: string | null; website?: string | null; gstNumber?: string | null; adminAlertEmail?: string | null; pdfFooterText?: string | null; logoUrl?: string | null; updatedAt: string
}
export type ShareLink = { url: string; expiresAt: string }

/** Section definitions: labels are the physical PMC form's wording. */
export const SECTIONS: { title: string; remarks: keyof ReportFields; rows: { key: keyof ReportFields; label: string; type: 'yn' | 'gd' | 'num' }[] }[] = [
  { title: '1. Solar Module Inspection', remarks: 's1Remarks', rows: [
    { key: 's1ModuleCleaning', label: 'Solar module cleaning', type: 'yn' }, { key: 's1BrokenModule', label: 'Broken module', type: 'yn' },
    { key: 's1MountingStructure', label: 'Module mounting structure condition', type: 'gd' }, { key: 's1NutBoltTightness', label: 'Module nut and bolt tightness', type: 'gd' },
    { key: 's1PhotosBeforeAfter', label: 'Photos taken before and after cleaning', type: 'yn' } ] },
  { title: '2. DC System Inspection', remarks: 's2Remarks', rows: [
    { key: 's2DcCables', label: 'DC cables condition', type: 'gd' }, { key: 's2Mc4Connectors', label: 'MC4 connectors condition', type: 'gd' },
    { key: 's2DcJunctionBox', label: 'DC junction box condition', type: 'gd' }, { key: 's2StringVoltage', label: 'String voltage measurement', type: 'gd' },
    { key: 's2CableInsulation', label: 'Cable insulation condition', type: 'gd' } ] },
  { title: '3. Inverter Inspection', remarks: 's3Remarks', rows: [
    { key: 's3InverterWorking', label: 'Inverter working condition', type: 'gd' }, { key: 's3CoolingFans', label: 'Cooling fans working', type: 'gd' },
    { key: 's3AcOutputVoltage', label: 'Inverter AC output voltage', type: 'gd' }, { key: 's3OtherIssues', label: 'Other inverter issues', type: 'gd' } ] },
  { title: '4. AC System Inspection', remarks: 's4Remarks', rows: [
    { key: 's4AcCablesConnections', label: 'AC cables and electrical connections', type: 'gd' }, { key: 's4AcDistributionBoard', label: 'AC distribution board condition', type: 'gd' },
    { key: 's4McbMccb', label: 'MCB / MCCB condition', type: 'gd' } ] },
  { title: '5. Earthing and Safety', remarks: 's5Remarks', rows: [
    { key: 's5EquipmentEarthing', label: 'Equipment earthing condition', type: 'gd' }, { key: 's5LightningArrester', label: 'Lightning arrester condition', type: 'gd' },
    { key: 's5SurgeProtection', label: 'Surge protection device condition', type: 'gd' }, { key: 's5EarthingPit', label: 'Earthing pit condition', type: 'gd' } ] },
  { title: '6. Generation Performance', remarks: 's6Remarks', rows: [
    { key: 's6TotalGenerationKwh', label: 'Total generation this month (kWh)', type: 'num' }, { key: 's6AvgDailyGenerationKwh', label: 'Average daily generation (kWh)', type: 'num' },
    { key: 's6ExpectedGenerationKwh', label: 'Expected generation (kWh)', type: 'num' }, { key: 's6PerformanceStatus', label: 'Performance status', type: 'gd' } ] },
  { title: '7. Net Meter / EB Check', remarks: 's7Remarks', rows: [
    { key: 's7ImportUnits', label: 'Import units', type: 'num' }, { key: 's7ExportUnits', label: 'Export units', type: 'num' },
    { key: 's7NetMeterCondition', label: 'Net meter condition', type: 'gd' } ] },
]
