import { Stack } from 'expo-router'
import { Image, Text, View } from 'react-native'
import { colors, headerOptions, space } from '../../../theme'

function HeaderBrand({ title }: { title?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ backgroundColor: '#ffffff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Image
          source={require('../../../../assets/images/company-logo.png')}
          style={{ width: 90, height: 26 }}
          resizeMode="contain"
          accessibilityLabel="Shree Abhi Electricals & Engineering Pvt. Ltd."
        />
      </View>
      <View>
        <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>
          {title ?? 'Site Survey'}
        </Text>
        <Text style={{ color: colors.primarySoft, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
          Shree Abhi Electricals & Eng.
        </Text>
      </View>
    </View>
  )
}

export default function SurveysLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="new" options={{ headerTitle: () => <HeaderBrand title="New Site Survey" />, title: 'New Site Survey' }} />
      <Stack.Screen name="task/[id]" options={{ headerTitle: () => <HeaderBrand title="Assigned Survey Task" />, title: 'Assigned Survey Task' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'Survey Form' }} />
      <Stack.Screen name="[id]/success" options={{ title: 'Survey Submitted', headerBackVisible: false }} />
    </Stack>
  )
}
