import type {
  SurveyCalculations,
  SurveyOverrides,
  SurveySection2,
  SurveySection3,
  SurveySection4,
  SurveySection5,
  SurveyVerdict,
  TariffCategory,
} from './surveyTypes'

export const TARIFF_RATES: Record<TariffCategory, number> = {
  'LT-1': 4.5,
  'LT-2': 7.0,
  'LT-3': 9.5,
  'HT': 8.0,
}

export interface CalculationSettings {
  sqftPerKw: number
  panelWp: number
  avgDailyGenerationHours: number
  daysPerMonth: number
  cableBufferMultiplier: number
}

export const DEFAULT_SETTINGS: CalculationSettings = {
  sqftPerKw: 100,
  panelWp: 550,
  avgDailyGenerationHours: 4,
  daysPerMonth: 30,
  cableBufferMultiplier: 1.2,
}

export function calculateSurvey(
  sec2: SurveySection2,
  sec3: SurveySection3,
  sec4: SurveySection4,
  sec5: SurveySection5,
  overrides?: SurveyOverrides | null,
  settings: CalculationSettings = DEFAULT_SETTINGS
): SurveyCalculations {
  const tariffRate = TARIFF_RATES[sec2?.tariffCategory] || 7.0

  // 1. Consumption calculation
  let avgDailyUnits = 0
  if (sec2?.history24MonthsUnits && sec2.history24MonthsUnits > 0) {
    avgDailyUnits = (sec2.history24MonthsUnits / 24.0) / settings.daysPerMonth
  } else if (sec2?.monthlyBillRs && sec2.monthlyBillRs > 0 && tariffRate > 0) {
    const monthlyUnits = sec2.monthlyBillRs / tariffRate
    avgDailyUnits = monthlyUnits / settings.daysPerMonth
  }

  const capacityByConsumptionKw = settings.avgDailyGenerationHours > 0
    ? round2(avgDailyUnits / settings.avgDailyGenerationHours)
    : 0

  // 2. Roof calculation
  let grossArea = 0
  let roofDataProvided = false
  if (sec3?.availableAreaSqft != null && sec3.availableAreaSqft >= 0) {
    grossArea = sec3.availableAreaSqft
    roofDataProvided = true
  } else if (
    sec3?.roofLengthFt != null &&
    sec3.roofLengthFt > 0 &&
    sec3?.roofWidthFt != null &&
    sec3.roofWidthFt > 0
  ) {
    grossArea = sec3.roofLengthFt * sec3.roofWidthFt
    roofDataProvided = true
  }

  let totalObstruction = 0
  if (sec3?.obstructionAreas && sec3.obstructionAreas.length > 0) {
    for (const obs of sec3.obstructionAreas) {
      if (obs.areaSqft && obs.areaSqft > 0) {
        totalObstruction += obs.areaSqft
      }
    }
  }

  const netFreeAreaSqft = round2(Math.max(0, grossArea - totalObstruction))
  const capacityByRoofKw = settings.sqftPerKw > 0
    ? round2(netFreeAreaSqft / settings.sqftPerKw)
    : 0

  // 3. Recommended system size
  let recommendedSystemSizeKw = 0
  if (overrides?.capacityKw != null && overrides.capacityKw > 0) {
    recommendedSystemSizeKw = round2(overrides.capacityKw)
  } else if (capacityByConsumptionKw > 0 && capacityByRoofKw > 0) {
    recommendedSystemSizeKw = Math.min(capacityByConsumptionKw, capacityByRoofKw)
  } else if (capacityByConsumptionKw > 0 && !roofDataProvided) {
    recommendedSystemSizeKw = capacityByConsumptionKw
  } else if (capacityByRoofKw > 0) {
    recommendedSystemSizeKw = capacityByRoofKw
  } else {
    recommendedSystemSizeKw = 0
  }

  // 4. Panel count
  const panelWp = settings.panelWp > 0 ? settings.panelWp : 550
  let numberOfPanels = 0
  if (overrides?.numberOfPanels != null && overrides.numberOfPanels > 0) {
    numberOfPanels = overrides.numberOfPanels
  } else if (recommendedSystemSizeKw > 0 && panelWp > 0) {
    numberOfPanels = Math.ceil((recommendedSystemSizeKw * 1000.0) / panelWp)
  }

  // 5. Generation & Savings
  const unitsGeneratedPerMonth = round2(
    recommendedSystemSizeKw * settings.avgDailyGenerationHours * settings.daysPerMonth
  )
  const monthlySavingsRs = round2(unitsGeneratedPerMonth * tariffRate)
  const annualSavingsRs = round2(monthlySavingsRs * 12.0)

  // 6. Cable lengths
  let sumCable = 0
  if (sec5?.cableRoutes && sec5.cableRoutes.length > 0) {
    for (const cr of sec5.cableRoutes) {
      if (cr.lengthM && cr.lengthM > 0) {
        sumCable += cr.lengthM
      }
    }
  }
  const totalCableLengthM = round2(sumCable * settings.cableBufferMultiplier)

  // 7. Flags & verdict
  const isRoofShortfall =
    capacityByConsumptionKw > 0 &&
    capacityByRoofKw > 0 &&
    capacityByRoofKw < capacityByConsumptionKw

  let sunHours = 0
  if (sec4?.sunExposure8to10) sunHours += 2
  if (sec4?.sunExposure10to2) sunHours += 4
  if (sec4?.sunExposure2to5) sunHours += 3

  const isShadowRisk =
    (sec4?.shadowAreaPercent != null && sec4.shadowAreaPercent > 30) ||
    sunHours < 6

  let suggestedVerdict: SurveyVerdict = 'FEASIBLE'
  if (recommendedSystemSizeKw <= 0 || (roofDataProvided && capacityByRoofKw <= 0)) {
    suggestedVerdict = 'NOT_FEASIBLE'
  } else if (isShadowRisk || isRoofShortfall || sec3?.roofCondition === 'Needs Repair') {
    suggestedVerdict = 'CONDITIONAL'
  } else {
    suggestedVerdict = 'FEASIBLE'
  }

  return {
    avgDailyUnits: round2(avgDailyUnits),
    capacityByConsumptionKw,
    netFreeAreaSqft,
    capacityByRoofKw,
    recommendedSystemSizeKw,
    numberOfPanels,
    unitsGeneratedPerMonth,
    monthlySavingsRs,
    annualSavingsRs,
    totalCableLengthM,
    isRoofShortfall,
    isShadowRisk,
    suggestedVerdict,
  }
}

function round2(val: number): number {
  return Math.round(val * 100) / 100
}
