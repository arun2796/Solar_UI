import { api, errorMessage, isNetworkError, statusOf } from '../lib/api'
import { authStore, currentUserId, hasPermission } from '../lib/auth'
import { PERM } from '../lib/types'
import { surveyDrafts, surveysCache } from '../db'
import { syncStore } from '../lib/store'
import { shadowFreeSunHours, tariffRate } from '../lib/surveyCalculator'
import { currentSurveySettings, refreshSurveySettings } from '../lib/surveySettings'
import type { SurveyDraft, SurveyOverrides, SurveySections } from '../lib/surveyTypes'

let running = false
let queued = false
let timer: ReturnType<typeof setTimeout> | null = null

export function scheduleSurveySync(ms = 1500) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void runSurveySync()
  }, Math.max(0, ms))
}

export function sectionsToBackendData(sections: SurveySections) {
  const s0 = sections?.section0
  const s1 = sections?.section1
  const s2 = sections?.section2
  const s3 = sections?.section3
  const s4 = sections?.section4
  const s5 = sections?.section5
  const s6 = sections?.section6
  const s7 = sections?.section7
  const s8 = sections?.section8
  const s9 = sections?.section9

  const tariff = tariffRate(s2?.tariffCategory, currentSurveySettings(), s2?.tariffRateRs)   // the bill's rate, else the admin's rate for the category

  const sunHours = shadowFreeSunHours(s4)           // null = not entered (no shadow flag from it)
  const entered = [s4?.sunHours8to10, s4?.sunHours10to2, s4?.sunHours2to5].some(h => h != null)
  const band = (hours: number | null | undefined, yes: boolean | undefined, full: number) =>
    sunHours == null ? null : entered ? Math.max(0, hours ?? 0) : yes ? full : 0
  const sun8to10 = band(s4?.sunHours8to10, s4?.sunExposure8to10, 2)
  const sun10to2 = band(s4?.sunHours10to2, s4?.sunExposure10to2, 4)
  const sun2to5 = band(s4?.sunHours2to5, s4?.sunExposure2to5, 3)

  return {
    section0: {
      clientId: s0?.clientId ?? null,
      customerName: s0?.customerName ?? '',
      siteAddress: s0?.siteAddress ?? '',
      dateOfVisit: s0?.visitDate ?? new Date().toISOString().slice(0, 10),
      gpsLatitude: s0?.gpsLat ?? null,
      gpsLongitude: s0?.gpsLng ?? null,
      gpsAccuracy: 10,
      siteType: s0?.siteType ?? 'commercial',
    },
    section1: {
      contactPerson: s1?.contactPerson ?? null,
      phone: s1?.contactPhone ?? null,
      email: s1?.contactEmail ?? null,
      customerType: s1?.customerType ?? 'Commercial',
      designation: s1?.designation ?? null,
      numberOfUnitsOrFlats: s1?.numberOfUnits ?? null,
      numberOfTowers: s1?.numberOfTowers ?? null,
    },
    section2: {
      ebServiceNumbers: s2?.ebServiceNumbers?.filter(Boolean) ?? [],
      sanctionedLoadKw: s2?.sanctionedLoadKw ?? null,
      contractDemandKva: s2?.contractDemandKva ?? null,
      phaseType: s2?.phaseType === '1-phase' ? 'Single' : 'Three',
      monthlyBillRs: s2?.monthlyBillRs ?? null,
      tariffCategory: s2?.tariffCategory ?? 'LT-2',
      tariffRateRsPerUnit: tariff,
      netMeteringAvailable: s2?.netMetering ? 'YES' : 'NO',
      units24Months: s2?.history24MonthsUnits ?? null,
      amountPaid24Months: s2?.history24MonthsAmount ?? null,
    },
    section3: {
      installationType: s3?.installationType ?? 'RCC',
      availableAreaSqft: s3?.availableAreaSqft ?? null,
      roofCondition: s3?.roofCondition ?? 'Good',
      orientation: s3?.orientation ?? 'South',
      tilt: s3?.tiltType ?? 'Flat',
      tiltAngleDeg: s3?.tiltAngleDeg ?? null,
      lengthFt: s3?.roofLengthFt ?? null,
      widthFt: s3?.roofWidthFt ?? null,
      obstructionsDescription: s3?.hasObstructions ? s3?.obstructionsDescription?.trim() || 'Obstructions recorded' : 'None',
      obstructionAreasSqft: s3?.obstructionAreas?.map(o => o.areaSqft).filter(a => a > 0) ?? [],
      waterproofingStatus: s3?.waterproofingStatus || null,
      materialAccess: s3?.materialAccess?.toLowerCase() ?? 'stairs',
    },
    section4: {
      shadowSources: s4?.shadowSources ?? 'None',
      shadowObserved: s4?.shadowObserved ? 'YES' : 'NO',
      timeOfObservation: s4?.timeOfObservation ?? '12:00 PM',
      shadowAreaPercent: s4?.shadowAreaPercent ?? 0,
      sunExposure8To10AmHours: sun8to10,
      sunExposure10AmTo2PmHours: sun10to2,
      sunExposure2To5PmHours: sun2to5,
      totalShadowFreeSunHours: sunHours,
    },
    section5: {
      mdbLocation: s5?.mdbLocation ?? null,
      roofToInverterDistanceM: s5?.roofToInverterDistanceM ?? null,
      inverterSpaceAvailable: s5?.inverterSpace ?? null,
      earthingPointsAvailable: s5?.earthingPoints != null ? `${s5.earthingPoints} points` : null,
      wifiAvailable: s5?.wifiAvailable ? 'YES' : 'NO',
      ebMeterLocation: s5?.ebMeterLocation ?? null,
      acdbLocation: s5?.acdbLocation ?? null,
      cableRouteLengthsM: s5?.cableRoutes?.map(c => c.lengthM).filter(l => l > 0) ?? [],
      earthPitLocation: s5?.earthPitLocation ?? null,
    },
    section6: {
      feasibilityRecommendedCapacityKw: s6?.recommendedCapacityKw ?? null,
      mountingStructureType: s6?.mountingStructure ?? null,
      cableRouteFeasible: s6?.cableRouteFeasible ? 'YES' : 'NO',
      structuralReinforcementNeeded: s6?.structuralReinforcement ? 'YES' : 'NO',
      safetyAndAccessConstraints: s6?.safetyConstraints ?? null,
    },
    section7: {
      hasEbBillPhoto: !!s7?.checklist?.ebBill,
      hasIdProofPhoto: !!s7?.checklist?.idProof,
      hasRoofPhotos: !!s7?.checklist?.roofPhotos,
      hasPanelPhoto: !!s7?.checklist?.panelPhoto,
    },
    section8: {
      generalObservations: s8?.observations ?? null,
      specialRequirements: s8?.specialRequirements ?? null,
      risks: s8?.risks ?? null,
      customerRepName: s8?.customerRepName?.trim() || s1?.contactPerson || null,
    },
    section9: {
      verdict: s9?.verdict || null,                 // never invent a verdict: Submit requires the engineer's choice
      systemSizeKw: s9?.systemSizeKw ?? null,
      numberOfPanels: s9?.numberOfPanels ?? null,
      areaRequiredSqft: s9?.areaRequiredSqft ?? null,
      panelWp: s9?.panelWp ?? 550,
      unitsPerMonth: s9?.monthlyGenerationUnits ?? null,
      tariffRate: tariff,
      monthlySavingsRs: s9?.monthlySavingsRs ?? null,
      annualSavingsRs: s9?.annualSavingsRs ?? null,
      recommendationNote: s9?.recommendationNote ?? null,
      conditions: s9?.conditions ?? null,
    },
  }
}

export function overridesToBackendDto(overrides?: SurveyOverrides | null) {
  if (!overrides) return null
  return {
    overrideSystemSizeKw: overrides.capacityKw ?? null,
    overrideNumberOfPanels: overrides.numberOfPanels ?? null,
    overrideMonthlySavingsRs: null,
    overrideReason: overrides.overrideReason ?? null,
  }
}

export async function runSurveySync(): Promise<void> {
  if (running) {
    queued = true
    return
  }
  const owner = currentUserId()
  if (!owner) return
  if (!hasPermission(authStore.get().user, PERM.surveysWork)) return   // site surveys are not switched on for this account

  running = true
  try {
    do {
      queued = false
      const list = await surveyDrafts.all(owner)
      for (const d of list) {
        if (d.syncState === 'submitted' || d.syncState === 'conflict') continue   // a conflict waits for the engineer's choice
        await syncOneSurvey(d)
      }

      await refreshSurveySettings()                // the admin may have changed the calculation constants
      // Also pull latest server surveys for local cache
      try {
        const paged = await api.surveys.list({ pageSize: 50 })
        if (paged?.items) {
          await surveysCache.put(paged.items)
        }
      } catch {
        // offline
      }
    } while (queued)
    // Work still queued (e.g. the network was not fully up right after reconnecting): try again shortly by itself,
    // instead of waiting for the next app event or a manual Sync.
    const left = await surveyDrafts.all(owner)
    if (left.some(d => d.syncState === 'submitting' || (d.syncState === 'local' && d.dirty === 1))) scheduleSurveySync(15_000)
  } finally {
    running = false
    // Screens reload on the sync tick: a survey submitted offline then shows as sent (SV number, PDF and sharing).
    syncStore.set(s => ({ tick: s.tick + 1 }))
  }
}

/** After a conflict: the engineer chose to replace the office's changes with the copy on this phone. */
export async function keepMyVersion(localId: string) {
  await surveyDrafts.patch(localId, { syncState: 'local', forceOverwrite: 1, lastError: null })
  scheduleSurveySync(0)
}

const CONFLICT_MESSAGE = 'Changed in the office after your last sync. Your copy is kept on this phone. Ask the office, or tap "Send my version" to replace their changes.'

/** null and undefined are the same; numbers compare by value. Used to recognise our own earlier write on the server. */
function sameData(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameData(x, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
    return [...keys].every(k => sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return a === b
}

/**
 * Runs a versioned write. On 409 the server copy is compared with what we are sending: identical means our own earlier
 * write whose reply was lost (retry with the new version); different means the office changed it (conflict), unless the
 * engineer already chose "Send my version".
 */
async function versioned<T>(d: SurveyDraft, serverId: string, version: number, data: unknown, write: (v: number) => Promise<T>): Promise<T | 'conflict'> {
  try {
    return await write(version)
  } catch (err) {
    if (statusOf(err) !== 409) throw err
    const remote = await api.surveys.get(serverId)
    if (d.forceOverwrite === 1 || sameData(remote?.data, data)) return await write(remote?.version > 0 ? remote.version : 1)
    await surveyDrafts.patch(d.localId, { syncState: 'conflict', submitRequested: 0, lastError: CONFLICT_MESSAGE })
    return 'conflict'
  }
}

async function syncOneSurvey(d: SurveyDraft) {
  try {
    let serverId = d.serverId
    let version = d.version

    // 1. Create on server if not yet created (idempotent on the device's localId)
    if (!serverId) {
      await surveyDrafts.patch(d.localId, { syncState: 'syncing' })
      const s0 = d.sections?.section0
      const createRes = await api.surveys.create({
        clientLocalId: d.localId,
        clientId: s0?.clientId ?? null,
        customerName: s0?.customerName || d.customerName || 'Untitled Survey',
        siteAddress: s0?.siteAddress || d.siteAddress || '',
        siteType: s0?.siteType || 'commercial',
        dateOfVisit: s0?.visitDate || new Date().toISOString().slice(0, 10),
        gpsLatitude: s0?.gpsLat ?? null,
        gpsLongitude: s0?.gpsLng ?? null,
      })
      serverId = createRes.survey.id as string
      version = createRes.survey.version
      await surveyDrafts.patch(d.localId, { serverId, version, surveyNumber: createRes.survey.surveyRef, syncState: 'local' })
    }
    if (!version || version < 1) {
      const remote = await api.surveys.get(serverId)
      version = remote?.version > 0 ? remote.version : 1
      await surveyDrafts.patch(d.localId, { version })
    }

    // 2. Fields. editSeq is read before sending: edits typed during the upload keep the draft dirty.
    if (d.dirty === 1 && d.submitRequested !== 1) {
      await surveyDrafts.patch(d.localId, { syncState: 'syncing' })
      const editSeq = d.editSeq
      const data = sectionsToBackendData(d.sections)
      const res = await versioned(d, serverId, version, data, v => api.surveys.update(serverId!, v, data, overridesToBackendDto(d.overrides)))
      if (res === 'conflict') return
      version = res.version
      await surveyDrafts.ackFields(d.localId, editSeq, version)
    }

    // 3. Signatures
    for (const kind of ['engineer', 'customer'] as const) {
      const pending = kind === 'engineer' ? d.engineerSigPending : d.customerSigPending
      const uri = kind === 'engineer' ? d.engineerSigUri : d.customerSigUri
      if (pending === 1 && uri) {
        await api.surveys.signature(serverId, kind, uri)
        await surveyDrafts.patch(d.localId, kind === 'engineer' ? { engineerSigPending: 0 } : { customerSigPending: 0 })
      }
    }

    // 4. Photos: deletions first, then each new photo exactly once (its server id is remembered).
    for (const photoId of d.pendingPhotoDeletes ?? []) {
      try { await api.surveys.deletePhoto(serverId, photoId) } catch (err) { if (statusOf(err) !== 404) throw err }
      await surveyDrafts.ackPhotoDelete(d.localId, photoId)
    }
    for (const p of d.photos ?? []) {
      if (p.pending !== 1 || !p.localUri) continue
      const uploaded = await api.surveys.photo(serverId, {
        sectionNumber: mapSectionToNumber(p.section),
        tag: p.section,
        caption: p.caption,
        latitude: p.latitude,
        longitude: p.longitude,
        takenAt: p.capturedAt,
        fileUri: p.localUri,
      })
      await surveyDrafts.ackPhoto(d.localId, p.id, uploaded?.id ?? null)
    }

    // 5. Submit, only after every photo and signature is on the server (any failure above skips this and is retried).
    if (d.submitRequested === 1) {
      await surveyDrafts.patch(d.localId, { syncState: 'submitting' })
      const editSeq = d.editSeq
      const data = sectionsToBackendData(d.sections)
      try {
        const submitted = await versioned(d, serverId, version, data, v => api.surveys.submit(serverId!, v, data, overridesToBackendDto(d.overrides)))
        if (submitted === 'conflict') return
        await surveyDrafts.ackFields(d.localId, editSeq, submitted.version)
        await surveyDrafts.patch(d.localId, { syncState: 'submitted', submitRequested: 0, surveyNumber: submitted.surveyRef, lastError: null })
      } catch (err) {
        // The server refused the survey as it is (missing verdict, signature, invalid value): back to a draft the engineer can fix.
        if (statusOf(err) === 400 || statusOf(err) === 422) {
          await surveyDrafts.patch(d.localId, { syncState: 'local', submitRequested: 0, lastError: `Not submitted: ${errorMessage(err)}` })
          return
        }
        throw err
      }
    } else if (d.dirty !== 1) {
      await surveyDrafts.patch(d.localId, { syncState: 'synced', lastError: null })
    }
  } catch (err) {
    // Offline or server unreachable: keep the work and try again later. Anything else needs the engineer's attention.
    await surveyDrafts.patch(d.localId, {
      syncState: isNetworkError(err) ? (d.submitRequested === 1 ? 'submitting' : 'local') : 'failed',
      lastError: isNetworkError(err) ? null : errorMessage(err),
    })
  }
}

function mapSectionToNumber(section: string): number {
  switch (section) {
    case 'eb_bill':
      return 2
    case 'roof':
      return 3
    case 'shadow':
      return 4
    case 'panel_mdb':
    case 'eb_meter':
      return 5
    case 'id_proof':
      return 7
    default:
      return 3
  }
}

export const surveySyncEngine = {
  syncNow: runSurveySync,
  schedule: scheduleSurveySync,
}
