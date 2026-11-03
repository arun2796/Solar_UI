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
  const owner = authStore.use(s => s.userId)
  const tick = syncStore.use(s => s.tick)
  // Server stats refresh when the screen is focused (not after every background sync, which wastes data on weak networks).
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, staleTime: 60_000 })
  const [local, setLocal] = useState<Draft[]>([])

  useFocusEffect(
    useCallback(() => {
      if (owner) drafts.all(owner).then(setLocal)
      void dash.refetch()
    }, [owner])
  )

  useFocusEffect(
    useCallback(() => {
      if (owner) drafts.all(owner).then(setLocal)
    }, [owner, tick])
  )

  const open = local.filter(d => !['submitted', 'elsewhere'].includes(d.syncState))
  const todayIso = isoToday()
  const visits = dash.data?.myVisits ?? []
  const todayCount = visits.filter(v => v.scheduledDate === todayIso).length

  const stat = (label: string, value: number | string, onPress?: () => void, tone = colors.text) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={{
        flex: 1,
        minWidth: 100,
        minHeight: 88,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: space.md,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: font.small }}>{label}</Text>
      <Text style={{ fontSize: 32, fontWeight: '800', color: tone }}>{value}</Text>
    </Pressable>
  )

  return (
    <Screen
      footer={
        <Button
          title="＋  Start maintenance visit"
          onPress={() => router.push('/(app)/clients')}
        />
      }
    >
      <Title
        sub={
          dash.data
            ? new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
            : dash.isError
            ? 'Offline — showing what is on this phone'
            : 'Loading server data…'
        }
      >
        Today
      </Title>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg }}>
        {stat('My visits today', dash.data ? todayCount : '—', undefined, todayCount ? colors.primary : colors.text)}
        {stat('Drafts on phone', open.length, () => router.push('/(app)/drafts'), open.length ? colors.warn : colors.text)}
        {stat('Submitted this month', dash.data?.submittedThisMonth ?? '—', () => router.push('/(app)/history'), colors.good)}
        {stat('Upcoming (14 d)', dash.data?.upcoming.length ?? '—')}
      </View>

      <Card>
        <Text style={{ fontWeight: '800', fontSize: font.large, marginBottom: space.sm }}>My visits</Text>
        {!dash.data ? (
          <Empty text={dash.isError ? 'Could not load from the server.' : 'Loading…'} />
        ) : visits.length === 0 ? (
          <Empty text="No visits assigned to you. You can start any client that is not assigned to another engineer." />
        ) : (
          visits.map(v => (
            <VisitRow
              key={v.id}
              v={v}
              todayIso={todayIso}
              onPress={() => router.push(`/(app)/clients/${v.clientId}`)}
            />
          ))
        )}
      </Card>

      {open.length > 0 && (
        <Card>
          <Text style={{ fontWeight: '800', fontSize: font.large, marginBottom: space.sm }}>Continue a draft</Text>
          {open.slice(0, 3).map(d => (
            <Pressable
              key={d.localId}
              accessibilityRole="button"
              onPress={() => router.push(`/(app)/reports/${d.localId}/review`)}
              style={{
                flexDirection: 'row',
                justifyContent: