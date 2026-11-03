import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { fmtDate, parseIso, toIso } from '../lib/types'
import { colors, font, space, touch } from '../theme'

/** Native calendar picker. Stores YYYY-MM-DD (local calendar day), shows "dd MMM yyyy". No free-text dates. */
export function DateField({ value, onChange, editable = true, min, max, clearable, placeholder = 'Select date' }: {
  value?: string | null; onChange: (iso: string | null) => void; editable?: boolean; min?: string; max?: string; clearable?: boolean; placeholder?: string
}) {
  const [iosOpen, setIosOpen] = useState(false)
  const current = parseIso(value) ?? parseIso(max) ?? new Date()
  const minimumDate = parseIso(min) ?? undefined
  const maximumDate = parseIso(max) ?? undefined
  const open = () => {
    if (!editable) return
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current, mode: 'date', minimumDate, maximumDate, onValueChange: (_e, d) => onChange(toIso(d)) })
    } else setIosOpen(o => !o)
  }
  return <View>
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel={value ? `Date ${fmtDate(value)}, change` : placeholder} onPress={open} disabled={!editable}
        style={{ flex: 1, minHeight: touch, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: space.md, justifyContent: 'center', backgroundColor: editable ? colors.bg : colors.surface }}>
        <Text style={{ fontSize: font.base, color: value ? colors.text : '#64748B', fontWeight: value ? '700' : '400' }}>📅  {value ? fmtDate(value) : placeholder}</Text>
      </Pressable>
      {clearable && editable && !!value && <Pressable accessibilityRole="button" accessibilityLabel="Clear date" onPress={() => onChange(null)}
        style={{ minWidth: touch, minHeight: touch, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: font.base, fontWeight: '800', color: colors.muted }}>✕</Text></Pressable>}
    </View>
    {Platform.OS === 'ios' && iosOpen && <DateTimePicker value={current} mode="date" display="inline" minimumDate={minimumDate} maximumDate={maximumDate}
      onValueChange={(_e, d) => { onChange(toIso(d)); setIosOpen(false) }} onDismiss={() => setIosOpen(false)} />}
  </View>
}
