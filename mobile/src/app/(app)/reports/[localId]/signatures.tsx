import { useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { drafts } from '../../../../db'
import { useDraft } from '../../../../forms/useDraft'
import { LIMITS } from '../../../../forms/schema'
import { scheduleSync } from '../../../../sync/engine'
import { SignaturePad } from '../../../../components/SignaturePad'
import { Button, Field, Input, Loading, NotFound, Screen } from '../../../../components/ui'
import { colors, font, space } from '../../../../theme'

export default function Signatures() {
  const { localId } = useLocalSearchParams<{ localId: string }>()
  const router = useRouter()
  const scrollRef = useRef<any>(null)
  const fieldPositions = useRef<Record<string, number>>({})
  const scrolledRef = useRef(false)
  const { draft, fields, setFields, flush, loading, locked, reload } = useDraft(localId)
  const [drawing, setDrawing] = useState(false)

  if (loading) return <Screen><Loading /></Screen>
  if (!draft || !fields) return <NotFound onBack={() => router.replace('/(app)')} />

  const engineerMissing = !locked && !draft.engineerSigUri
  const repNameMissing = !locked && !fields.clientRepName?.trim()
  const clientSigMissing = !locked && !draft.clientSigUri

  const recordLayout = (key: string, y: number) => {
    fieldPositions.current[key] = y
    // Auto-scroll to first missing item in signatures
    if (!scrolledRef.current) {
      if (engineerMissing && key === 'engineer') {
        scrolledRef.current = true
        setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true }), 100)
      } else if (!engineerMissing && repNameMissing && key === 'repName') {
        scrolledRef.current = true
        setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true }), 100)
      } else if (!engineerMissing && !repNameMissing && clientSigMissing && key === 'client') {
        scrolledRef.current = true
        setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true }), 100)
      }
    }
  }

  const save = async (kind: 'engineer' | 'client', uri: string) => {
    await flush()
    if (!(await drafts.setSignature(localId, kind, uri))) throw new Error('locked')
    scheduleSync(1000)
    await reload()
  }

  const toReview = async () => {
    await flush()
    if (router.canDismiss()) router.dismissTo(`/(app)/reports/${localId}/review`)
    else router.push(`/(app)/reports/${localId}/review`)
  }

  return (
    <Screen scrollRef={scrollRef} scrollEnabled={!drawing} footer={<Button title="Review and submit" onPress={toReview} />}>
      <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: space.md }}>
        Sign with a finger or stylus, then tap Save signature. Both signatures and client representative name are required before final submit.
      </Text>

      <View onLayout={e => recordLayout('engineer', e.nativeEvent.layout.y)}>
        <SignaturePad
          title="Engineer signature"
          filePrefix={`${localId}-engineer`}
          existingUri={draft.engineerSigUri}
          disabled={locked}
          error={engineerMissing ? 'Engineer signature is required before final submit' : undefined}
          onDrawing={setDrawing}
          onSaved={u => save('engineer', u)}
        />
      </View>

      <Field
        label="Client representative name"
        error={repNameMissing ? 'Client representative name is required before final submit' : undefined}
        onLayout={e => recordLayout('repName', e.nativeEvent.layout.y)}
      >
        <Input
          value={fields.clientRepName ?? ''}
          editable={!locked}
          maxLength={LIMITS.maxName}
          onChangeText={v => setFields({ clientRepName: v })}
          placeholder="Name of the person signing"
          autoCapitalize="words"
        />
      </Field>

      <View onLayout={e => recordLayout('client', e.nativeEvent.layout.y)}>
        <SignaturePad
          title="Client representative signature"
          filePrefix={`${localId}-client`}
          existingUri={draft.clientSigUri}
          disabled={locked}
          error={clientSigMissing ? 'Client representative signature is required before final submit' : undefined}
          onDrawing={setDrawing}
          onSaved={u => save('client', u)}
        />
      </View>
    </Screen>
  )
}
