import { Stack } from 'expo-router'
import { colors } from '../../theme'

/**
 * Signed-in area: the bottom tabs, plus client selection and the report screens as stack screens on top of them.
 * (In this Expo Router version a tab with `href: null` becomes a hidden route that redirects away, so these
 * screens must not be hidden tabs.)
 */
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="clients" />
    <Stack.Screen name="reports" />
    <Stack.Screen name="surveys" />
  </Stack>
}
