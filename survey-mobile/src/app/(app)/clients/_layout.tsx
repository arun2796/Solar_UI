import { Stack } from 'expo-router'
import { headerOptions } from '../../../theme'
export default function ClientsLayout() {
  return <Stack screenOptions={headerOptions}>
    <Stack.Screen name="index" options={{ title: 'Select client' }} />
    <Stack.Screen name="[id]" options={{ title: 'Client details' }} />
  </Stack>
}
