import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { authStore, initAuth } from '../lib/auth'
import { initIdleTracker, recordUserActivity } from '../lib/idle'
import { startSyncEngine } from '../sync/engine'
import { colors, headerOptions } from '../theme'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } })

export default function RootLayout() {
  const status = authStore.use(s => s.status)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => initAuth(), [])

  useEffect(() => {
    if (status === 'in') {
      const stopSync = startSyncEngine()
      const stopIdle = initIdleTracker()
      return () => {
        stopSync()
        stopIdle()
      }
    }
    if (status === 'out') queryClient.clear() // never show the previous user's server data
  }, [status])

  useEffect(() => {
    if (status === 'loading') return
    const inAuth = segments[0] === '(auth)'
    if (status === 'out' && !inAuth) router.replace('/(auth)/login')
    else if (status === 'in' && inAuth) router.replace('/(app)') // the splash route redirects itself (src/app/index.tsx)
  }, [status, segments, router])

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <View
          style={{ flex: 1 }}
          onTouchStart={recordUserActivity}
          onResponderMove={recordUserActivity}
        >
          <Stack screenOptions={{ ...headerOptions, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
          </Stack>
        </View>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
