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

// Section 9 auto-calculations. Formulas, rounding and rules are the same as the API's SurveyCalculator.cs, so the
// phone, the server and the PDF show the same numbers (tests: surveyCalculator.test.mts and SurveyCalculatorTests.cs).

export const TARIFF_RATES: Record<TariffCategory, number> = {
  'LT-1': 4.5,
  'LT-2': 7.0,
  'LT-3': 9.5,
  'HT': 8.0,
}

/** Calculation constants. The admin edits them in Settings (API keys in brackets); these are the brief's defaults. */
export interface CalculationSettings {
  generationPerKwPerDay: number   // generation_per_kw_per_day
  areaPerKwSqft: number           // area_per_kw_sqft
  panelWp: number                 // default_panel_wp
  cableBufferMultiplier: number   // cable_buffer_multiplier
  daysIn24Months: number          // days_in_24_months
  daysInMonth: number             // days_in_month
  tariffs: Record<TariffCategory, number>   // tariff_lt1, tariff_lt2, tariff_lt3, tariff_ht (₹ per unit)
}

export const DEFAULT_SETTINGS: CalculationSettings = {
  generationPerKwPerDay: 4,
  areaPerKwSqft: 50,
  panelWp: 550,
  cableBufferMultiplier: 1.2,
  daysIn24Months: 730,
  daysInMonth: 30,
  tariffs: TARIFF_RATES,
}

type NumericSetting = Exclude<keyof CalculationSettings, 'tariffs'>
const API_KEYS: Record<NumericSetting, string> = {
  generationPerKwPerDay: 'generation_per_kw_per_day',
  areaPerKwSqft: 'area_per_kw_sqft',
  panelWp: 'default_panel_wp',
  cableBufferMultiplier: 'cable_buffer_multiplier',
  daysIn24Months: 'days_in_24_months',
  daysInMonth: 'days_in_month',
}

/** Admin settings from GET /surveys/settings. Missing, non-numeric or non-positive values keep the default. */
const TARIFF_KEYS: Record<TariffCategory, string> = { 'LT-1': 'tariff_lt1', 'LT-2': 'tariff_lt2', 'LT-3': 'tariff_lt3', 'HT': 'tariff_ht' }

export function settingsFromApi(raw: Record<string, string> | null | undefined): CalculationSettings {
  const num = (key: string) => { const v = Number(raw?.[key]); return Number.isFinite(v) && v > 0 ? v : null }
  const out: CalculationSettings = { ...DEFAULT_SETTINGS, tariffs: { ...DEFAULT_SETTINGS.tariffs } }
  for (const k of Object.keys(API_KEYS) as NumericSetting[]) out[k] = num(API_KEYS[k]) ?? out[k]
  for (const t of Object.keys(TARIFF_KEYS) as TariffCategory[]) out.tariffs[t] = num(TARIFF_KEYS[t]) ?? out.tariffs[t]
  return out
}

/** ₹ per unit for the chosen tariff category (admin setting), LT-2 when none is chosen. */
export function tariffRate(category: TariffCategory | null | undefined, settings: CalculationSettings = DEFAULT_SETTINGS): number {
  return (category && settings.tariffs?.[category]) || settings.tariffs?.['LT-2'] || 7.0
}

/** Sunny (shadow-free) hours from the three time bands, or null when the engineer has not marked any band. */
export function shadowFreeSunHours(sec4?: SurveySection4 | null): number | null {
  if (!sec4?.sunExposure8to10 && !sec4?.sunExposure10to2 && !sec4?.sunExposure2to5) return null
  return (sec4.sunExposure8to10 ? 2 : 0) + (sec4.sunExposure10to2 ? 4 : 0) + (sec4.sunExposure2to5 ? 3 : 0)
}

export function calculateSurvey(
  sec2: SurveySection2,
  sec3: SurveySection3,
  sec4: SurveySection4,
  sec5: SurveySection5,
  overrides?: SurveyOverrides | null,
  settings: CalculationSettings = DEFAULT_SETTINGS
): SurveyCalculations {
  const c: CalculationSettings = { ...DEFAULT_SETTINGS, tariffs: { ...DEFAULT_SETTINGS.tariffs, ...settings?.tariffs } }
  for (const k of Object.keys(API_KEYS) as NumericSetting[]) if (settings?.[k] > 0) c[k] = settings[k]   // invalid values keep the default
  const tariff = tariffRate(sec2?.tariffCategory, c)

  // 1. Consumption: 24-month units ÷ 730, then ÷ generation per kW per day
  const units24 = Math.max(0, sec2?.history24MonthsUnits ?? 0)
  const avgDailyUnits = units24 > 0 ? round2(units24 / c.daysIn24Months) : 0
  const capacityByConsumptionKw = avgDailyUnits > 0 ? round2(avgDailyUnits / c.generationPerKwPerDay) : 0

  // 2. Roof: length × width (else the available area) − obstructions, then ÷ area per kW
  let grossArea = 0
  if ((sec3?.roofLengthFt ?? 0) > 0 && (sec3?.roofWidthFt ?? 0) > 0) grossArea = round2(sec3.roofLengthFt! * sec3.roofWidthFt!)
  else if ((sec3?.availableAreaSqft ?? 0) > 0) grossArea = round2(sec3.availableAreaSqft!)
  const roofDataProvided = (sec3?.roofLengthFt != null && sec3?.roofWidthFt != null) || sec3?.availableAreaSqft != null
  const obstructions = round2((sec3?.obstructionAreas ?? []).reduce((sum, o) => sum + (o.areaSqft > 0 ? o.areaSqft : 0), 0))
  const netFreeAreaSqft = Math.max(0, round2(grossArea - obstructions))
  const capacityByRoofKw = netFreeAreaSqft > 0 ? round2(netFreeAreaSqft / c.areaPerKwSqft) : 0

  // 3. Recommended size: the lower of the two capacities (an engineer's override, with a reason, replaces it)
  let recommendedSystemSizeKw =
    roofDataProvided && capacityByConsumptionKw > 0 ? Math.min(capacityByConsumptionKw, capacityByRoofKw)
      : roofDataProvided ? capacityByRoofKw
        : capacityByConsumptionKw
  if (overrides?.capacityKw != null && overrides.capacityKw > 0) recommendedSystemSizeKw = round2(overrides.capacityKw)

  // 4. Panels, rounded up
  let numberOfPanels = recommendedSystemSizeKw > 0 ? Math.ceil((recommendedSystemSizeKw * 1000) / c.panelWp) : 0
  if (overrides?.numberOfPanels != null && overrides.numberOfPanels > 0) numberOfPanels = overrides.numberOfPanels

  // 5. Generation and savings
  const unitsGeneratedPerMonth = recommendedSystemSizeKw > 0 ? round2(recommendedSystemSizeKw * c.generationPerKwPerDay * c.daysInMonth) : 0
  const monthlySavingsRs = round2(unitsGeneratedPerMonth * tariff)
  const annualSavingsRs = round2(monthlySavingsRs * 12)

  // 6. Cable: sum of route lengths × buffer
  const routes = (sec5?.cableRoutes ?? []).reduce((sum, r) => sum + (r.lengthM > 0 ? r.lengthM : 0), 0)
  const totalCableLengthM = round2(routes * c.cableBufferMultiplier)

  // 7. Flags and the suggested verdict
  const isRoofShortfall = roofDataProvided && capacityByConsumptionKw > 0 && capacityByRoofKw < capacityByConsumptionKw
  const sunHours = shadowFreeSunHours(sec4)
  const isShadowRisk = (sec4?.shadowAreaPercent ?? 0) > 30 || (sunHours != null && sunHours < 6)
  let suggestedVerdict: SurveyVerdict = 'FEASIBLE'
  if (recommendedSystemSizeKw <= 0 || (roofDataProvided && capacityByRoofKw <= 0)) suggestedVerdict = 'NOT_FEASIBLE'
  else if (isShadowRisk || isRoofShortfall) suggestedVerdict = 'CONDITIONAL'

  return {
    avgDailyUnits,
    capacityByConsumptionKw,
    netFreeAreaSqft,
    capacityByRoofKw,
    recommendedSystemSizeKw,
    numberOfPanels,
    areaRequiredSqft: round2(recommendedSystemSizeKw * c.areaPerKwSqft),
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
