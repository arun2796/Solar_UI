import { useCallback, useState, type ReactNode } from 'react'
import { Alert, FlatList, Pressable, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { drafts, type Draft } from '../db'
import { authStore } from '../lib/auth'
import { syncStore } from '../lib/store'
import { syncNow } from '../sync/engine'
import { fmtDate } from '../lib/types'
import { Button, Empty, Screen, StateBadge } from '../components/ui'
import { colors, font, space } from '../theme'

export function ReportDrafts({ header }: { header?: ReactNode }) {
  const router = useRouter(); const tick = syncStore.use(s => s.tick); const syncing = syncStore.use(s => s.syncing); const owner = authStore.use(s => s.userId)
  const [list, setList] = useState<Draft[]>([])
  const reload = useCallback(() => { if (owner) drafts.all(owner).then(setList) }, [owner])
  useFocusEffect(useCallback(() => { reload() }, [reload, tick]))   // eslint-disable-line react-hooks/exhaustive-deps
  const open = (d: Draft) => router.push(d.syncState === 'submitted' ? `/(app)/reports/${d.localId}/success` : `/(app)/reports/${d.localId}/review`)
  const del = (d: Draft) => {
    const unsent = !['submitted', 'elsewhere', 'synced'].includes(d.syncState)
    Alert.alert('Delete this copy?', d.syncState === 'submitted' || d.syncState === 'elsewhere' ? 'The report is on the server; only this phone’s copy is removed.'
      : unsent ? 'This draft has changes that are NOT on the server. Deleting it loses them permanently.' : 'The server keeps its draft copy; this phone’s copy is removed.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await drafts.remove(d.localId); reload() } }])
  }
  return <Screen scroll={false} footer={<Button title={syncing ? 'Syncing…' : 'Sync now'} variant="secondary" loading={syncing} onPress={() => void syncNow().then(reload)} />}>
    <FlatList ListHeaderComponent={header ? <>{header}</> : undefined} data={list} keyExtractor={d => d.localId} ListEmptyComponent={<Empty text="No drafts on this device. Start a maintenance visit from Home." />}
      renderItem={({ item: d }) => <Pressable accessibilityRole="button" accessibilityHint="Long-press to delete" onPress={() => open(d)} onLongPress={() => del(d)} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}><Text style={{ fontSize: font.large, fontWeight: '800', flex: 1 }}>{d.clientName}</Text><StateBadge state={d.syncState} /></View>
        <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 2 }}>Visit {fmtDate(d.fields.visitDate)}{d.reportRef ? ` · ${d.reportRef}` : ''} · edited {new Date(d.localUpdatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        {d.lastError && <Text style={{ color: colors.danger, fontSize: font.small, marginTop: 2, fontWeight: '600' }} numberOfLines={3}>{d.lastError}</Text>}
      </Pressable>} />
    <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: space.sm }}>Long-press a draft to delete it. Drafts are never deleted automatically.</Text>
  </Screen>
}
