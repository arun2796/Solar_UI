import { useEffect, useState } from 'react'
import { AppState, Text } from 'react-native'
import { Stack } from 'expo-router'
import { api } from '../../lib/api'
import { signOut, updateUser, useCan } from '../../lib/auth'
import { PERM } from '../../lib/types'
import { Button, Card, Screen, Title } from '../../components/ui'
import { colors, font, space } from '../../theme'

/**
 * Signed-in area: the bottom tabs, plus client selection and the report screens as stack screens on top of them.
 * (In this Expo Router version a tab with `href: null` becomes a hidden route that redirects away, so these
 * screens must not be hidden tabs.)
 */
export default function AppLayout() {
  useFreshPermissions()
  const canReports = useCan(PERM.reportsWork), canVisits = useCan(PERM.visitsView)
  if (!canReports && !canVisits) return <NoAccess text="Your account cannot use the maintenance app: it has neither maintenance reports nor assigned visits switched on." />
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="clients" />
    <Stack.Screen name="reports" />
  </Stack>
}

/** Re-reads role and permissions from the API when the app opens or comes back to the front (the office may have changed them). */
function useFreshPermissions() {
  useEffect(() => {
    const load = () => { void api.me().then(updateUser).catch(() => { /* offline: keep the stored permissions */ }) }
    load()
    const sub = AppState.addEventListener('change', st => { if (st === 'active') load() })
    return () => sub.remove()
  }, [])
}

/** Shown instead of the app when the office has not allowed this account to use it. Drafts stay on the phone. */
function NoAccess({ text }: { text: string }) {
  const [busy, setBusy] = useState(false)
  return <Screen>
    <Title sub="Ask the office to change your role or permissions.">No access</Title>
    <Card><Text style={{ fontSize: font.base, color: colors.text, lineHeight: 22 }}>{text}</Text></Card>
    <Button title="Check again" variant="secondary" loading={busy} onPress={() => { setBusy(true); void api.me().then(updateUser).catch(() => {}).finally(() => setBusy(false)) }} />
    <Button title="Sign out" variant="ghost" onPress={() => void signOut()} style={{ marginTop: space.sm }} />
  </Screen>
}
