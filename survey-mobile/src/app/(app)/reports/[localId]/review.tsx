import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { drafts, type Draft } from '../../../../db'
import { getMissingReportIssues, sectionComplete } from '../../../../forms/schema'
import { conflictDiff, resolveConflict, runSync, syncNow } from '../../../../sync/engine'
import { syncStore } from '../../../../lib/store'
import { SECTIONS, fmtDate } from '../../../../lib/types'
import { Button, Card, Loading, NotFound, Progress, Row, Screen, StateBadge } from '../../../../components/ui'
import { colors, font, space } from '../../../../theme'

export default function Review() {
  const { localId } = useLocalSearchParams<{ localId: string }>()
  const router = useRouter()
  const scrollRef = useRef<any>(null)
  const [d, setD] = useState<Draft | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const tick = syncStore.use(s => s.tick)
  const net = syncStore.use(s => s.net)

  const reload = useCallback(() => { drafts.get(localId).then(setD) }, [localId])
  useFocusEffect(reload)
  useEffect(reload, [tick, reload])
  useEffect(() => { if (d?.syncState === 'submitted' && d.reportRef) router.replace(`/(app)/reports/${localId}/success`) }, [d, localId, router])

  if (d === undefined) return <Screen><Loading /></Screen>
  if (d === null) return <NotFound onBack={() => router.replace('/(app)')} />

  const f = d.fields
  const issues = getMissingReportIssues(f, { engineer: !!d.engineerSigUri, client: !!d.clientSigUri }, localId)
  const done = [1, 2, 3, 4, 5, 6, 7, 8].map(i => sectionComplete(i, f))
  const incomplete = [1, 2, 3, 4, 5, 6, 7, 8].map(i => !done[i - 1])
  const defects = SECTIONS.flatMap(s => s.rows.filter(r => f[r.key] === 'DEFECT' || (r.key === 's1BrokenModule' && f[r.key] === 'YES')).map(r => `${s.n}. ${r.label}`))
  const editable = !['submitting', 'submitted', 'conflict', 'elsewhere'].includes(d.syncState)

  const open = (path: string) => { if (editable) router.push(path as never) }

  const submit = () => {
    if (issues.length > 0) {
      setAttemptedSubmit(true)
      scrollRef.current?.scrollTo({ y: 0, animated: true })
      const errorSummary = issues.map(i => `• ${i.message}`).join('\n')
      Alert.alert(
        `Incomplete Report (${issues.length} missing)`,
        `Please complete the following required items before final submit:\n\n${errorSummary}`,
        [
          { text: 'Review List', style: 'cancel' },
          { text: 'Fix First Problem', onPress: () => open(issues[0].path) },
        ]
      )
      return
    }

    Alert.alert(
      'Submit final report?',
      `${d.clientName}\nVisit ${fmtDate(f.visitDate)} · Next visit ${fmtDate(f.nextVisitDate)}\n\nAfter submission the report is locked and cannot be edited from the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'default',
          onPress: async () => {
            setBusy(true)
            await drafts.patch(localId, { submitRequested: 1, syncState: 'submitting', lastError: null, attempts: 0, nextAttemptAt: null })
            await runSync({ manual: true })
            setBusy(false)
            reload()
          },
        },
      ]
    )
  }

  const discard = () => Alert.alert('Discard local copy?', 'The report on the server is not affected. Only this phone’s copy is removed.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: async () => { await drafts.remove(localId); router.dismissAll(); router.replace('/(app)/drafts') } }])

  const footer = d.syncState === 'conflict' || d.syncState === 'elsewhere' ? undefined : <>
    {d.syncState === 'submitting'
      ? <><Text style={{ textAlign: 'center', color: colors.info, fontWeight: '800', fontSize: font.base }}>{net === 'offline' ? 'Queued — will submit automatically when back online' : 'Submitting… it will keep retrying until the server confirms'}</Text>
          <Button title="Try now" variant="secondary" onPress={() => void syncNow().then(reload)} /></>
      : <Button
          title={issues.length > 0 && attemptedSubmit ? `Fix ${issues.length} missing item(s) to submit` : 'Submit final report'}
          variant={issues.length > 0 && attemptedSubmit ? 'danger' : 'primary'}
          disabled={!editable}
          loading={busy}
          onPress={submit}
        />}
    <Button title="Save draft and exit" variant="secondary" onPress={() => { router.dismissAll(); router.replace('/(app)/drafts') }} /></>

  const headerIssues = issues.filter(x => x.fieldKey === 'visitDate' || x.fieldKey === 'technicianCount')
  const sigIssues = issues.filter(x => x.section === 'signatures')

  return <Screen scrollRef={scrollRef} footer={footer}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm, gap: space.sm }}>
      <Text style={{ fontSize: font.title, fontWeight: '800', flex: 1 }}>{d.clientName}</Text>
      <StateBadge state={d.syncState} />
    </View>

    <Progress done={done} incomplete={attemptedSubmit ? incomplete : undefined} onSelect={to => open(`/(app)/reports/${localId}/section/${to}`)} />

    {d.lastError && d.syncState !== 'conflict' && d.syncState !== 'elsewhere' && <Card style={{ borderColor: colors.danger, backgroundColor: colors.defectSoft }}>
      <Text style={{ color: colors.danger, fontWeight: '700' }}>{d.lastError}</Text>
      {(d.syncState === 'failed' || d.syncState === 'local') && <Button title="Retry sync now" variant="secondary" onPress={() => void syncNow().then(reload)} style={{ marginTop: space.sm }} />}</Card>}

    {d.syncState === 'elsewhere' && <Card style={{ borderColor: colors.info, backgroundColor: colors.infoSoft }}>
      <Text style={{ fontWeight: '800', fontSize: font.large, color: colors.info }}>Already submitted {d.reportRef ? `as ${d.reportRef}` : ''}</Text>
      <Text style={{ marginVertical: space.sm }}>This report was finalised from another device or by an admin. The copy below is what this phone had; it was not sent. Open History to see the official report.</Text>
      <Button title="Discard local copy" variant="danger" onPress={discard} /></Card>}

    {d.syncState === 'conflict' && <ConflictCard d={d} onResolved={reload} />}

    {/* Clear Missing Items Alert Banner when submission was attempted or incomplete */}
    {editable && issues.length > 0 && (
      <Card style={{ borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.defectSoft }}>
        <Text style={{ fontWeight: '800', fontSize: font.large, color: colors.danger, marginBottom: 4 }}>
          ⚠️ Incomplete Report ({issues.length} missing)
        </Text>
        <Text style={{ color: colors.text, fontSize: font.small, marginBottom: space.sm }}>
          Tap any field below to jump straight to that section:
        </Text>
        {issues.map(it => (
          <Pressable key={it.message} accessibilityRole="button" onPress={() => open(it.path)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#FECACA' }}>
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.small, flex: 1 }}>• {it.message}</Text>
            <Text style={{ color: colors.danger, fontWeight: '800', fontSize: font.small, marginLeft: 6 }}>Fix ›</Text>
          </Pressable>
        ))}
      </Card>
    )}

    {/* Header & Visit details card */}
    <Card style={headerIssues.length > 0 && attemptedSubmit ? { borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.defectSoft } : undefined}>
      <Row k="Visit date" v={fmtDate(f.visitDate)} />
      <Row k="Previous maintenance" v={fmtDate(f.previousMaintenanceDate)} />
      <Row k="Technicians" v={f.technicianCount ?? undefined} />
      <Row k="Next visit date" v={fmtDate(f.nextVisitDate)} />
      {headerIssues.length > 0 && attemptedSubmit && (
        <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.small, marginTop: 4 }}>
          Missing: {headerIssues.map(x => x.fieldLabel).join(', ')}
        </Text>
      )}
    </Card>

    {/* Signatures card */}
    <Pressable disabled={!editable} onPress={() => open(`/(app)/reports/${localId}/signatures`)}>
      <Card style={sigIssues.length > 0 && attemptedSubmit ? { borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.defectSoft } : undefined}>
        <Text style={{ fontWeight: '800', fontSize: font.base, marginBottom: 4 }}>Signatures{editable ? '  ›' : ''}</Text>
        <Row k="Signatures" v={`${d.engineerSigUri ? '✓' : '✗'} engineer · ${d.clientSigUri ? '✓' : '✗'} client`} />
        <Row k="Client representative" v={f.clientRepName || undefined} />
        {sigIssues.length > 0 && attemptedSubmit && (
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.small, marginTop: 4 }}>
            Missing: {sigIssues.map(x => x.fieldLabel).join(', ')}
          </Text>
        )}
      </Card>
    </Pressable>

    {/* Defects summary card */}
    <Card style={defects.length ? { borderColor: colors.defect } : undefined}>
      <Text style={{ fontWeight: '800', marginBottom: 4 }}>{defects.length ? `${defects.length} defect(s) recorded` : 'No defects recorded'}</Text>
      {defects.map(m => <Text key={m} style={{ color: colors.defect, fontSize: font.small }}>• {m}</Text>)}
    </Card>

    {/* Section cards with red outline when incomplete */}
    {SECTIONS.map(s => {
      const secIssues = issues.filter(x => x.section === s.n)
      const isMissing = attemptedSubmit && secIssues.length > 0
      return (
        <Pressable key={s.n} disabled={!editable} onPress={() => open(`/(app)/reports/${localId}/section/${s.n}`)}>
          <Card style={isMissing ? { borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.defectSoft } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontWeight: '800', fontSize: font.base, color: isMissing ? colors.danger : colors.text }}>
                {s.n}. {s.title}
              </Text>
              <Text style={{ color: isMissing ? colors.danger : colors.muted, fontWeight: '700' }}>
                {done[s.n - 1] ? '✓ Done' : isMissing ? '⚠️ Incomplete' : '›'}
              </Text>
            </View>
            {s.rows.map(r => <Row key={r.key} k={r.label} v={(f[r.key] as string | number | null | undefined) ?? undefined} />)}
            {!!f[s.remarks] && <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 4 }}>Remarks: {f[s.remarks] as string}</Text>}
            {isMissing && (
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.small, marginTop: 6 }}>
                Missing: {secIssues.map(x => x.fieldLabel).join(', ')}
              </Text>
            )}
          </Card>
        </Pressable>
      )
    })}

    {/* Section 8 card */}
    {(() => {
      const s8Issues = issues.filter(x => x.section === 8)
      const isMissing = attemptedSubmit && s8Issues.length > 0
      return (
        <Pressable disabled={!editable} onPress={() => open(`/(app)/reports/${localId}/section/8`)}>
          <Card style={isMissing ? { borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.defectSoft } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontWeight: '800', fontSize: font.base, color: isMissing ? colors.danger : colors.text }}>
                8. Observations and Issues
              </Text>
              <Text style={{ color: isMissing ? colors.danger : colors.muted, fontWeight: '700' }}>
                {done[7] ? '✓ Done' : isMissing ? '⚠️ Incomplete' : '›'}
              </Text>
            </View>
            <Row k="General observations" v={f.s8GeneralObservations || undefined} />
            <Row k="Action required" v={f.s8ActionRequired || undefined} />
            <Row k="Next visit date" v={fmtDate(f.nextVisitDate)} />
            {isMissing && (
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.small, marginTop: 6 }}>
                Missing: {s8Issues.map(x => x.fieldLabel).join(', ')}
              </Text>
            )}
          </Card>
        </Pressable>
      )
    })()}
  </Screen>
}

function ConflictCard({ d, onResolved }: { d: Draft; onResolved: () => void }) {
  const diff = conflictDiff(d)
  const [busy, setBusy] = useState<'mine' | 'server' | null>(null)
  const choose = (c: 'mine' | 'server') => Alert.alert(c === 'mine' ? 'Keep my version?' : 'Take the server version?',
    c === 'mine' ? 'Your values replace the server copy.' : 'Your values on this phone are replaced by the server copy.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: async () => { setBusy(c); await resolveConflict(d.localId, c); setBusy(null); onResolved() } }])
  return <Card style={{ borderColor: colors.danger }}>
    <Text style={{ fontWeight: '800', fontSize: font.large, color: colors.danger }}>Changed on another device</Text>
    <Text style={{ marginVertical: space.sm }}>The server copy of this draft was changed elsewhere. Compare the differences and choose which version to keep. Submission is paused until you decide.</Text>
    {diff.length === 0 ? <Text style={{ color: colors.muted, marginBottom: space.sm }}>No field differences (only signatures or version changed).</Text>
      : diff.map(x => <View key={x.label} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
          <Text style={{ fontWeight: '700' }}>{x.label}</Text>
          <Text style={{ fontSize: font.small }}>This phone: <Text style={{ fontWeight: '800' }}>{x.mine}</Text></Text>
          <Text style={{ fontSize: font.small }}>Server: <Text style={{ fontWeight: '800' }}>{x.server}</Text></Text></View>)}
    <Button title="Keep my version" loading={busy === 'mine'} onPress={() => choose('mine')} style={{ marginTop: space.sm, marginBottom: space.sm }} />
    <Button title="Take the server version" variant="secondary" loading={busy === 'server'} onPress={() => choose('server')} />
  </Card>
}
