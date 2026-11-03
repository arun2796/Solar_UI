import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type TextInputProps, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { colors, font, space, touch } from '../theme'
import { syncStore } from '../lib/store'
import { syncNow } from '../sync/engine'
import type { DraftSyncState } from '../db'

function useSafeHeaderHeight() { try { return useHeaderHeight() } catch { return 0 } }

/** Screen with keyboard avoidance (so remarks and date fields are not hidden by the keyboard) and an optional sticky footer. */
export function Screen({ children, scroll = true, padded = true, footer, scrollEnabled = true, scrollRef }: {
  children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode; scrollEnabled?: boolean; scrollRef?: React.RefObject<any>
}) {
  const insets = useSafeAreaInsets()
  const headerHeight = useSafeHeaderHeight()
  const body = scroll
    ? <ScrollView ref={scrollRef as never} contentContainerStyle={[padded && s.pad, { paddingBottom: space.xl }]} keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled}>{children}</ScrollView>
    : <View style={[{ flex: 1 }, padded && s.pad]}>{children}</View>
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
    <ConnectionBanner />{body}
    {footer && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{footer}</View>}
  </KeyboardAvoidingView>
}

/** Offline / reconnecting / failed banner. Background syncs do not flash it; only a user-started sync shows "Syncing…". */
export function ConnectionBanner() {
  const net = syncStore.use(x => x.net); const syncing = syncStore.use(x => x.syncing); const failed = syncStore.use(x => x.failed)
  if (net === 'online' && !syncing && !failed) return null
  const bg = net === 'offline' ? colors.text : failed ? colors.danger : colors.info
  const text = syncing ? 'Syncing…' : net === 'offline' ? 'Offline — work is saved on this device. Tap to try now' : failed ? `Sync failed for ${failed} report${failed > 1 ? 's' : ''} — tap to retry` : 'Reconnecting… tap to retry now'
  return <Pressable accessibilityRole="button" onPress={() => void syncNow()} disabled={syncing}
    style={{ backgroundColor: bg, minHeight: 48, justifyContent: 'center', paddingHorizontal: space.lg }}>
    <Text style={{ color: '#fff', fontSize: font.small, fontWeight: '700', textAlign: 'center' }}>{text}</Text></Pressable>
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; loading?: boolean; style?: ViewStyle }) {
  const bg = { primary: colors.primary, secondary: colors.bg, danger: colors.danger, ghost: 'transparent' }[variant]
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.text : '#fff'
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }} onPress={onPress} disabled={disabled || loading}
    style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: variant === 'secondary' ? colors.border : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}>
    {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: font.base, fontWeight: '700', textAlign: 'center' }}>{title}</Text>}</Pressable>
}

export function Field({ label, children, error, hint, style, onLayout }: { label: string; children: ReactNode; error?: string; hint?: string; style?: ViewStyle; onLayout?: (e: LayoutChangeEvent) => void }) {
  return (
    <View
      onLayout={onLayout}
      style={[
        { marginBottom: space.lg },
        error ? { borderWidth: 2, borderColor: colors.danger, borderRadius: 10, padding: space.sm, backgroundColor: colors.defectSoft } : null,
        style,
      ]}
    >
      <Text style={[s.label, error ? { color: colors.danger, fontWeight: '800' } : null]}>{label}</Text>
      {children}
      {hint && !error && <Text style={s.hint}>{hint}</Text>}
      {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </View>
  )
}
export function Input(p: TextInputProps) {
  return <TextInput placeholderTextColor="#64748B" {...p} style={[s.input, p.multiline && { minHeight: 90, textAlignVertical: 'top' }, p.editable === false && { backgroundColor: colors.surface, color: colors.muted }, p.style]} />
}

/**
 * Decimal (or whole-number) input that keeps the text the engineer typed, accepts a comma as decimal separator,
 * rejects anything that is not a plain non-negative number, and reports the parsed value (or null when empty).
 */
export function NumberInput({ value, onChange, editable = true, integer = false, max, placeholder }: { value: number | null | undefined; onChange: (v: number | null) => void; editable?: boolean; integer?: boolean; max?: number; placeholder?: string }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {                                           // external change (reload, conflict resolution): show it unless it is what we typed
    const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'))
    if (parsed !== (value ?? null)) setText(value == null ? '' : String(value))
  }, [value])                                                 // eslint-disable-line react-hooks/exhaustive-deps
  const pattern = integer ? /^\d*$/ : /^\d*([.,]\d*)?$/
  return <View>
    <Input value={text} editable={editable} keyboardType={integer ? 'number-pad' : 'decimal-pad'} placeholder={placeholder} inputMode={integer ? 'numeric' : 'decimal'}
      onChangeText={v => {
        if (!pattern.test(v)) { setError(integer ? 'Whole numbers only' : 'Numbers only (e.g. 12.5)'); return }
        setText(v)
        if (v === '' ) { setError(null); onChange(null); return }
        const n = Number(v.replace(',', '.'))
        if (!Number.isFinite(n)) return                        // "12." while typing: keep text, value updates on the next digit
        if (max !== undefined && n > max) { setError(`Maximum is ${max.toLocaleString('en-IN')}`); return }
        setError(null); onChange(n)
      }} />
    {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>
}

/** Two-option toggle used for YES/NO and GOOD/DEFECT. Selected state uses colour + filled background + check mark, never colour alone. */
export function Toggle({ value, onChange, options, disabled }: { value?: string | null; onChange: (v: string) => void; options: readonly [string, string]; disabled?: boolean }) {
  return <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">{options.map(o => {
    const sel = value === o
    const tone = o === 'DEFECT' ? colors.defect : o === 'GOOD' ? colors.good : colors.primaryDark
    const soft = o === 'DEFECT' ? colors.defectSoft : o === 'GOOD' ? colors.goodSoft : colors.primarySoft
    return <Pressable key={o} onPress={() => onChange(o)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected: sel, disabled }}
      style={[s.toggle, { borderColor: sel ? tone : colors.border, backgroundColor: sel ? soft : colors.bg, opacity: disabled && !sel ? 0.6 : 1 }]}>
      <Text style={{ fontSize: font.base, fontWeight: '800', color: sel ? tone : colors.muted }}>{sel ? '✓ ' : ''}{o}</Text></Pressable> })}</View>
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) { return <View style={[s.card, style]}>{children}</View> }
export function Row({ k, v }: { k: string; v?: ReactNode }) { return <View style={s.row}><Text style={{ color: colors.muted, fontSize: font.small, flex: 1 }}>{k}</Text><Text style={{ fontSize: font.base, flex: 1.4, textAlign: 'right', color: colors.text }}>{v ?? '—'}</Text></View> }
export function Title({ children, sub }: { children: ReactNode; sub?: string }) { return <View style={{ marginBottom: space.lg }}><Text style={s.title}>{children}</Text>{sub && <Text style={{ color: colors.muted, fontSize: font.small }}>{sub}</Text>}</View> }
export function Empty({ text }: { text: string }) { return <View style={{ padding: space.xl, alignItems: 'center' }}><Text style={{ color: colors.muted, fontSize: font.base, textAlign: 'center' }}>{text}</Text></View> }
export function Loading() { return <View style={{ padding: space.xl }}><ActivityIndicator color={colors.primary} size="large" /></View> }
/** Shown instead of an endless spinner when a draft was deleted (e.g. a stale screen in the back stack). */
export function NotFound({ text = 'This draft is no longer on the device.', onBack }: { text?: string; onBack: () => void }) {
  return <Screen><Empty text={text} /><Button title="Go to Home" variant="secondary" onPress={onBack} /></Screen>
}

export function StateBadge({ state }: { state: DraftSyncState }) {
  const map: Record<DraftSyncState, [string, string, string]> = {
    local: ['Saved on phone', colors.warnSoft, colors.warn], syncing: ['Syncing', colors.infoSoft, colors.info], synced: ['Synced', colors.goodSoft, colors.good],
    submitting: ['Submitting', colors.infoSoft, colors.info], submitted: ['Submitted', colors.goodSoft, colors.good], failed: ['Sync failed', colors.defectSoft, colors.defect],
    conflict: ['Conflict', colors.defectSoft, colors.defect], elsewhere: ['Submitted elsewhere', colors.infoSoft, colors.info] }
  const [t, bg, fg] = map[state]
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: fg, fontSize: 14, fontWeight: '800' }}>{t}</Text></View>
}

/** Section progress: numbered steps, ✓ when complete. With incomplete array, highlights incomplete sections in red tone. */
export function Progress({ done, current, onSelect, incomplete }: { done: boolean[]; current?: number; onSelect?: (n: number) => void; incomplete?: boolean[] }) {
  return <View style={{ flexDirection: 'row', gap: 4, marginBottom: space.md }} accessibilityLabel={`${done.filter(Boolean).length} of ${done.length} sections complete`}>
    {done.map((ok, i) => {
      const isCur = current === i + 1
      const isBad = incomplete ? incomplete[i] : (!ok && current !== undefined && current !== i + 1)
      const bg = ok ? colors.good : isCur ? colors.primary : isBad ? colors.defectSoft : colors.surface
      const border = ok ? colors.good : isCur ? colors.primary : isBad ? colors.danger : colors.border
      const fg = ok || isCur ? '#fff' : isBad ? colors.danger : colors.muted
      return <Pressable key={i} disabled={!onSelect || isCur} onPress={() => onSelect?.(i + 1)}
        accessibilityRole={onSelect ? 'button' : undefined} accessibilityLabel={`Section ${i + 1}${ok ? ', complete' : isBad ? ', incomplete' : ''}`} hitSlop={6}
        style={{ flex: 1, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: isBad ? 2 : 1, borderColor: border }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: fg }}>{ok ? '✓' : `${i + 1}${isBad ? '!' : ''}`}</Text></Pressable>
    })}
  </View>
}

const s = StyleSheet.create({
  pad: { padding: space.lg },
  footer: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, gap: space.sm },
  btn: { minHeight: touch, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, borderWidth: 1.5 },
  label: { fontSize: font.base, fontWeight: '700', color: colors.text, marginBottom: space.sm },
  hint: { fontSize: font.small, color: colors.muted, marginTop: space.xs },
  error: { fontSize: font.small, color: colors.danger, marginTop: space.xs, fontWeight: '700' },
  input: { minHeight: touch, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: space.md, fontSize: font.base, color: colors.text, backgroundColor: colors.bg },
  toggle: { flex: 1, minHeight: touch, borderWidth: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: space.lg, backgroundColor: colors.bg, marginBottom: space.md },
  row: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
})
