import * as SecureStore from 'expo-secure-store'

// Values come from .env.development / .env.production or the build script (EXPO_PUBLIC_*), baked in at build time.
// Everything EXPO_PUBLIC_ is readable by anyone who has the APK: never put secrets here.
const BUILT_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '')
const OVERRIDE_KEY = 'solar_api_url_override'
/** Test builds (dev login on) may point the app at another server without rebuilding — e.g. when the PC's LAN address changes. */
export const API_URL_EDITABLE = process.env.EXPO_PUBLIC_DEV_LOGIN === 'true'
if (!BUILT_API_URL) console.warn('EXPO_PUBLIC_API_URL is not set; see .env.development')

let apiUrl = BUILT_API_URL

// Load any runtime override stored by the engineer
try {
  SecureStore.getItemAsync(OVERRIDE_KEY).then(raw => {
    if (raw) {
      const fixed = raw.replace(/:(8081|8082|8083|8084)$/, ':5000')
      apiUrl = fixed
    }
  }).catch(() => {})
} catch {}

export const config = {
  get apiUrl() { return apiUrl },
  builtApiUrl: BUILT_API_URL,
}

/** Normalises and stores a server address ("10.90.159.222:5000" → "http://10.90.159.222:5000"). Empty resets to the built-in one. */
export function setApiUrl(input: string): string {
  if (!API_URL_EDITABLE) return apiUrl
  let v = input.trim().replace(/\/+$/, '')
  if (!v) {
    void SecureStore.deleteItemAsync(OVERRIDE_KEY).catch(() => {})
    apiUrl = BUILT_API_URL
    return apiUrl
  }
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`
  // If user entered Expo port 8081/8082/8083/8084 by accident, correct to API port 5000
  v = v.replace(/:(8081|8082|8083|8084)$/, ':5000')
  if (/^http:\/\/\d+\.\d+\.\d+\.\d+$/.test(v)) v = `${v}:5000`
  apiUrl = v
  void SecureStore.setItemAsync(OVERRIDE_KEY, v).catch(() => {})
  return apiUrl
}
