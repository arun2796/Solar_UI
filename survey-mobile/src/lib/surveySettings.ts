import { meta } from '../db'
import { api } from './api'
import { DEFAULT_SETTINGS, settingsFromApi, type CalculationSettings } from './surveyCalculator'

// The calculation constants the admin sets in the website (Settings > Site survey). Kept on the phone so the
// calculations work offline with the last known values; refreshed whenever the survey sync runs online.
const KEY = 'survey_settings'
let current: CalculationSettings = DEFAULT_SETTINGS
let loaded = false

export function currentSurveySettings(): CalculationSettings {
  if (!loaded) { loaded = true; void meta.get(KEY).then(raw => { if (raw) current = settingsFromApi(JSON.parse(raw)) }).catch(() => {}) }
  return current
}

/** Fetches the admin settings; on failure (offline) keeps the cached ones. */
export async function refreshSurveySettings(): Promise<void> {
  try {
    const raw = await api.surveys.settings()
    current = settingsFromApi(raw)
    loaded = true
    await meta.set(KEY, JSON.stringify(raw))
  } catch {
    /* offline: keep the cached values */
  }
}
