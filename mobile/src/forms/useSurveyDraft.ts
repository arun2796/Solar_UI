import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { surveyDrafts } from '../db'
import { calculateSurvey } from '../lib/surveyCalculator'
import type {
  SurveyCalculations,
  SurveyDraft,
  SurveyOverrides,
  SurveyPhotoLocal,
  SurveySections,
} from '../lib/surveyTypes'
import { registerActiveDraftFlusher, unregisterActiveDraftFlusher } from './useDraft'

export function useSurveyDraft(localId: string) {
  const [draft, setDraft] = useState<SurveyDraft | null>(null)
  const [loading, setLoading] = useState(true)

  const pendingSections = useRef<SurveySections | null>(null)
  const pendingOverrides = useRef<SurveyOverrides | null>(null)
  const pendingCalcs = useRef<SurveyCalculations | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }

    if (pendingSections.current) {
      const sec = pendingSections.current
      const ovr = pendingOverrides.current
      const cal = pendingCalcs.current
      pendingSections.current = null
      await surveyDrafts.saveSections(localId, sec, ovr, cal)
    }
  }, [localId])

  const reload = useCallback(async () => {
    const d = await surveyDrafts.get(localId)
    if (!d) {
      setDraft(null)
      setLoading(false)
      return
    }

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
  }, [localId])

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
    }, 30_000)
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
        ovr
      )

      // Also sync Section 9 auto-calculated values
      const mergedSections: SurveySections = {
        ...newSections,
        section9: {
          ...newSections.section9,
          systemSizeKw: calcs.recommendedSystemSizeKw,
          numberOfPanels: calcs.numberOfPanels,
          areaRequiredSqft: calcs.netFreeAreaSqft,
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
      const ok = await surveyDrafts.setSignature(localId, kind, uri)
      if (ok) {
        await reload()
      }
      return ok
    },
    [localId, reload]
  )

  const addPhoto = useCallback(
    async (photo: SurveyPhotoLocal) => {
      await surveyDrafts.addPhoto(localId, photo)
      await reload()
    },
    [localId, reload]
  )

  const removePhoto = useCallback(
    async (photoId: string) => {
      await surveyDrafts.removePhoto(localId, photoId)
      await reload()
    },
    [localId, reload]
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
