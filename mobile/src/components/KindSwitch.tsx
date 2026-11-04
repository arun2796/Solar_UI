import { Pressable, Text, View } from 'react-native'
import { colors, font, space } from '../theme'

export type WorkKind = 'reports' | 'surveys'
const KINDS: { value: WorkKind; label: string }[] = [{ value: 'reports', label: 'Maintenance' }, { value: 'surveys', label: 'Site surveys' }]

/** Shown above Drafts / History for people who do both kinds of work. */
export function KindSwitch({ value, onChange }: { value: WorkKind; onChange: (k: WorkKind) => void }) {
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 12, padding: 4, marginBottom: space.md }}>
    {KINDS.map(k => {
      const on = k.value === value
      return <Pressable key={k.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(k.value)}
        style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: on ? '#fff' : 'transparent' }}>
        <Text style={{ fontSize: font.small, fontWeight: '800', color: on ? colors.primaryDark : colors.muted }}>{k.label}</Text>
      </Pressable>
    })}
  </View>
}

/** Which list to show: the one asked for (?kind=), else the one this person can use, maintenance first. */
export function initialKind(asked: string | undefined, canReports: boolean, canSurveys: boolean): WorkKind {
  if (asked === 'surveys' && canSurveys) return 'surveys'
  if (asked === 'reports' && canReports) return 'reports'
  return canReports ? 'reports' : 'surveys'
}
