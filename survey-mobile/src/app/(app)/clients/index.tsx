import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { api } from '../../../lib/api'
import { clientsCache } from '../../../db'
import type { Client } from '../../../lib/types'
import { fmtDate } from '../../../lib/types'
import { Empty, Input, Screen } from '../../../components/ui'
import { colors, font, space } from '../../../theme'

export default function ClientSearch() {
  const router = useRouter()
  const [all, setAll] = useState<Client[]>([]); const [q, setQ] = useState(''); const [source, setSource] = useState<'server' | 'cache'>('cache')
  useFocusEffect(useCallback(() => { clientsCache.all().then(setAll) }, []))
  useEffect(() => { api.allClients().then(list => { setAll(list); setSource('server'); void clientsCache.replaceAll(list) }).catch(() => setSource('cache')) }, [])
  const term = q.trim().toLowerCase()
  const list = all.filter(c => c.isActive !== false && (!term || c.name.toLowerCase().includes(term) || (c.siteLocation ?? '').toLowerCase().includes(term) || (c.contactPerson ?? '').toLowerCase().includes(term)))
  return <Screen scroll={false}>
    <Input placeholder="Search client, site or contact" value={q} onChangeText={setQ} accessibilityLabel="Search clients" autoCorrect={false} />
    <Text style={{ color: colors.muted, fontSize: 13, marginVertical: space.sm }}>{list.length} clients · {source === 'server' ? 'live' : 'from device cache'}</Text>
    <FlatList data={list} keyExtractor={c => c.id} ListEmptyComponent={<Empty text={all.length ? 'No client matches.' : 'No clients cached yet. Connect once to download the client list.'} />}
      renderItem={({ item: c }) => <Pressable accessibilityRole="button" onPress={() => router.push(`/(app)/clients/${c.id}`)} style={{ minHeight: 56, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: font.large, fontWeight: '700' }}>{c.name}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted, fontSize: font.small }}>{c.siteLocation ?? c.address ?? ''}{c.solarCapacityKwp ? ` · ${c.solarCapacityKwp} kWp` : ''}</Text><Text style={{ color: colors.muted, fontSize: font.small }}>{c.nextDueDate ? `Due ${fmtDate(c.nextDueDate)}` : 'No visit yet'}</Text></View></Pressable>} />
  </Screen>
}
