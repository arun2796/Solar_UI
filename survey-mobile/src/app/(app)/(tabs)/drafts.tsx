import { useCallback, useState } from 'react'
import { Alert, FlatList, Pressable, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { surveyDrafts } from '../../../db'
import type { SurveyDraft } from '../../../lib/surveyTypes'
import { authStore } from '../../../lib/auth'
import { syncStore } from '../../../lib/store'
import { surveySyncEngine } from '../../../sync/surveySyncEngine'
import { Button, Empty, Screen, StateBadge } from '../../../components/ui'
import { colors, font, space } from '../../../theme'

export default function SurveyDraftsTab() {
  const router = useRouter()
  const tick = syncStore.use(s => s.tick)
  const syncing = syncStore.use(s => s.syncing)
  const owner = authStore.use(s => s.userId)

  const [list, setList] = useState<SurveyDraft[]>([])

  const reload = useCallback(() => {
    if (owner) {
      surveyDrafts.all(owner).then(setList)
    }
  }, [owner])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload, tick])
  )

  const open = (d: SurveyDraft) => {
    router.push(
      d.syncState === 'submitted'
        ? `/(app)/surveys/${d.localId}/success`
        : `/(app)/surveys/${d.localId}`
    )
  }

  const del = (d: SurveyDraft) => {
    const unsent = !['submitted', 'synced'].includes(d.syncState)
    Alert.alert(
      'Delete survey draft?',
      unsent
        ? 'This survey draft has changes not yet synced to the server. Deleting will permanently remove it from this device.'
        : 'The survey is safely stored on the server. Only this local device cache will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await surveyDrafts.remove(d.localId)
            reload()
          },
        },
      ]
    )
  }

  return (
    <Screen
      scroll={false}
      footer={
        <Button
          title={syncing ? 'Syncing…' : 'Sync Surveys'}
          variant="secondary"
          loading={syncing}
          onPress={() => void surveySyncEngine.syncNow().then(reload)}
        />
      }
    >
      <FlatList
        data={list}
        keyExtractor={d => d.localId}
        ListEmptyComponent={
          <Empty text="No site survey drafts on this phone. Tap 'Start New Site Survey' on the Home tab to begin." />
        }
        renderItem={({ item: d }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Long-press to delete draft"
            onPress={() => open(d)}
            onLongPress={() => del(d)}
            style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
              <Text style={{ fontSize: font.large, fontWeight: '800', flex: 1 }}>
                {d.customerName || 'Untitled Site Survey'}
              </Text>
              <StateBadge state={d.syncState} />
            </View>
            <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 2 }}>
              {d.siteAddress || 'No address specified'}
              {d.surveyNumber ? ` · ${d.surveyNumber}` : ''}
              {' · '}edited {new Date(d.localUpdatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
            {d.lastError && (
              <Text style={{ color: colors.danger, fontSize: font.small, marginTop: 2, fontWeight: '600' }} numberOfLines={3}>
                {d.lastError}
              </Text>
            )}
          </Pressable>
        )}
      />
      <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: space.sm }}>
        Tap to resume editing. Long-press a draft to delete it.
      </Text>
    </Screen>
  )
}
