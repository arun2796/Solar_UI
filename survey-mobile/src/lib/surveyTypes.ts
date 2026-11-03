export type SiteType = 'gated_community' | 'commercial' | 'industrial' | 'maintenance'
export type CustomerType = 'Residential' | 'Commercial' | 'Industrial'
export type PhaseType = '1-phase' | '3-phase'
export type TariffCategory = 'LT-1' | 'LT-2' | 'LT-3' | 'HT'
export type InstallationType = 'RCC' | 'Sheet' | 'Ground' | 'Car Park'
export type RoofCondition = 'Good' | 'Moderate' | 'Needs Repair'
export type RoofOrientation = 'South' | 'North' | 'East' | 'West' | 'South-East' | 'South-West'
export type TiltType = 'Flat' | 'Sloped'
export type MaterialAccess = 'Lift' | 'Stairs' | 'Crane'
export type SurveyVerdict = 'FEASIBLE' | 'CONDITIONAL' | 'NOT_FEASIBLE'
export type SurveyStatus = 'assigned' | 'draft' | 'submitted' | 'reviewed' | 'proposal_sent' | 'won' | 'lost'

export interface AssignedSurveyTask {
  id: string
  surveyRef: string
  status: SurveyStatus
  engineerId: string
  engineerName?: string
  assignedEngineerId?: string
  assignedEngineerName?: string
  assignedByUserId?: string
  assignedByUserName?: string
  assignedAt?: string
  customerType?: 'Commercial' | 'Individual' | string
  companyName?: string
  contactPerson?: string
  contactPhone?: string
  siteAddress?: string
  cityArea?: string
  googleMapsUrl?: string
  gpsLatitude?: number | null
  gpsLongitude?: number | null
  siteType?: SiteType | string
  plannedVisitDate?: string
  assignmentNotes?: string
  createdAt: string
  updatedAt: string
}

export interface ObstructionAreaItem {
  description: string
  areaSqft: number
}

export interface CableRouteItem {
  label: string
  lengthM: number
}

export interface SurveySection0 {
  engineerName: string
  customerName: string
  siteAddress: string
  visitDate: string
  gpsLat: number | null
  gpsLng: number | null
  siteType: SiteType
  clientId: string | null
}

export interface SurveySection1 {
  contactPerson: string
  contactPhone: string
  contactEmail: string
  customerType: CustomerType
  designation: string
  numberOfUnits: number | null
  numberOfTowers: number | null
}

export interface SurveySection2 {
  ebServiceNumbers: string[]
  sanctionedLoadKw: number | null
  contractDemandKva: number | null
  phaseType: PhaseType
  monthlyBillRs: number | null
  tariffCategory: TariffCategory
  netMetering: boolean
  history24MonthsUnits: number | null
  history24MonthsAmount: number | null
}

export interface SurveySection3 {
  installationType: InstallationType
  availableAreaSqft: number | null
  roofCondition: RoofCondition
  orientation: RoofOrientation
  tiltType: TiltType
  tiltAngleDeg: number | null
  hasObstructions: boolean
  roofLengthFt: number | null
  roofWidthFt: number | null
  obstructionAreas: ObstructionAreaItem[]
  waterproofingStatus: string
  materialAccess: MaterialAccess
}

export interface SurveySection4 {
  shadowObserved: boolean
  shadowSources: string
  timeOfObservation: string
  shadowAreaPercent: number | null
  sunExposure8to10: boolean
  sunExposure10to2: boolean
  sunExposure2to5: boolean
}

export interface SurveySection5 {
  mdbLocation: string
  roofToInverterDistanceM: number | null
  inverterSpace: string
  earthingPoints: number | null
  wifiAvailable: boolean
  ebMeterLocation: string
  acdbLocation: string
  cableRoutes: CableRouteItem[]
  earthPitLocation: string
}

export interface SurveySection6 {
  recommendedCapacityKw: number | null
  mountingStructure: string
  cableRouteFeasible: boolean
  structuralReinforcement: boolean
  safetyConstraints: string
}

export interface SurveySection7Checklist {
  ebBill: boolean
  idProof: boolean
  roofPhotos: boolean
  panelPhoto: boolean
}

export interface SurveySection7 {
  checklist: SurveySection7Checklist
}

export interface SurveySection8 {
  observations: string
  specialRequirements: string
  risks: string
  engineerSignatureDate: string | null
  customerSignatureDate: string | null
  engineerSigned: boolean
  customerSigned: boolean
}

export interface SurveySection9 {
  verdict: SurveyVerdict | null
  systemSizeKw: number | null
  numberOfPanels: number | null
  panelWp: number | null
  areaRequiredSqft: number | null
  monthlyGenerationUnits: number | null
  monthlySavingsRs: number | null
  annualSavingsRs: number | null
  recommendationNote: string
  conditions: string
}

export interface SurveySections {
  section0: SurveySection0
  section1: SurveySection1
  section2: SurveySection2
  section3: SurveySection3
  section4: SurveySection4
  section5: SurveySection5
  section6: SurveySection6
  section7: SurveySection7
  section8: SurveySection8
  section9: SurveySection9
}

export interface SurveyOverrides {
  capacityKw: number | null
  numberOfPanels: number | null
  overrideReason: string | null
}

export interface SurveyCalculations {
  avgDailyUnits: number
  capacityByConsumptionKw: number
  netFreeAreaSqft: number
  capacityByRoofKw: number
  recommendedSystemSizeKw: number
  numberOfPanels: number
  areaRequiredSqft: number
  unitsGeneratedPerMonth: number
  monthlySavingsRs: number
  annualSavingsRs: number
  totalCableLengthM: number
  isRoofShortfall: boolean
  isShadowRisk: boolean
  suggestedVerdict: SurveyVerdict
}

export interface SurveyPhotoLocal {
  id: string
  localUri: string
  remoteUrl?: string | null
  section: string
  caption?: string | null
  latitude?: number | null
  longitude?: number | null
  capturedAt: string
  pending: number // 1 = pending upload, 0 = uploaded
  serverId?: string | null // id of the uploaded photo on the server (needed to delete it there)
}

export type SurveyDraftSyncState = 'local' | 'syncing' | 'synced' | 'submitting' | 'submitted' | 'failed' | 'conflict'

export interface SurveyDraft {
  localId: string
  ownerUserId: string | null
  serverId: string | null
  surveyNumber: string | null
  customerName: string
  siteAddress: string
  sections: SurveySections
  overrides: SurveyOverrides
  calculations: SurveyCalculations | null
  version: number
  dirty: number
  editSeq: number
  syncState: SurveyDraftSyncState
  engineerSigUri: string | null
  engineerSigPending: number
  customerSigUri: string | null
  customerSigPending: number
  photos: SurveyPhotoLocal[]
  submitRequested: number
  lastError: string | null
  attempts: number
  nextAttemptAt: string | null
  localUpdatedAt: string
  createdAt: string
  /** Server photo ids removed on the phone, still to be deleted on the server. */
  pendingPhotoDeletes?: string[]
  /** 1 = the engineer chose "Send my version" after a conflict: the next upload replaces the office's changes. */
  forceOverwrite?: number
}

export function defaultSurveySections(engineerName = ''): SurveySections {
  const today = new Date().toISOString().slice(0, 10)
  return {
    section0: {
      engineerName,
      customerName: '',
      siteAddress: '',
      visitDate: today,
      gpsLat: null,
      gpsLng: null,
      siteType: 'commercial',
      clientId: null,
    },
    section1: {
      contactPerson: '',
      contactPhone: '',
      contactEmail: '',
      customerType: 'Commercial',
      designation: '',
      numberOfUnits: null,
      numberOfTowers: null,
    },
    section2: {
      ebServiceNumbers: [''],
      sanctionedLoadKw: null,
      contractDemandKva: null,
      phaseType: '3-phase',
      monthlyBillRs: null,
      tariffCategory: 'LT-2',
      netMetering: true,
      history24MonthsUnits: null,
      history24MonthsAmount: null,
    },
    section3: {
      installationType: 'RCC',
      availableAreaSqft: null,
      roofCondition: 'Good',
      orientation: 'South',
      tiltType: 'Flat',
      tiltAngleDeg: 10,
      hasObstructions: false,
      roofLengthFt: null,
      roofWidthFt: null,
      obstructionAreas: [],
      waterproofingStatus: 'Good',
      materialAccess: 'Stairs',
    },
    section4: {
      shadowObserved: false,
      shadowSources: '',
      timeOfObservation: '12:00 PM',
      shadowAreaPercent: 0,
      sunExposure8to10: true,
      sunExposure10to2: true,
      sunExposure2to5: true,
    },
    section5: {
      mdbLocation: 'Ground floor electrical room',
      roofToInverterDistanceM: null,
      inverterSpace: 'Adequate wall space available',
      earthingPoints: null,
      wifiAvailable: true,
      ebMeterLocation: 'Main gate / electrical panel room',
      acdbLocation: 'Adjacent to main inverter',
      cableRoutes: [
        { label: 'DC Cable (Panels to Inverter)', lengthM: 20 },
        { label: 'AC Cable (Inverter to MDB)', lengthM: 30 },
      ],
      earthPitLocation: 'Behind building / near electrical room',
    },
    section6: {
      recommendedCapacityKw: null,
      mountingStructure: 'Elevated HDGI structure with 10 deg south tilt',
      cableRouteFeasible: true,
      structuralReinforcement: false,
      safetyConstraints: 'Lifeline and perimeter safety harness required during installation',
    },
    section7: {
      checklist: {
        ebBill: false,
        idProof: false,
        roofPhotos: false,
        panelPhoto: false,
      },
    },
    section8: {
      observations: '',
      specialRequirements: '',
      risks: '',
      engineerSignatureDate: null,
      customerSignatureDate: null,
      engineerSigned: false,
      customerSigned: false,
    },
    section9: {
      verdict: null,
      systemSizeKw: null,
      numberOfPanels: null,
      panelWp: 550,
      areaRequiredSqft: null,
      monthlyGenerationUnits: null,
      monthlySavingsRs: null,
      annualSavingsRs: null,
      recommendationNote: '',
      conditions: '',
    },
  }
}
