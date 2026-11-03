import { useState } from 'react'
import { Alert, Text } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { api, errorMessage, problemOf } from '../../../lib/api'
import { authStore, signOut } from '../../../lib/auth'
import { config } from '../../../lib/config'
import { syncStore } from '../../../lib/store'
import { surveyDrafts } from '../../../db'
import { Button, Card, Field, Input, Row, Screen, Title } from '../../../components/ui'
import { colors, font, space } from '../../../theme'

export default function Profile() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const lastSync = syncStore.use(s => s.lastSyncAt); const net = syncStore.use(s => s.net)
  const isDev = authStore.use(s => s.dev); const owner = authStore.use(s => s.userId)
  const [curPw, setCurPw] = useState(''); const [pw, setPw] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const changePw = async () => {
    setMsg(null)
    if (!curPw) return setMsg('Enter your current password')
    if (pw.length < 8) return setMsg('The new password needs at least 8 characters')
    setBusy(true)
    try { await api.auth.changePassword(curPw, pw); setMsg('Password changed'); setCurPw(''); setPw('') }
    catch (e) { const errs = problemOf(e).errors; setMsg(errs ? Object.values(errs).flat().join(' ') : errorMessage(e)) }
    finally { setBusy(false) }
  }
  const logout = async () => {
    const mine = owner ? await surveyDrafts.all(owner) : []
    if (mine.some(d => d.syncState === 'submitting')) {
      Alert.alert('Submission in progress', 'A survey is still being submitted. Stay signed in until it shows Submitted, otherwise it cannot finish.')
      return
    }
    const unsynced = owner ? await surveyDrafts.countUnsynced(owner) : 0
    Alert.alert('Sign out?', unsynced
      ? `${unsynced} survey draft(s) are NOT fully on the server. They stay on this phone and will sync after YOU sign in again.`
      : 'Your surveys are safely stored.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void signOut() }])
  }
  return <Screen>
    <Title sub={me.data?.email ?? ''}>{me.data?.engineerName ?? 'Engineer'}</Title>
    <Card><Row k="Role" v={me.data?.role} /><Row k="Connection" v={net} /><Row k="Last sync" v={lastSync ? new Date(lastSync).toLocaleTimeString('en-IN') : '—'} /><Row k="App version" v={Constants.expoConfig?.version} /><Row k="API" v={config.apiUrl.replace(/^https?:\/\//, '')} /></Card>
    {isDev && <Card style={{ borderColor: colors.warn, backgroundColor: colors.warnSoft }}><Text style={{ fontWeight: '800', color: colors.warn }}>Developer sign-in (local testing)</Text></Card>}
    {!isDev && <Card><Text style={{ fontWeight: '800', fontSize: font.large, marginBottom: space.sm }}>Change password</Text>
      <Field label="Current password"><Input value={curPw} onChangeText={setCurPw} secureTextEntry autoComplete="current-password" /></Field>
      <Field label="New password"><Input value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" /></Field>
      {msg && <Text style={{ color: colors.muted, marginBottom: space.sm }}>{msg}</Text>}<Button title="Update password" variant="secondary" onPress={changePw} loading={busy} /></Card>}
    <Button title="Sign out" variant="danger" onPress={logout} />
  </Screen>
}
