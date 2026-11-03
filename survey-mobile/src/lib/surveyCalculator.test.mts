// Section 9 must match a hand calculation (brief, acceptance). The same three sites are tested in the API
// (SolarMaintenance.Api.Tests/Unit/SurveyCalculatorTests.cs), so the phone, the server and the PDF agree.
// Run: npm test   (Node's built-in test runner; no extra packages)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateSurvey, DEFAULT_SETTINGS, settingsFromApi } from './surveyCalculator.ts'

const sun = (a: boolean, b: boolean, c: boolean) => ({ sunExposure8to10: a, sunExposure10to2: b, sunExposure2to5: c })

test('site A: consumption decides, roof has room, feasible', () => {
  const r = calculateSurvey(
    { history24MonthsUnits: 87_600, tariffCategory: 'LT-2' } as never,
    { roofLengthFt: 60, roofWidthFt: 40, availableAreaSqft: 9_999, obstructionAreas: [{ areaSqft: 200 }, { areaSqft: 100 }] } as never,
    { shadowAreaPercent: 5, ...sun(true, true, true) } as never,
    { cableRoutes: [{ lengthM: 20 }, { lengthM: 15 }] } as never,
  )
  assert.equal(r.avgDailyUnits, 120)               // 87,600 ÷ 730
  assert.equal(r.capacityByConsumptionKw, 30)      // 120 ÷ 4
  assert.equal(r.netFreeAreaSqft, 2_100)           // 60 × 40 − 300 (length × width wins over available area)
  assert.equal(r.capacityByRoofKw, 42)             // 2,100 ÷ 50
  assert.equal(r.recommendedSystemSizeKw, 30)
  assert.equal(r.numberOfPanels, 55)               // ⌈30,000 ÷ 550⌉
  assert.equal(r.areaRequiredSqft, 1_500)          // 30 × 50
  assert.equal(r.unitsGeneratedPerMonth, 3_600)    // 30 × 4 × 30
  assert.equal(r.monthlySavingsRs, 25_200)         // × ₹7
  assert.equal(r.annualSavingsRs, 302_400)
  assert.equal(r.totalCableLengthM, 42)            // 35 × 1.2
  assert.equal(r.isRoofShortfall, false)
  assert.equal(r.isShadowRisk, false)
  assert.equal(r.suggestedVerdict, 'FEASIBLE')
})

test('site B: roof is smaller than the consumption needs, flagged and conditional', () => {
  const r = calculateSurvey(
    { history24MonthsUnits: 146_000, tariffCategory: 'LT-3' } as never,
    { availableAreaSqft: 1_500, obstructionAreas: [{ areaSqft: 250 }] } as never,
    { shadowAreaPercent: 10 } as never,                                   // sun hours not entered: no shadow flag from them
    { cableRoutes: [{ lengthM: 30 }] } as never,
  )
  assert.equal(r.capacityByConsumptionKw, 50)
  assert.equal(r.capacityByRoofKw, 25)
  assert.equal(r.recommendedSystemSizeKw, 25)
  assert.equal(r.numberOfPanels, 46)
  assert.equal(r.monthlySavingsRs, 28_500)
  assert.equal(r.annualSavingsRs, 342_000)
  assert.equal(r.totalCableLengthM, 36)
  assert.equal(r.isRoofShortfall, true)
  assert.equal(r.isShadowRisk, false)
  assert.equal(r.suggestedVerdict, 'CONDITIONAL')
})

test('site C: shadow over 30% suggests conditional', () => {
  const r = calculateSurvey(
    { history24MonthsUnits: 21_900, tariffCategory: 'LT-1' } as never,
    { roofLengthFt: 30, roofWidthFt: 25, obstructionAreas: [] } as never,
    { shadowAreaPercent: 35, ...sun(true, true, true) } as never,
    { cableRoutes: [{ lengthM: 10 }, { lengthM: 5 }, { lengthM: 3 }] } as never,
  )
  assert.equal(r.capacityByConsumptionKw, 7.5)
  assert.equal(r.capacityByRoofKw, 15)
  assert.equal(r.recommendedSystemSizeKw, 7.5)
  assert.equal(r.numberOfPanels, 14)
  assert.equal(r.unitsGeneratedPerMonth, 900)
  assert.equal(r.monthlySavingsRs, 4_050)
  assert.equal(r.annualSavingsRs, 48_600)
  assert.equal(r.totalCableLengthM, 21.6)
  assert.equal(r.isShadowRisk, true)
  assert.equal(r.suggestedVerdict, 'CONDITIONAL')
})

test('fewer than 6 sunny hours is a shadow risk; nothing entered is not', () => {
  const base = [{ history24MonthsUnits: 21_900, tariffCategory: 'LT-1' }, { roofLengthFt: 30, roofWidthFt: 25 }] as never[]
  assert.equal(calculateSurvey(base[0], base[1], { ...sun(true, false, false) } as never, {} as never).isShadowRisk, true)    // 2 h
  assert.equal(calculateSurvey(base[0], base[1], {} as never, {} as never).isShadowRisk, false)
})

test('an override replaces the size and everything that follows from it', () => {
  const sec = [{ history24MonthsUnits: 87_600, tariffCategory: 'LT-2' }, { roofLengthFt: 60, roofWidthFt: 40 }, {}, {}] as never[]
  const r = calculateSurvey(sec[0], sec[1], sec[2], sec[3], { capacityKw: 25, numberOfPanels: null, overrideReason: 'Client budget' })
  assert.equal(r.recommendedSystemSizeKw, 25)
  assert.equal(r.numberOfPanels, 46)
  assert.equal(r.unitsGeneratedPerMonth, 3_000)
  assert.equal(r.monthlySavingsRs, 21_000)
  const p = calculateSurvey(sec[0], sec[1], sec[2], sec[3], { capacityKw: 25, numberOfPanels: 50, overrideReason: 'Client budget' })
  assert.equal(p.numberOfPanels, 50)
})

test('constants come from the admin settings (API key names)', () => {
  const s = settingsFromApi({ generation_per_kw_per_day: '5', area_per_kw_sqft: '80', default_panel_wp: '600', cable_buffer_multiplier: '1.5', days_in_24_months: '730', days_in_month: '30', tariff_lt2: '8', junk: 'x' })
  assert.deepEqual(s, { generationPerKwPerDay: 5, areaPerKwSqft: 80, panelWp: 600, cableBufferMultiplier: 1.5, daysIn24Months: 730, daysInMonth: 30,
    tariffs: { 'LT-1': 4.5, 'LT-2': 8, 'LT-3': 9.5, 'HT': 8 } })
  assert.deepEqual(settingsFromApi({ area_per_kw_sqft: 'abc', default_panel_wp: '-3' }), DEFAULT_SETTINGS)   // bad values keep the defaults
  const r = calculateSurvey({ history24MonthsUnits: 87_600, tariffCategory: 'LT-2' } as never, { roofLengthFt: 60, roofWidthFt: 40 } as never, {} as never, {} as never, null, s)
  assert.equal(r.capacityByConsumptionKw, 24)     // 120 ÷ 5
  assert.equal(r.capacityByRoofKw, 30)            // 2,400 ÷ 80
  assert.equal(r.monthlySavingsRs, 24 * 5 * 30 * 8) // the admin's LT-2 tariff (₹8)
})
