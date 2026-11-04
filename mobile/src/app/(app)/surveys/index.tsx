import { useCallback, useState } from 'react'
import { Alert, FlatList, Pressable, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { surveyDrafts, surveysCache } from '../../../db'
import type { SurveyDraft } from '../../../lib/surveyTypes'
import { authStore } from '../../../lib/auth'
import { syncStore } from '../../../lib/store'
import { keepMyVersion, runSurveySync } from '../../../sync/surveySyncEngine'
import { Button, Card, Empty, Screen, StateBadge } from '../../../components/ui'
import { colors, font, space } from '../../../theme'

export default function SurveysList() {
  const router = useRouter()
  const owner = authStore.use(s => s.userId)
  const tick = syncStore.use(s => s.tick)
  const syncing = syncStore.use(s => s.syncing)

  const [localDrafts, setLocalDrafts] = useState<SurveyDraft[]>([])
  const [cachedSurveys, setCachedSurveys] = useState<any[]>([])
  const [tab, setTab] = useState<'drafts' | 'submitted'>('drafts')

  const reload = useCallback(async () => {
    if (owner) {
      const d = await surveyDrafts.all(owner)
      setLocalDrafts(d)
    }
    const c = await surveysCache.all()
    setCachedSurveys(c)
  }, [owner])

  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload, tick])
  )

  const del = (d: SurveyDraft) => {
    Alert.alert(
      'Delete this survey draft?',
      'This draft will be removed from your phone. Any unsynced data will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await surveyDrafts.remove(d.localId)
            void reload()
          },
        },
      ]
    )
  }

  const openDraft = (d: SurveyDraft) => {
    if (d.syncState === 'submitted') {
      router.push(`/(app)/surveys/${d.localId}/success`)
    } else {
      router.push(`/(app)/surveys/${d.localId}`)
    }
  }

  return (
    <Screen
      scroll={false}
      footer={
        <View style={{ gap: space.sm }}>
          <Button
            title="＋  Start new site survey"
            onPress={() => router.push('/(app)/surveys/new')}
          />
          <Button
            title={syncing ? 'Syncing surveys…' : 'Sync now'}
            variant="secondary"
            loading={syncing}
            onPress={() => void runSurveySync().then(reload)}
          />
        </View>
      }
    >
      {/* Tabs: Drafts vs Submitted */}
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setTab('drafts')}
          style={{
            flex: 1,
            paddingVertical: 10,
            alignItems: 'center',
            borderBottomWidth: 3,
            borderBottomColor: tab === 'drafts' ? colors.primary : 'transparent',
          }}
        >
          <Text
            style={{
              fontSize: font.base,
              fontWeight: '800',
              color: tab === 'drafts' ? colors.primary : colors.muted,
            }}
          >
            Drafts ({localDrafts.filter(d => d.syncState !== 'submitted').length})
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => setTab('submitted')}
          style={{
            flex: 1,
            paddingVertical: 10,
            alignItems: 'center',
            borderBottomWidth: 3,
            borderBottomColor: tab === 'submitted' ? colors.primary : 'transparent',
          }}
        >
          <Text
            style={{
              fontSize: font.base,
              fontWeight: '800',
              color: tab === 'submitted' ? colors.primary : colors.muted,
            }}
          >
            Submitted ({cachedSurveys.length + localDrafts.filter(d => d.syncState === 'submitted').length})
          </Text>
        </Pressable>
      </View>

      {tab === 'drafts' ? (
        <FlatList
          data={localDrafts.filter(d => d.syncState !== 'submitted')}
          keyExtractor={d => d.localId}
          ListEmptyComponent={
            <Empty text="No active site survey drafts on this phone. Tap 'Start new site survey' below." />
          }
          renderItem={({ item: d }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Long-press to delete"
              onPress={() => openDraft(d)}
              onLongPress={() => del(d)}
              style={{
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: space.sm,
                }}
              >
                <Text style={{ fontSize: font.large, fontWeight: '800', flex: 1 }}>
                  {d.customerName || 'Untitled Survey'}
                </Text>
                <StateBadge state={d.syncState as any} />
              </View>

              <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 2 }}>
                {d.surveyNumber ? `${d.surveyNumber} · ` : ''}
                {d.siteAddress ? `${d.siteAddress} · ` : ''}
                Edited{' '}
                {new Date(d.localUpdatedAt).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>

              {d.lastError && (
                <Text
                  style={{
                    color: colors.danger,
                    fontSize: font.small,
                    marginTop: 4,
                    fontWeight: '700',
                  }}
                  numberOfLines={2}
                >
                  {d.lastError}
                </Text>
              )}
              {d.syncState === 'conflict' && (
                <Button title="Send my version" variant="secondary" style={{ marginTop: space.sm }}
                  onPress={() => Alert.alert('Replace the office changes?', 'The copy on this phone will replace what the office changed in this survey.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Send my version', style: 'destructive', onPress: () => void keepMyVersion(d.localId).then(reload) },
                  ])} />
              )}
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={[
            ...localDrafts.filter(d => d.syncState === 'submitted'),
            ...cachedSurveys.filter(
              c => !localDrafts.some(ld => ld.serverId === c.id || ld.surveyNumber === c.surveyRef)
            ),
          ]}
          keyExtractor={item => item.id || item.localId}
          ListEmptyComponent={<Empty text="No submitted site surveys found." />}
          renderItem={({ item }) => {
            const num = item.surveyRef || item.surveyNumber || 'SV-XXXX'
            const name = item.customerName || item.sections?.section0?.customerName || 'Survey'
            const status = item.status || 'submitted'
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (item.localId) {
                    router.push(`/(app)/surveys/${item.localId}/success`)
                  }
                }}
                style={{
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: font.large, fontWeight: '800' }}>{name}</Text>
                  <View
                    style={{
                      backgroundColor: colors.goodSoft,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: colors.good, fontSize: 13, fontWeight: '800' }}>
                      {status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 2 }}>
                  {num} · {item.siteAddress || item.siteType || ''}
                </Text>
              </Pressable>
            )
          }}
        />
      )}
    </Screen>
  )
}
