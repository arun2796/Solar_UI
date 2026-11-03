import { Stack } from 'expo-router'
import { headerOptions } from '../../../theme'
export default function ReportsLayout() {
  return <Stack screenOptions={headerOptions}>
    <Stack.Screen name="[localId]/section/[n]" options={{ title: 'Maintenance form' }} />
    <Stack.Screen name="[localId]/signatures" options={{ title: 'Signatures' }} />
    <Stack.Screen name="[localId]/review" options={{ title: 'Review and submit' }} />
    <Stack.Screen name="[localId]/success" options={{ title: 'Submitted', headerBackVisible: false }} />
    <Stack.Screen name="view/[id]" options={{ title: 'Report' }} />
  </Stack>
}
