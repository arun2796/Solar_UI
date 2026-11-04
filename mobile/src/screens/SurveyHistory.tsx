import type { ReactNode } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api, errorMessage } from '../lib/api'
import { Button, Empty, Loading, Screen, StateBadge } from '../components/ui'
import { colors, font, space } from '../theme'

export function SurveyHistory({ header }: { header?: ReactNode }) {
  const router = useRouter()
  const q = useQuery({
    queryKey: ['surveys', 'history'],
    queryFn: () => api.surveys.list({ pageSize: 50 }),
  })

  if (q.isLoading) return <Screen>{header}<Loading /></Screen>
  if (q.isError) {
    return (
      <Screen>
        {header}
        <Empty text={errorMessage(q.error)} />
        <Button title="Retry" variant="secondary" onPress={() => q.refetch()} />
      </Screen>
    )
  }

  const items = (q.data?.items ?? []).filter(s => s.status !== 'draft' && s.status !== 'assigned')

  return (
    <Screen scroll={false}>
      <FlatList ListHeaderComponent={header ? <>{header}</> : undefined}
        data={items}
        keyExtractor={s => s.id}
        refreshing={q.isFetching}
        onRefresh={() => q.refetch()}
        ListEmptyComponent={<Empty text="No site surveys found on server." />}
        renderItem={({ item: s }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/(app)/surveys/${s.clientLocalId || s.id}`)}
            style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
              <Text style={{ fontSize: font.large, fontWeight: '800', flex: 1 }}>
                {s.customerName}
              </Text>
              {s.surveyRef ? (
                <Text style={{ fontWeight: '800', color: colors.primary, fontSize: font.base }}>
                  {s.surveyRef}
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: colors.muted, fontSize: font.small, flex: 1 }}>
                {s.siteAddress} · {new Date(s.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
              <StateBadge state={s.status} />
            </View>

            {s.calculations ? (
              <View style={{ flexDirection: 'row', gap: space.md, marginTop: 6 }}>
                <Text style={{ fontSize: font.small, fontWeight: '700', color: colors.text }}>
                  Recommended: <Text style={{ color: colors.primary }}>{s.calculations.recommendedSystemSizeKw} kW</Text>
                </Text>
                <Text style={{ fontSize: font.small, fontWeight: '700', color: colors.text }}>
                  Panels: <Text style={{ color: colors.primary }}>{s.calculations.numberOfPanels}</Text>
                </Text>
                <Text style={{ fontSize: font.small, fontWeight: '700', color: colors.good }}>
                  Verdict: {s.verdict || 'Feasible'}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </Screen>
  )
}
