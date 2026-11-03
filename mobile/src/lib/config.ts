import AsyncStorage from 'expo-sqlite/kv-store'

// Values come from .env.development / .env.production or the build script (EXPO_PUBLIC_*), baked in at build time.
// Everything EXPO_PUBLIC_ is readable by anyone who has the APK: never put secrets here.
const BUILT_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '')
const OVERRIDE_KEY = 'solar_api_url_override'
/** Test builds (dev login on) may point the app at another server without rebuilding — e.g. when the PC's LAN address changes. */
export const API_URL_EDITABLE = process.env.EXPO_PUBLIC_DEV_LOGIN === 'true'
if (!BUILT_API_URL) console.warn('EXPO_PUBLIC_API_URL is not set; see .env.development')

function readOverride(): string | null {
  if (!API_URL_EDITABLE) return null
  try { return AsyncStorage.getItemSync(OVERRIDE_KEY) } catch { return null }
}
let apiUrl = readOverride() ?? BUILT_API_URL

export const config = {
  get apiUrl() { return apiUrl },
  builtApiUrl: BUILT_API_URL,
}

/** Normalises and stores a server address ("192.168.1.53:5000" → "http://192.168.1.53:5000"). Empty resets to the built-in one. */
export function setApiUrl(input: string): string {
  if (!API_URL_EDITABLE) return apiUrl
  let v = input.trim().replace(/\/+$/, '')
  if (!v) { AsyncStorage.removeItemSync(OVERRIDE_KEY); apiUrl = BUILT_API_URL; return apiUrl }
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`
  apiUrl = v
  AsyncStorage.setItemSync(OVERRIDE_KEY, v)
  return apiUrl
}
