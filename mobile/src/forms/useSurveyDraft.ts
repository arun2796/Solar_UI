import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { surveyDrafts } from '../db'
import { calculateSurvey } from '../lib/surveyCalculator'
import { currentSurveySettings } from '../lib/surveySettings'
import type {
  SurveyCalculations,
  SurveyDraft,
  SurveyOverrides,
  SurveyPhotoLocal,
  SurveySections,
} from '../lib/surveyTypes'
import { registerActiveDraftFlusher, unregisterActiveDraftFlusher } from './useDraft'

export function useSurveyDraft(localId?: string | string[]) {
  const id = Array.isArray(localId) ? localId[0] : (localId || '')
  const resolvedLocalId = useRef<string>(id)
  const [draft, setDraft] = useState<SurveyDraft | null>(null)
  const [loading, setLoading] = useState(true)

  const pendingSections = useRef<SurveySections | null>(null)
  const pendingOverrides = useRef<SurveyOverrides | null>(null)
  const pendingCalcs = useRef<SurveyCalculations | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getActiveId = () => resolvedLocalId.current || id

  const flush = useCallback(async () => {
    const targetId = getActiveId()
    if (!targetId || targetId === 'new') return
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }

    if (pendingSections.current) {
      const sec = pendingSections.current
      const ovr = pendingOverrides.current
      const cal = pendingCalcs.current
      pendingSections.current = null
      await surveyDrafts.saveSections(targetId, sec, ovr, cal)
    }
  }, [id])

  const reload = useCallback(async () => {
    if (!id || id === 'new') {
      setDraft(null)
      setLoading(false)
      return
    }

    let d = await surveyDrafts.get(id)
    if (!d) {
      d = await surveyDrafts.findByServerId(id)
    }
    if (!d) {
      setDraft(null)
      setLoading(false)
      return
    }

    resolvedLocalId.current = d.localId

    if (pendingSections.current) {
      setDraft({
        ...d,
        sections: pendingSections.current,
        overrides: pendingOverrides.current ?? d.overrides,
        calculations: pendingCalcs.current ?? d.calculations,
      })
    } else {
      setDraft(d)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    if (id && id !== 'new') {
      setLoading(true)
      void reload()
    }
  }, [id, reload])

  useFocusEffect(
    useCallback(() => {
      void reload()
      return () => {
        void flush()
      }
    }, [reload, flush])
  )

  useEffect(() => () => {
    void flush()
  }, [flush])

  useEffect(() => {
    const s = AppState.addEventListener('change', st => {
      if (st !== 'active') void flush()
    })
    return () => s.remove()
  }, [flush])

  // Register with global idle logout flusher
  useEffect(() => {
    registerActiveDraftFlusher(flush)
    return () => unregisterActiveDraftFlusher(flush)
  }, [flush])

  // Periodic autosave every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingSections.current) {
        void flush()
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [flush])

  const locked = draft?.syncState === 'submitted' || draft?.syncState === 'submitting'

  const updateSurvey = useCallback(
    (
      newSections: SurveySections,
      newOverrides?: SurveyOverrides | null
    ) => {
      if (locked) return

      const ovr = newOverrides !== undefined ? newOverrides : (draft?.overrides ?? null)
      const calcs = calculateSurvey(
        newSections.section2,
        newSections.section3,
        newSections.section4,
        newSections.section5,
        ovr,
        currentSurveySettings()
      )

      // Also sync Section 9 auto-calculated values
      const mergedSections: SurveySections = {
        ...newSections,
        section9: {
          ...newSections.section9,
          systemSizeKw: calcs.recommendedSystemSizeKw,
          numberOfPanels: calcs.numberOfPanels,
          areaRequiredSqft: calcs.areaRequiredSqft,
          monthlyGenerationUnits: calcs.unitsGeneratedPerMonth,
          monthlySavingsRs: calcs.monthlySavingsRs,
          annualSavingsRs: calcs.annualSavingsRs,
        },
      }

      pendingSections.current = mergedSections
      pendingOverrides.current = ovr
      pendingCalcs.current = calcs

      setDraft(d => {
        if (!d) return null
        return {
          ...d,
          sections: mergedSections,
          overrides: ovr ?? d.overrides,
          calculations: calcs,
          dirty: 1,
        }
      })

      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        void flush()
      }, 1200)
    },
    [draft?.overrides, flush, locked]
  )

  const setSection = useCallback(
    <K extends keyof SurveySections>(sectionKey: K, patch: Partial<SurveySections[K]>) => {
      if (!draft) return
      const currentSections = pendingSections.current ?? draft.sections
      const updatedSection = { ...currentSections[sectionKey], ...patch }
      const newSections = { ...currentSections, [sectionKey]: updatedSection }
      updateSurvey(newSections)
    },
    [draft, updateSurvey]
  )

  const setOverrides = useCallback(
    (patch: Partial<SurveyOverrides>) => {
      if (!draft) return
      const currentOverrides = pendingOverrides.current ?? draft.overrides
      const newOverrides: SurveyOverrides = { ...currentOverrides, ...patch }
      const currentSections = pendingSections.current ?? draft.sections
      updateSurvey(currentSections, newOverrides)
    },
    [draft, updateSurvey]
  )

  const setSignature = useCallback(
    async (kind: 'engineer' | 'customer', uri: string): Promise<boolean> => {
      const targetId = getActiveId()
      if (!targetId || targetId === 'new') return false
      const ok = await surveyDrafts.setSignature(targetId, kind, uri)
      if (ok) {
        await reload()
      }
      return ok
    },
    [id, reload]
  )

  const addPhoto = useCallback(
    async (photo: SurveyPhotoLocal) => {
      const targetId = getActiveId()
      if (!targetId || targetId === 'new') return
      await surveyDrafts.addPhoto(targetId, photo)
      await reload()
    },
    [id, reload]
  )

  const removePhoto = useCallback(
    async (photoId: string) => {
      const targetId = getActiveId()
      if (!targetId || targetId === 'new') return
      await surveyDrafts.removePhoto(targetId, photoId)
      await reload()
    },
    [id, reload]
  )

  return {
    draft,
    loading,
    locked,
    sections: draft?.sections,
    overrides: draft?.overrides,
    calculations: draft?.calculations,
    photos: draft?.photos ?? [],
    setSection,
    setOverrides,
    setSignature,
    addPhoto,
    removePhoto,
    flush,
    reload,
  }
}
