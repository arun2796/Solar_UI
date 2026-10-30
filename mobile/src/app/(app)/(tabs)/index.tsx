import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { drafts, type Draft } from '../../../db'
import { authStore } from '../../../lib/auth'
import { syncStore } from '../../../lib/store'
import { fmtDate, type Appointment } from '../../../lib/types'
import { Button, Card, Empty, Screen, StateBadge, Title } from '../../../components/ui'
import { colors, font, space } from '../../../theme'

export default function Dashboard() {
  const router = useRouter()
  const owner = authStore.use(s => s.userId); const tick = syncStore.use(s => s.tick)
  // Server stats refresh when the screen is focused (not after every background sync, which wastes data on weak networks).
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, staleTime: 60_000 })
  const [local, setLocal] = useState<Draft[]>([])
  useFocusEffect(useCallback(() => { if (owner) drafts.all(owner).then(setLocal); void dash.refetch() }, [owner])) // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { if (owner) drafts.all(owner).then(setLocal) }, [owner, tick]))
  const open = local.filter(d => !['submitted', 'elsewhere'].includes(d.syncState))
  const todayIso = isoToday()
  const visits = dash.data?.myVisits ?? []
  const todayCount = visits.filter(v => v.scheduledDate === todayIso).length

  const stat = (label: string, value: number | string, onPress?: () => void, tone = colors.text) => <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={{ flex: 1, minWidth: 140, minHeight: 88, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: space.md }}>
    <Text style={{ color: colors.muted, fontSize: font.small }}>{label}</Text><Text style={{ fontSize: 32, fontWeight: '800', color: tone }}>{value}</Text></Pressable>

  return <Screen footer={<Button title="＋  Start maintenance visit" onPress={() => router.push('/(app)/clients')} />}>
    <Title sub={dash.data ? new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : dash.isError ? 'Offline — showing what is on this phone' : 'Loading server data…'}>Today</Title>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg }}>
      {stat('My visits today', dash.data ? todayCount : '—', undefined, todayCount ? colors.primary : colors.text)}
      {stat('Drafts on phone', open.length, () => router.push('/(app)/drafts'), open.length ? colors.warn : colors.text)}
      {stat('Submitted this month', dash.data?.submittedThisMonth ?? '—', () => router.push('/(app)/history'), colors.good)}
      {stat('Upcoming (14 d)', dash.data?.upcoming.length ?? '—')}
    </View>
    <Card><Text style={{ fontWeight: '800', fontSize: font.large, marginBottom: space.sm }}>My visits</Text>
      {!dash.data ? <Empty text={dash.isError ? 'Could not load from the server.' : 'Loading…'} /> : visits.length === 0 ? <Empty text="No visits assigned to you. You can start any client that is not assigned to another engineer." /> :
        visits.map(v => <VisitRow key={v.id} v={v} todayIso={todayIso} onPress={() => router.push(`/(app)/clients/${v.clientId}`)} />)}</Card>
    {open.length > 0 && <Card><Text style={{ fontWeight: '800', fontSize: font.large, marginBottom: space.sm }}>Continue a draft</Text>
      {open.slice(0, 3).map(d => <Pressable key={d.localId} accessibilityRole="button" onPress={() => router.push(`/(app)/reports/${d.localId}/review`)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, minHeight: 52, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
        <View style={{ flex: 1 }}><Text style={{ fontSize: font.base, fontWeight: '700' }}>{d.clientName}</Text><Text style={{ color: colors.muted, fontSize: font.small }}>Visit {fmtDate(d.fields.visitDate)}</Text></View><StateBadge state={d.syncState} /></Pressable>)}</Card>}
    <Card><Text style={{ fontWeight: '800', fontSize: font.large, marginBottom: space.sm }}>Upcoming visits</Text>
      {!dash.data ? <Empty text={dash.isError ? 'Could not load from the server.' : 'Loading…'} /> : dash.data.upcoming.length === 0 ? <Empty text="No visits due in the next 14 days." /> :
        dash.data.upcoming.map(u => <Pressable key={u.clientId} accessibilityRole="button" onPress={() => router.push(`/(app)/clients/${u.clientId}`)} style={{ minHeight: 52, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
          <Text style={{ fontSize: font.base, fontWeight: '700' }}>{u.clientName}</Text><Text style={{ color: u.isOverdue ? colors.danger : colors.muted, fontSize: font.small, fontWeight: u.isOverdue ? '700' : '400' }}>{u.isOverdue ? 'OVERDUE · ' : 'Due '}{fmtDate(u.nextDueDate)}{u.siteLocation ? ` · ${u.siteLocation}` : ''}</Text></Pressable>)}</Card>
  </Screen>
}

const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** "Today", "Tomorrow", "Missed · 28-Oct-2026" or the date, plus the time when the office set one. */
function VisitRow({ v, todayIso, onPress }: { v: Appointment; todayIso: string; onPress: () => void }) {
  const missed = v.scheduledDate < todayIso
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const when = v.scheduledDate === todayIso ? 'Today' : v.scheduledDate === tomorrow ? 'Tomorrow' : missed ? `Missed · ${fmtDate(v.scheduledDate)}` : fmtDate(v.scheduledDate)
  const time = v.scheduledTime ? v.scheduledTime.slice(0, 5) : null
  const tone = missed ? colors.danger : v.scheduledDate === todayIso ? colors.primary : colors.muted
  return <Pressable accessibilityRole="button" accessibilityLabel={`${when}${time ? ' at ' + time : ''}: ${v.clientName}. Open client`} onPress={onPress}
    style={{ minHeight: 56, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
    <Text style={{ color: tone, fontSize: font.small, fontWeight: '800' }}>{when}{time ? ` · ${time}` : ''}</Text>
    <Text style={{ fontSize: font.base, fontWeight: '700' }}>{v.clientName}</Text>
    {!!v.siteLocation && <Text style={{ color: colors.muted, fontSize: font.small }}>{v.siteLocation}</Text>}
    {!!v.notes && <Text style={{ color: colors.text, fontSize: font.small, marginTop: 2 }}>📝 {v.notes}</Text>}
  </Pressable>
}
