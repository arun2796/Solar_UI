import { z } from 'zod'
import { FIELD_LABELS, SECTIONS, addDays, isValidIso, todayIso, type ReportFields } from '../lib/types'

// Mirrors the server rules (backend Validators.cs) so invalid drafts are caught on the phone, not by a 400.
export const LIMITS = { maxNumber: 1_000_000_000, maxTechnicians: 50, maxText: 2000, maxName: 200, minDate: '2000-01-01', futureDays: 30, nextVisitYears: 3 }

const yn = z.enum(['YES', 'NO'])
const gd = z.enum(['GOOD', 'DEFECT'])
const num = z.number().min(0).max(LIMITS.maxNumber).refine(v => Number(v.toFixed(2)) === v, 'At most 2 decimal places')
const text = z.string().max(LIMITS.maxText).nullable().optional()

/** Per-section "complete" schemas: every enumerated / numeric field required. */
export const sectionSchemas: Record<number, z.ZodTypeAny> = {
  1: z.object({ s1ModuleCleaning: yn, s1BrokenModule: yn, s1MountingStructure: gd, s1NutBoltTightness: gd, s1PhotosBeforeAfter: yn, s1Remarks: text }),
  2: z.object({ s2DcCables: gd, s2Mc4Connectors: gd, s2DcJunctionBox: gd, s2StringVoltage: gd, s2CableInsulation: gd, s2Remarks: text }),
  3: z.object({ s3InverterWorking: gd, s3CoolingFans: gd, s3AcOutputVoltage: gd, s3OtherIssues: gd, s3Remarks: text }),
  4: z.object({ s4AcCablesConnections: gd, s4AcDistributionBoard: gd, s4McbMccb: gd, s4Remarks: text }),
  5: z.object({ s5EquipmentEarthing: gd, s5LightningArrester: gd, s5SurgeProtection: gd, s5EarthingPit: gd, s5Remarks: text }),
  6: z.object({ s6TotalGenerationKwh: num, s6AvgDailyGenerationKwh: num, s6ExpectedGenerationKwh: num, s6PerformanceStatus: gd, s6Remarks: text }),
  7: z.object({ s7ImportUnits: num, s7ExportUnits: num, s7NetMeterCondition: gd, s7Remarks: text }),
  8: z.object({ s8GeneralObservations: text, s8ActionRequired: text, nextVisitDate: z.string().refine(isValidIso) }),
}

/**
 * Problems that make the server reject the draft even as a draft (dates, ranges, lengths).
 * Empty answers are fine for a draft; they are required only at submission (missingItems).
 */
export function draftProblems(f: ReportFields): string[] {
  const out: string[] = []
  const maxVisit = addDays(todayIso(), LIMITS.futureDays)
  if (!isValidIso(f.visitDate)) out.push('Visit date is not a valid date')
  else if (f.visitDate < LIMITS.minDate || f.visitDate > maxVisit) out.push('Visit date must be between 2000 and 30 days from today')
  if (f.previousMaintenanceDate && !isValidIso(f.previousMaintenanceDate)) out.push('Previous maintenance date is not a valid date')
  if (f.nextVisitDate) {
    if (!isValidIso(f.nextVisitDate)) out.push('Next visit date is not a valid date')
    else if (isValidIso(f.visitDate) && f.nextVisitDate <= f.visitDate) out.push('Next visit date must be after the visit date')
    else if (isValidIso(f.visitDate) && f.nextVisitDate > addDays(f.visitDate, 365 * LIMITS.nextVisitYears)) out.push('Next visit date is more than 3 years after the visit')
  }
  if (f.technicianCount != null && (!Number.isInteger(f.technicianCount) || f.technicianCount < 1 || f.technicianCount > LIMITS.maxTechnicians)) {
    out.push(`Number of technicians must be a whole number between 1 and ${LIMITS.maxTechnicians}`)
  }
  for (const s of SECTIONS) for (const r of s.rows) {
    const v = f[r.key]
    if (r.type === 'num' && v != null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > LIMITS.maxNumber || Number(v.toFixed(2)) !== v)) {
      out.push(`${FIELD_LABELS[r.key]} must be between 0 and 1,000,000,000 with at most 2 decimal places`)
    }
  }
  for (const [k, v] of Object.entries(f)) if (typeof v === 'string' && v.length > (k === 'clientRepName' ? LIMITS.maxName : LIMITS.maxText)) out.push(`${FIELD_LABELS[k] ?? k} is too long`)
  return out
}

export function headerComplete(f: ReportFields): boolean {
  return isValidIso(f.visitDate) && f.technicianCount != null && Number.isInteger(f.technicianCount) && f.technicianCount >= 1
}

export function sectionComplete(n: number, f: ReportFields): boolean {
  if (n === 1 && !headerComplete(f)) return false
  if (n === 8 && !(f.s8GeneralObservations?.trim() || f.s8ActionRequired?.trim())) return false   // next visit is pre-filled, so it alone does not mean "done"
  return sectionSchemas[n].safeParse(f).success
}

export type MissingIssue = {
  section: number | 'signatures'
  sectionTitle: string
  fieldKey: string
  fieldLabel: string
  message: string
  path: string
}

/** Returns every missing or invalid field categorized by section. */
export function getMissingReportIssues(f: ReportFields, sigs: { engineer: boolean; client: boolean }, localId: string): MissingIssue[] {
  const issues: MissingIssue[] = []

  // Visit details
  if (!isValidIso(f.visitDate)) {
    issues.push({
      section: 1,
      sectionTitle: 'Visit details',
      fieldKey: 'visitDate',
      fieldLabel: 'Visit date',
      message: 'Visit details: Visit date is required',
      path: `/(app)/reports/${localId}/section/1`,
    })
  } else if (f.visitDate < LIMITS.minDate || f.visitDate > addDays(todayIso(), LIMITS.futureDays)) {
    issues.push({
      section: 1,
      sectionTitle: 'Visit details',
      fieldKey: 'visitDate',
      fieldLabel: 'Visit date',
      message: 'Visit details: Visit date must be between 2000 and 30 days from today',
      path: `/(app)/reports/${localId}/section/1`,
    })
  }

  if (f.technicianCount == null || !Number.isInteger(f.technicianCount) || f.technicianCount < 1 || f.technicianCount > LIMITS.maxTechnicians) {
    issues.push({
      section: 1,
      sectionTitle: 'Visit details',
      fieldKey: 'technicianCount',
      fieldLabel: 'Number of technicians',
      message: 'Visit details: At least 1 technician required (1–50)',
      path: `/(app)/reports/${localId}/section/1`,
    })
  }

  // Sections 1–7
  for (const s of SECTIONS) {
    for (const r of s.rows) {
      const v = f[r.key]
      if (v === null || v === undefined || v === '') {
        const actionWord = r.type === 'num' ? 'not entered' : 'not selected'
        issues.push({
          section: s.n,
          sectionTitle: `Section ${s.n} ${s.title}`,
          fieldKey: r.key,
          fieldLabel: r.label,
          message: `Section ${s.n} ${s.title}: ${r.label} ${actionWord}`,
          path: `/(app)/reports/${localId}/section/${s.n}`,
        })
      } else if (r.type === 'num' && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > LIMITS.maxNumber || Number(v.toFixed(2)) !== v)) {
        issues.push({
          section: s.n,
          sectionTitle: `Section ${s.n} ${s.title}`,
          fieldKey: r.key,
          fieldLabel: r.label,
          message: `Section ${s.n} ${s.title}: ${r.label} must be a number 0–1,000,000,000 (max 2 decimals)`,
          path: `/(app)/reports/${localId}/section/${s.n}`,
        })
      }
    }
  }

  // Section 8
  if (!f.nextVisitDate) {
    issues.push({
      section: 8,
      sectionTitle: 'Section 8 Observations and Issues',
      fieldKey: 'nextVisitDate',
      fieldLabel: 'Next visit date',
      message: 'Section 8 Observations: Next visit date is required',
      path: `/(app)/reports/${localId}/section/8`,
    })
  } else if (!isValidIso(f.nextVisitDate)) {
    issues.push({
      section: 8,
      sectionTitle: 'Section 8 Observations and Issues',
      fieldKey: 'nextVisitDate',
      fieldLabel: 'Next visit date',
      message: 'Section 8 Observations: Next visit date is not a valid date',
      path: `/(app)/reports/${localId}/section/8`,
    })
  } else if (isValidIso(f.visitDate) && f.nextVisitDate <= f.visitDate) {
    issues.push({
      section: 8,
      sectionTitle: 'Section 8 Observations and Issues',
      fieldKey: 'nextVisitDate',
      fieldLabel: 'Next visit date',
      message: 'Section 8 Observations: Next visit date must be after the visit date',
      path: `/(app)/reports/${localId}/section/8`,
    })
  }

  // Signatures
  if (!sigs.engineer) {
    issues.push({
      section: 'signatures',
      sectionTitle: 'Signatures',
      fieldKey: 'engineerSignature',
      fieldLabel: 'Engineer signature',
      message: 'Signatures: Engineer signature missing',
      path: `/(app)/reports/${localId}/signatures`,
    })
  }

  if (!f.clientRepName?.trim()) {
    issues.push({
      section: 'signatures',
      sectionTitle: 'Signatures',
      fieldKey: 'clientRepName',
      fieldLabel: 'Client representative name',
      message: 'Signatures: Client representative name missing',
      path: `/(app)/reports/${localId}/signatures`,
    })
  }

  if (!sigs.client) {
    issues.push({
      section: 'signatures',
      sectionTitle: 'Signatures',
      fieldKey: 'clientSignature',
      fieldLabel: 'Client representative signature',
      message: 'Signatures: Client signature missing',
      path: `/(app)/reports/${localId}/signatures`,
    })
  }

  return issues
}

/** Everything required before Submit Final, in human terms. */
export function missingItems(f: ReportFields, sigs: { engineer: boolean; client: boolean }): string[] {
  return getMissingReportIssues(f, sigs, '').map(i => i.message)
}
