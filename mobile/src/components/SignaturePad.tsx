import { useRef, useState } from 'react'
import { View, Text } from 'react-native'
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas'
import { File, Paths } from 'expo-file-system'
import { Button } from './ui'
import { generateUuid } from '../lib/types'
import { colors, font, space } from '../theme'

/**
 * Captures a signature and writes it to a NEW PNG file each time (an upload may still be reading the previous one).
 * The draft store deletes superseded files. `onDrawing` lets the parent stop page scrolling while the finger is down.
 */
export function SignaturePad({ title, filePrefix, onSaved, existingUri, disabled, onDrawing, error }: {
  title: string; filePrefix: string; onSaved: (uri: string) => Promise<void> | void; existingUri?: string | null; disabled?: boolean; onDrawing?: (drawing: boolean) => void; error?: string
}) {
  const ref = useRef<SignatureViewRef>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const handleOK = async (dataUrl: string) => {
    try {
      const b64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      if (!b64) throw new Error('empty')
      const file = new File(Paths.document, `${filePrefix}-${generateUuid()}.png`)
      file.create()
      await file.write(b64, { encoding: 'base64' })
      await onSaved(file.uri)
      setMsg({ text: 'Signature saved', ok: true })
    } catch {
      setMsg({ text: 'Could not save the signature. Try again.', ok: false })
    } finally { setBusy(false) }
  }
  const style = `.m-signature-pad { box-shadow: none; border: none; } .m-signature-pad--body { border: none; } .m-signature-pad--footer { display: none; } body,html { background: #fff; }`
  const hasError = !!error && !existingUri

  return <View style={{ marginBottom: space.lg }}>
    <Text style={{ fontSize: font.base, fontWeight: '800', marginBottom: space.sm, color: hasError ? colors.danger : colors.text }}>
      {title}{existingUri ? '  ✓ saved' : ''}
    </Text>
    {disabled ? <View style={{ height: 80, borderWidth: 2, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
      <Text style={{ color: colors.muted }}>{existingUri ? 'Signed — report is locked' : 'Report is locked'}</Text></View> : <>
      <View style={{ height: 220, borderWidth: 2, borderColor: hasError ? colors.danger : colors.border, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
        <SignatureScreen ref={ref} onOK={handleOK} onEmpty={() => { setBusy(false); setMsg({ text: 'The pad is empty — sign first, then tap Save.', ok: false }) }}
          onBegin={() => onDrawing?.(true)} onEnd={() => onDrawing?.(false)}
          webStyle={style} backgroundColor="#ffffff" penColor={colors.text} descriptionText="" imageType="image/png" autoClear={false} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
        <Button title="Clear" variant="secondary" onPress={() => { ref.current?.clearSignature(); setMsg(null) }} style={{ flex: 1 }} />
        <Button title={existingUri ? 'Save new signature' : 'Save signature'} loading={busy} onPress={() => { setBusy(true); setMsg(null); ref.current?.readSignature() }} style={{ flex: 2 }} />
      </View></>}
    {hasError && <Text accessibilityRole="alert" style={{ marginTop: space.xs, fontWeight: '700', color: colors.danger }}>{error}</Text>}
    {msg && <Text accessibilityRole="alert" style={{ marginTop: space.xs, fontWeight: '700', color: msg.ok ? colors.good : colors.danger }}>{msg.text}</Text>}
  </View>
}
