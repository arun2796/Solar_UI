import type { ConfigContext, ExpoConfig } from 'expo/config'

// Extends app.json.
// APP_VARIANT=production (set by scripts/build-apk.ps1 -Profile production and the EAS production profiles) enforces:
//   - the API address is https:// and not a placeholder, so the APK never depends on the developer's PC or LAN;
//   - the developer sign-in and editable server address are off.
// Cleartext HTTP is allowed only when the build talks to a plain-http API (local/LAN testing).
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? ''
  const production = process.env.APP_VARIANT === 'production'
  if (production) {
    if (!/^https:\/\//.test(apiUrl) || /example\.com|your-api/.test(apiUrl))
      throw new Error(`Production build: EXPO_PUBLIC_API_URL must be the deployed HTTPS API (got "${apiUrl}")`)
    if (process.env.EXPO_PUBLIC_DEV_LOGIN === 'true') throw new Error('Production build: EXPO_PUBLIC_DEV_LOGIN must be false')
  }
  const httpApi = apiUrl.startsWith('http://')
  return {
    ...(config as ExpoConfig),
    plugins: [...(config.plugins ?? []), ['expo-build-properties', { android: { usesCleartextTraffic: !production && httpApi } }]],
  }
}
