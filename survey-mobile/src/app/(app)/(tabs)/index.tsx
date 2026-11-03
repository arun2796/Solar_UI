import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { assignedTasksCache, surveyDrafts } from '../../../db'
import type { AssignedSurveyTask, SurveyDraft } from '../../../lib/surveyTypes'
import { authStore, currentEngineerName } from '../../../lib/auth'
import { syncStore } from '../../../lib/store'
import { Button, Card, Empty, Screen, StateBadge, Title } from '../../../components/ui'
import { colors, font, space, touch } from '../../../theme'

export default function SurveyDashboard() {
  const router = useRouter()
  const owner = authStore.use(s => s.userId)
  const tick = syncStore.use(s => s.tick)
  const engineer = currentEngineerName()

  const [refreshing, setRefreshing] = useState(false)
  const [localSurveys, setLocalSurveys] = useState<SurveyDraft[]>([])
  const [cachedAssigned, setCachedAssigned] = useState<AssignedSurveyTask[]>([])

  const serverSurveys = useQuery({
    queryKey: ['surveys', 'my-surveys'],
    queryFn: () => api.surveys.list({ pageSize: 20 }),
    staleTime: 30_000,
  })

  const assignedQuery = useQuery({
    queryKey: ['surveys', 'assigned'],
    queryFn: async () => {
      try {
        const raw = await api.surveys.assigned()
        const tasks: AssignedSurveyTask[] = Array.isArray(raw) ? raw : (raw as any)?.items ?? []
        await assignedTasksCache.replaceAll(tasks)
        return tasks
      } catch {
        // offline or remote error, return cache
      }
      return await assignedTasksCache.all()
    },
    staleTime: 15_000,
  })

  const loadLocal = useCallback(() => {
    if (owner) {
      surveyDrafts.all(owner).then(setLocalSurveys)
      assignedTasksCache.all().then(setCachedAssigned)
    }
  }, [owner])

  useFocusEffect(
    useCallback(() => {
      loadLocal()
      void serverSurveys.refetch()
      void assignedQuery.refetch()
    }, [loadLocal])
  )

  useFocusEffect(
    useCallback(() => {
      loadLocal()
    }, [loadLocal, tick])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        assignedQuery.refetch(),
        serverSurveys.refetch(),
      ])
      loadLocal()
    } finally {
      setRefreshing(false)
    }
  }

  const assignedList: AssignedSurveyTask[] =
    (assignedQuery.data && assignedQuery.data.length > 0)
      ? assignedQuery.data
      : cachedAssigned

  const drafts = localSurveys.filter(s => s.syncState !== 'submitted')
  const completed = (serverSurveys.data?.items ?? []).filter(s => s.status !== 'draft' && s.status !== 'assigned')

  const stat = (label: string, value: number | string, onPress?: () => void, tone = colors.text) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={{
        flex: 1,
        minWidth: 140,
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
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      footer={
        <View style={{ gap: space.xs }}>
          <Button
            title="☀️  Start New Site Survey"
            onPress={() => router.push('/(app)/surveys/new')}
          />
        </View>
      }
    >
      <Title sub={`Survey Engineer: ${engineer}`}>
        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      </Title>

      {/* 1. MY ASSIGNED SURVEYS (Clearly labelled at the top) */}
      <Card style={{ borderColor: colors.primary, borderWidth: 1.5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Text style={{ fontWeight: '800', fontSize: font.large, color: colors.primaryDark }}>
              📋 My Assigned Surveys
            </Text>
            {assignedList.length > 0 ? (
              <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primaryDark }}>
                  {assignedList.length}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            Pull to refresh
          </Text>
        </View>

        {assignedList.length > 0 ? (
          assignedList.map(t => {
            const isCommercial = t.customerType === 'Commercial'
            const displayName = isCommercial
              ? (t.companyName || t.contactPerson || 'Commercial Client')
              : (t.contactPerson || t.companyName || 'Individual Customer')
            const location = [t.siteAddress, t.cityArea].filter(Boolean).join(' · ') || 'Site address pending'

            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => router.push(`/(app)/surveys/task/${t.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: space.sm,
                  minHeight: touch,
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: '#E2E8F0',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: font.base, fontWeight: '800', color: colors.text }}>
                      {displayName}
                    </Text>
                    {t.surveyRef ? (
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                        {t.surveyRef}
                      </Text>
                    ) : null}
                  </View>

                  <Text style={{ color: colors.muted, fontSize: font.small }} numberOfLines={1}>
                    {location}
                  </Text>

                  {t.plannedVisitDate ? (
                    <Text style={{ fontSize: 13, color: colors.primaryDark, fontWeight: '600', marginTop: 2 }}>
                      📅 Visit: {t.plannedVisitDate}
                    </Text>
                  ) : null}
                </View>

                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <StateBadge state={t.status} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                    Details →
                  </Text>
                </View>
              </Pressable>
            )
          })
        ) : (
          <Empty text="No survey tasks assigned yet. You will see assigned site survey tasks here once scheduled by the operations team." />
        )}
      </Card>

      {/* KPI Stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg }}>
        {stat('Total Surveys', (serverSurveys.data?.total ?? localSurveys.length), undefined, colors.primary)}
        {stat('Active Drafts', drafts.length, () => router.push('/(app)/drafts'), drafts.length ? colors.warn : colors.text)}
        {stat('Submitted', completed.length, () => router.push('/(app)/history'), colors.good)}
      </View>

      {/* Drafts in Progress */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
          <Text style={{ fontWeight: '800', fontSize: font.large }}>Draft Surveys in Progress</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/drafts')}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.small }}>
              View all ({drafts.length}) →
            </Text>
          </Pressable>
        </View>

        {drafts.length > 0 ? (
          drafts.slice(0, 3).map(s => (
            <Pressable
              key={s.localId}
              accessibilityRole="button"
              onPress={() => router.push(`/(app)/surveys/${s.localId}`)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: space.sm,
                minHeight: 52,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: '#E2E8F0',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.base, fontWeight: '700' }}>
                  {s.customerName || 'Untitled Survey'}
                </Text>
                <Text style={{ color: colors.muted, fontSize: font.small }}>
                  {s.siteAddress || 'Site Survey'} · Updated {new Date(s.localUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <StateBadge state={s.syncState} />
            </Pressable>
          ))
        ) : (
          <Empty text="No active survey drafts. Tap 'Start New Site Survey' below to begin." />
        )}
      </Card>

      {/* Submitted Surveys */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
          <Text style={{ fontWeight: '800', fontSize: font.large }}>Recent Submitted Surveys</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/history')}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.small }}>
              History ({completed.length}) →
            </Text>
          </Pressable>
        </View>

        {completed.length > 0 ? (
          completed.slice(0, 4).map(s => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(app)/surveys/${s.clientLocalId || s.id}`)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: space.sm,
                minHeight: 52,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: '#E2E8F0',
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: font.base, fontWeight: '700' }}>{s.customerName}</Text>
                  {s.surveyRef ? (
                    <Text style={{ fontSize: font.small, fontWeight: '700', color: colors.primary }}>
                      {s.surveyRef}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: colors.muted, fontSize: font.small }}>
                  {s.siteAddress} · Status: <Text style={{ textTransform: 'capitalize', fontWeight: '600' }}>{s.status}</Text>
                </Text>
              </View>
              <Text style={{ fontSize: font.small, fontWeight: '800', color: colors.good }}>
                {s.calculations?.recommendedSystemSizeKw ? `${s.calculations.recommendedSystemSizeKw} kW` : 'Submitted'}
              </Text>
            </Pressable>
          ))
        ) : (
          <Empty text="No submitted surveys yet on server." />
        )}
      </Card>
    </Screen>
  )
}

