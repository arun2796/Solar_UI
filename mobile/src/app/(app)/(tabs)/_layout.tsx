import { Tabs } from 'expo-router'
import { Image, Text, View, type ColorValue } from 'react-native'
import { colors, headerOptions, space } from '../../../theme'

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 24, color }}>{glyph}</Text>

function HeaderBrand() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ backgroundColor: '#ffffff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Image
          source={require('../../../../assets/images/company-logo.png')}
          style={{ width: 105, height: 30 }}
          resizeMode="contain"
          accessibilityLabel="Shree Abhi Electricals & Engineering Pvt. Ltd."
        />
      </View>
      <View>
        <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>Solar PMC</Text>
        <Text style={{ color: colors.primarySoft, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>Shree Abhi Electricals & Eng.</Text>
      </View>
    </View>
  )
}

/** The four bottom tabs. Client selection and report screens are stack screens above the tabs (see ../_layout.tsx). */
export default function AppTabs() {
  return <Tabs screenOptions={{
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.muted,
    tabBarLabelStyle: { fontSize: 14, fontWeight: '700' },
    tabBarStyle: { height: 68, paddingBottom: 8, paddingTop: 6 },
    headerTitle: () => <HeaderBrand />,
    ...headerOptions,
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('⌂') }} />
    <Tabs.Screen name="drafts" options={{ title: 'Drafts', tabBarIcon: icon('✎') }} />
    <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('≣') }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('⚉') }} />
  </Tabs>
}
