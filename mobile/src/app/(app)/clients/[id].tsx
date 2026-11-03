import { useEffect, useState } from 'react'
import { Alert, Text } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '../../../lib/api'
import { clientsCache, drafts } from '../../../db'
import { currentUserId } from '../../../lib/auth'
import { addDays, amcLabel, fmtDate, generateUuid, todayIso, type Client } from '../../../lib/types'
import { Button, Card, Loading, Row, Screen, Title } from '../../../components/ui'
import { colors, font } from '../../../theme'

export default function ClientDetails() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter()
  const [c, setC] = useState<Client | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)   // set when today's visit is assigned to another engineer
  useEffect(() => {
    clientsCache.get(id).then(x => x && setC(x)); api.client(id).then(x => { setC(x); void clientsCache.put([x]) }).catch(() => {})
    // Offline the check is skipped: the server refuses the draft on sync and Drafts shows the same message.
    api.assignmentCheck(id).then(r => setBlocked(r.canStart ? null : r.message ?? 'This visit is assigned to another engineer.')).catch(() => {})
  }, [id])

  const start = async () => {
    if (!c || blocked) return
    const owner = currentUserId(); if (!owner) return
    const existing = (await drafts.all(owner)).find(d => d.clientId === c.id && !['submitted', 'elsewhere'].includes(d.syncState))
    if (existing) { Alert.alert('Draft exists', `A draft for ${c.name} (visit ${fmtDate(existing.fields.visitDate)}) is already open.`, [{ text: 'Open draft', onPress: () => router.push(`/(app)/reports/${existing.localId}/review`) }, { text: 'Start new', onPress: () => void create() }, { text: 'Cancel', style: 'cancel' }]); return }
    await create()
  }
  const create = async () => {
    if (!c) return
    const visit = todayIso()
    const owner = currentUserId(); if (!owner) return
    const d = await drafts.create({ localId: generateUuid(), ownerUserId: owner, clientId: c.id, clientName: c.name, fields: { visitDate: visit, previousMaintenanceDate: c.previousMaintenanceDate ?? null, technicianCount: 1, nextVisitDate: addDays(visit, 90) } })
    router.replace(`/(app)/reports/${d.localId}/section/1`)
  }
  if (!c) return <Screen><Loading /></Screen>
  return <Screen footer={<Button title={blocked ? 'Assigned to another engineer' : 'Start maintenance'} onPress={start} disabled={!!blocked} />}>
    <Title sub={c.siteLocation ?? c.address ?? undefined}>{c.name}</Title>
    {blocked && <Card style={{ borderColor: colors.warn, backgroundColor: colors.warnSoft }}><Text accessibilityRole="alert" style={{ color: colors.warn, fontWeight: '700', fontSize: font.base }}>{blocked}</Text></Card>}
    <Card><Text style={s.h}>Contact</Text><Row k="Contact person" v={c.contactPerson} /><Row k="Phone" v={c.phone} /><Row k="Address" v={c.address} /></Card>
    <Card><Text style={s.h}>Installation</Text><Row k="Solar capacity" v={c.solarCapacityKwp ? `${c.solarCapacityKwp} kWp` : undefined} />
      <Row k="Modules" v={[c.moduleMake, c.moduleModel].filter(Boolean).join(' ') || undefined} /><Row k="Module count / W" v={c.moduleCount ? `${c.moduleCount} × ${c.moduleWattage ?? '?'} W` : undefined} />
      <Row k="Inverter" v={[c.inverterMake, c.inverterModel, c.inverterCapacityKw ? `${c.inverterCapacityKw} kW` : null].filter(Boolean).join(' ') || undefined} /><Row k="Installed" v={fmtDate(c.installationDate)} /></Card>
    <Card><Text style={s.h}>Maintenance and AMC</Text><Row k="Previous maintenance" v={fmtDate(c.previousMaintenanceDate)} /><Row k="Next due" v={fmtDate(c.nextDueDate)} /><Row k="AMC status" v={amcLabel(c.amcStatus)} /><Row k="AMC expiry" v={fmtDate(c.amcExpiryDate)} /></Card>
  </Screen>
}
const s = { h: { fontSize: font.large, fontWeight: '700' as const, marginBottom: 6, color: colors.text } }
