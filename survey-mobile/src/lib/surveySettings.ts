import { meta } from '../db'
import { api } from './api'
import { DEFAULT_SETTINGS, settingsFromApi, type CalculationSettings } from './surveyCalculator'

// The survey settings the admin sets in the website (Settings > Site survey): calculation constants, tariffs and the
// mandatory photos per site type. Kept on the phone so everything works offline with the last known values;
// refreshed whenever the survey sync runs online.
const KEY = 'survey_settings'
let raw: Record<string, string> = {}
let current: CalculationSettings = DEFAULT_SETTINGS
let loaded = false

function apply(r: Record<string, string>) { raw = r; current = settingsFromApi(r) }

function ensureLoaded() {
  if (loaded) return
  loaded = true
  void meta.get(KEY).then(v => { if (v) apply(JSON.parse(v)) }).catch(() => {})
}

export function currentSurveySettings(): CalculationSettings {
  ensureLoaded()
  return current
}

/** Photo tags of the form: eb_bill, roof, shadow, panel_mdb, eb_meter, id_proof. Same defaults as the API. */
export const PHOTO_LABELS: Record<string, string> = {
  eb_bill: 'EB bill', roof: 'Roof', shadow: 'Shadow areas', panel_mdb: 'Main panel / MDB', eb_meter: 'EB meter', id_proof: 'ID proof',
}
const DEFAULT_MANDATORY: Record<string, string[]> = {
  gated_community: ['eb_bill', 'roof', 'panel_mdb', 'eb_meter'],
  commercial: ['eb_bill', 'roof', 'panel_mdb', 'eb_meter'],
  industrial: ['eb_bill', 'roof', 'panel_mdb', 'eb_meter'],
  maintenance: ['roof', 'panel_mdb'],
}

/** Photos that must be attached before Submit Final, for this site type (admin setting mandatory_photos_<siteType>). */
export function mandatoryPhotos(siteType: string | null | undefined): string[] {
  ensureLoaded()
  const type = siteType || 'commercial'
  const setting = raw[`mandatory_photos_${type}`]
  if (setting != null) return setting.split(',').map(t => t.trim()).filter(t => t in PHOTO_LABELS)
  return DEFAULT_MANDATORY[type] ?? DEFAULT_MANDATORY.commercial
}

/** Fetches the admin settings; on failure (offline) keeps the cached ones. */
export async function refreshSurveySettings(): Promise<void> {
  try {
    const r = await api.surveys.settings()
    apply(r)
    loaded = true
    await meta.set(KEY, JSON.stringify(r))
  } catch {
    /* offline: keep the cached values */
  }
}
