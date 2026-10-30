import { ActivityIndicator, Image, Text, View } from 'react-native'
import { Redirect } from 'expo-router'
import { authStore } from '../lib/auth'
import { colors } from '../theme'

/** Splash: shown while the session is restored, then redirects to the app or the login screen. */
export default function Splash() {
  const status = authStore.use(s => s.status)
  if (status === 'in') return <Redirect href="/(app)" />
  if (status === 'out') return <Redirect href="/(auth)/login" />
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, gap: 16, padding: 24 }}>
    <View style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 }}>
      <Image
        source={require('../../assets/images/company-logo.png')}
        style={{ width: 240, height: 68 }}
        resizeMode="contain"
        accessibilityLabel="Shree Abhi Electricals & Engineering Pvt. Ltd."
      />
    </View>
    <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' }}>Solar Maintenance</Text>
    <Text style={{ color: '#E0F2FE', fontSize: 14, textAlign: 'center' }}>Shree Abhi Electricals & Engineering Pvt. Ltd.</Text>
    <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
  </View>
}
