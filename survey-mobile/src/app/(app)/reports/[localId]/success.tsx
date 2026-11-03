import { useEffect, useState } from 'react'
import { BackHandler, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { drafts, type Draft } from '../../../../db'
import { api } from '../../../../lib/api'
import { fmtDate } from '../../../../lib/types'
import { Button, Loading, NotFound, Screen } from '../../../../components/ui'
import { colors, font, space } from '../../../../theme'

export default function Success() {
  const { localId } = useLocalSearchParams<{ localId: string }>(); const router = useRouter()
  const [d, setD] = useState<Draft | null | undefined>(undefined); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { drafts.get(localId).then(setD) }, [localId])
  const home = () => { router.dismissAll(); router.replace('/(app)') }
  // Hardware back must not return into the locked form: it finishes like Done.
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { void finish(); return true }); return () => s.remove() })
  // Only here, after the server confirmed submission, is the local copy (and its signature files) removed.
  const finish = async () => { if (d?.syncState === 'submitted') await drafts.remove(localId); home() }
  if (d === undefined) return <Screen><Loading /></Screen>
  if (d === null || d.syncState !== 'submitted') return <NotFound text="This report is not confirmed as submitted on this phone." onBack={home} />
  const share = async () => {
    if (!d.serverId) return
    setBusy(true); setMsg(null)
    try {
      if (!(await Sharing.isAvailableAsync())) { setMsg('Sharing is not supported on this device'); return }
      const file = await api.reports.downloadPdf(d.serverId, `${d.reportRef ?? 'report'}.pdf`)
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: `Share ${d.reportRef}`, UTI: 'com.adobe.pdf' })
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return <Screen footer={<>
    <Button title="Share PDF (WhatsApp, email…)" onPress={share} loading={busy} />
    <Button title="Done" variant="secondary" onPress={finish} /></>}>
    <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
      <Text style={{ fontSize: 64 }}>✅</Text>
      <Text style={{ fontSize: font.title, fontWeight: '800', color: colors.good, marginTop: space.md }}>Report submitted</Text>
      <Text style={{ fontSize: 30, fontWeight: '800', marginTop: space.sm, letterSpacing: 1 }}>{d.reportRef}</Text>
      <Text style={{ color: colors.muted, fontSize: font.base, marginTop: space.md, textAlign: 'center' }}>{d.clientName}{'\n'}Next visit due {fmtDate(d.nextVisitDate)}</Text>
      {msg && <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: space.md, fontWeight: '700', textAlign: 'center' }}>{msg}</Text>}
      <Text style={{ color: colors.muted, fontSize: font.small, marginTop: space.xl, textAlign: 'center' }}>The share sheet attaches the actual PDF file. Choose WhatsApp or Gmail to send it to the client.</Text>
    </View>
  </Screen>
}
