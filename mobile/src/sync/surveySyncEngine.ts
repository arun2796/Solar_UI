import { api, errorMessage, isNetworkError } from '../lib/api'
import { currentUserId } from '../lib/auth'
import { surveyDrafts, surveysCache } from '../db'
import { TARIFF_RATES } from '../lib/surveyCalculator'
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

  const tariffRate = s2?.tariffCategory ? TARIFF_RATES[s2.tariffCategory] || 7.0 : 7.0

  const sun8to10 = s4?.sunExposure8to10 ? 2 : 0
  const sun10to2 = s4?.sunExposure10to2 ? 4 : 0
  const sun2to5 = s4?.sunExposure2to5 ? 3 : 0

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
      tariffRateRsPerUnit: tariffRate,
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
      obstructionsDescription: s3?.hasObstructions ? 'Obstructions recorded' : 'None',
      obstructionAreasSqft: s3?.obstructionAreas?.map(o => o.areaSqft).filter(a => a > 0) ?? [],
      waterproofingStatus: s3?.waterproofingStatus ?? 'Good',
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
      totalShadowFreeSunHours: sun8to10 + sun10to2 + sun2to5,
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
      customerRepName: s1?.contactPerson ?? null,
    },
    section9: {
      verdict: s9?.verdict ?? 'FEASIBLE',
      systemSizeKw: s9?.systemSizeKw ?? null,
      numberOfPanels: s9?.numberOfPanels ?? null,
      areaRequiredSqft: s9?.areaRequiredSqft ?? null,
      panelWp: s9?.panelWp ?? 550,
      unitsPerMonth: s9?.monthlyGenerationUnits ?? null,
      tariffRate,
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

  running = true
  try {
    do {
      queued = false
      const list = await surveyDrafts.all(owner)
      for (const d of list) {
        if (d.syncState === 'submitted') continue
        await syncOneSurvey(d)
      }

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
  } finally {
    running = false
  }
}

async function syncOneSurvey(d: SurveyDraft) {
  try {
    let serverId = d.serverId
    let version = d.version

    // 1. Create on server if not yet created
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
      serverId = createRes.survey.id
      version = createRes.survey.version
      await surveyDrafts.patch(d.localId, {
        serverId,
        version,
        surveyNumber: createRes.survey.surveyRef,
        syncState: 'local',
      })
    }

    // 2. Upload updated draft fields if dirty
    if (serverId && d.dirty === 1) {
      await surveyDrafts.patch(d.localId, { syncState: 'syncing' })
      const dataDto = sectionsToBackendData(d.sections)
      const ovrDto = overridesToBackendDto(d.overrides)
      const updated = await api.surveys.update(serverId, version, dataDto, ovrDto)
      version = updated.version
      await surveyDrafts.patch(d.localId, {
        version,
        dirty: 0,
        syncState: 'synced',
        lastError: null,
      })
    }

    // 3. Upload engineer signature if pending
    if (serverId && d.engineerSigPending === 1 && d.engineerSigUri) {
      try {
        await api.surveys.signature(serverId, 'engineer', d.engineerSigUri)
        await surveyDrafts.patch(d.localId, { engineerSigPending: 0 })
      } catch (err) {
        if (!isNetworkError(err)) throw err
      }
    }

    // 4. Upload customer signature if pending
    if (serverId && d.customerSigPending === 1 && d.customerSigUri) {
      try {
        await api.surveys.signature(serverId, 'customer', d.customerSigUri)
        await surveyDrafts.patch(d.localId, { customerSigPending: 0 })
      } catch (err) {
        if (!isNetworkError(err)) throw err
      }
    }

    // 5. Upload pending photos
    if (serverId && d.photos && d.photos.length > 0) {
      for (const p of d.photos) {
        if (p.pending === 1 && p.localUri) {
          try {
            const sectionNum = mapSectionToNumber(p.section)
            await api.surveys.photo(serverId, {
              sectionNumber: sectionNum,
              tag: p.section,
              caption: p.caption,
              latitude: p.latitude,
              longitude: p.longitude,
              takenAt: p.capturedAt,
              fileUri: p.localUri,
            })
            // Mark photo pending = 0 in SQLite
            const updatedPhotos = d.photos.map((item: any) =>
              item.id === p.id ? { ...item, pending: 0 } : item
            )
            await surveyDrafts.saveSections(d.localId, d.sections, d.overrides, d.calculations)
            // Update photo list directly
            await surveyDrafts.patch(d.localId, { syncState: 'synced' })
          } catch (err) {
            if (!isNetworkError(err)) throw err
          }
        }
      }
    }

    // 6. Submit final if requested
    if (serverId && d.submitRequested === 1) {
      await surveyDrafts.patch(d.localId, { syncState: 'submitting' })
      const dataDto = sectionsToBackendData(d.sections)
      const ovrDto = overridesToBackendDto(d.overrides)
      const submitted = await api.surveys.submit(serverId, version, dataDto, ovrDto)
      await surveyDrafts.patch(d.localId, {
        version: submitted.version,
        syncState: 'submitted',
        submitRequested: 0,
        surveyNumber: submitted.surveyRef,
        lastError: null,
      })
    }
  } catch (err) {
    const msg = errorMessage(err)
    await surveyDrafts.patch(d.localId, {
      syncState: 'failed',
      lastError: msg,
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
