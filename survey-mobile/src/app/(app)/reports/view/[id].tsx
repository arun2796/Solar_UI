import { useState } from 'react'
import { Text } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import * as Sharing from 'expo-sharing'
import { api, errorMessage } from '../../../../lib/api'
import { SECTIONS, fmtDate } from '../../../../lib/types'
import { Button, Card, Empty, Loading, Row, Screen, Title } from '../../../../components/ui'
import { colors, font } from '../../../../theme'

/** Read-only view of a submitted report from the server, with PDF share. */
export default function ViewReport() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api.reports.get(id) })
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null)
  if (q.isLoading) return <Screen><Loading /></Screen>
  if (q.isError || !q.data) return <Screen><Empty text={errorMessage(q.error)} /><Button title="Retry" variant="secondary" onPress={() => q.refetch()} /></Screen>
  const r = q.data; const f = r.fields
  const share = async () => {
    setBusy(true); setMsg(null)
    try {
      if (!(await Sharing.isAvailableAsync())) { setMsg('Sharing is not supported on this device'); return }
      const file = await api.reports.downloadPdf(r.id, `${r.reportRef ?? 'report'}.pdf`)
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' })
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return <Screen footer={<Button title="Download and share PDF" onPress={share} loading={busy} />}>
    <Title sub={`${r.clientName} · ${r.status.toUpperCase()}`}>{r.reportRef ?? 'Draft'}</Title>
    {msg && <Text style={{ color: colors.danger, marginBottom: 8 }}>{msg}</Text>}
    <Card><Row k="Visit date" v={fmtDate(f.visitDate)} /><Row k="Next visit" v={fmtDate(f.nextVisitDate)} /><Row k="Technicians" v={f.technicianCount ?? undefined} /><Row k="Defects" v={r.defectCount} /><Row k="Submitted" v={r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : undefined} /></Card>
    {SECTIONS.map(s => <Card key={s.n}><Text style={{ fontWeight: '700', fontSize: font.base, marginBottom: 4 }}>{s.n}. {s.title}</Text>{s.rows.map(x => <Row key={x.key} k={x.label} v={(f[x.key] as string | number | null | undefined) ?? undefined} />)}{!!f[s.remarks] && <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 4 }}>Remarks: {f[s.remarks] as string}</Text>}</Card>)}
    <Card><Text style={{ fontWeight: '700', fontSize: font.base, marginBottom: 4 }}>8. Observations and Issues</Text><Row k="General observations" v={f.s8GeneralObservations ?? undefined} /><Row k="Action required" v={f.s8ActionRequired ?? undefined} /></Card>
  </Screen>
}
