import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { clientsCache, surveyDrafts } from '../../../db'
import { authStore, currentEngineerName } from '../../../lib/auth'
import { getCurrentGps } from '../../../lib/photoService'
import { defaultSurveySections, type SiteType } from '../../../lib/surveyTypes'
import { generateUuid, type Client } from '../../../lib/types'
import { Button, Card, Field, Input, Screen, Title, Toggle } from '../../../components/ui'
import { colors, font, space } from '../../../theme'

export default function NewSurveyScreen({ onCreated }: { onCreated?: (localId: string) => void } = {}) {
  const router = useRouter()
  const user = authStore.get()
  const engineerName = currentEngineerName()

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10))
  const [siteType, setSiteType] = useState<SiteType>('commercial')
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [fetchingGps, setFetchingGps] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void clientsCache.all().then(list => {
      setClients(list)
      if (list.length > 0 && !selectedClient) {
        setSelectedClient(list[0])
        setCustomerName(list[0].name)
        setSiteAddress(list[0].address || list[0].siteLocation || '')
      }
    })
    // Auto-capture GPS on start
    void handleCaptureGps()
  }, [])

  const handleCaptureGps = async () => {
    setFetchingGps(true)
    const pos = await getCurrentGps()
    if (pos) {
      setGps(pos)
    }
    setFetchingGps(false)
  }

  const handleClientSelect = (c: Client) => {
    setSelectedClient(c)
    setCustomerName(c.name)
    setSiteAddress(c.address || c.siteLocation || '')
  }

  const handleCreate = async () => {
    const finalCustName = customerName.trim()
    const finalAddr = siteAddress.trim()

    if (!finalCustName) {
      Alert.alert('Required Field', 'Please enter or select a customer name.')
      return
    }

    if (!finalAddr) {
      Alert.alert('Required Field', 'Please enter the site address.')
      return
    }

    setSaving(true)
    try {
      const localId = generateUuid()
      const sections = defaultSurveySections(engineerName)

      sections.section0.customerName = finalCustName
      sections.section0.siteAddress = finalAddr
      sections.section0.visitDate = visitDate
      sections.section0.siteType = siteType
      sections.section0.gpsLat = gps?.lat ?? null
      sections.section0.gpsLng = gps?.lng ?? null
      sections.section0.clientId = mode === 'existing' && selectedClient ? selectedClient.id : null

      if (mode === 'existing' && selectedClient) {
        sections.section1.contactPerson = selectedClient.contactPerson || ''
        sections.section1.contactPhone = selectedClient.phone || ''
        sections.section1.contactEmail = selectedClient.email || ''
      }

      await surveyDrafts.create({
        localId,
        ownerUserId: user.userId,
        customerName: finalCustName,
        siteAddress: finalAddr,
        sections,
      })

      if (onCreated) {
        onCreated(localId)
      } else {
        router.replace(`/(app)/surveys/${localId}`)
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not start survey.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      footer={
        <Button
          title={saving ? 'Starting survey…' : 'Continue to Survey Form →'}
          loading={saving}
          onPress={handleCreate}
        />
      }
    >
      <Title sub="Section 0: Initial Site & Customer Setup">Start Site Survey</Title>

      {/* Read-only Engineer Attribution */}
      <Card>
        <Text style={{ fontSize: font.small, color: colors.muted }}>Assigned Sales Engineer</Text>
        <Text style={{ fontSize: font.large, fontWeight: '800', color: colors.primaryDark }}>
          {engineerName}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
          Engineer identity verified from current session login
        </Text>
      </Card>

      {/* Customer Mode Selection */}
      <View style={{ marginBottom: space.md }}>
        <Text style={{ fontSize: font.base, fontWeight: '700', marginBottom: space.sm }}>
          Customer Selection
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMode('existing')}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: mode === 'existing' ? colors.primary : colors.border,
              backgroundColor: mode === 'existing' ? colors.primarySoft : colors.bg,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontWeight: '800',
                color: mode === 'existing' ? colors.primary : colors.muted,
              }}
            >
              Pick Existing Client
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode('new')
              setSelectedClient(null)
              setCustomerName('')
              setSiteAddress('')
            }}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: mode === 'new' ? colors.primary : colors.border,
              backgroundColor: mode === 'new' ? colors.primarySoft : colors.bg,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontWeight: '800',
                color: mode === 'new' ? colors.primary : colors.muted,
              }}
            >
              New Customer
            </Text>
          </Pressable>
        </View>
      </View>

      {mode === 'existing' && (
        <Card>
          <Text style={{ fontSize: font.base, fontWeight: '700', marginBottom: space.sm }}>
            Select Client ({clients.length} cached)
          </Text>
          {clients.length === 0 ? (
            <Text style={{ color: colors.muted }}>No clients cached yet. Enter details manually below.</Text>
          ) : (
            <View style={{ maxHeight: 180, gap: space.xs }}>
              {clients.slice(0, 10).map(c => {
                const isSelected = selectedClient?.id === c.id
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => handleClientSelect(c)}
                    style={{
                      padding: space.sm,
                      borderRadius: 6,
                      backgroundColor: isSelected ? colors.primarySoft : colors.surface,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontWeight: '700', color: isSelected ? colors.primary : colors.text }}>
                      {c.name}
                    </Text>
                    {c.siteLocation && (
                      <Text style={{ fontSize: font.small, color: colors.muted }}>{c.siteLocation}</Text>
                    )}
                  </Pressable>
                )
              })}
            </View>
          )}
        </Card>
      )}

      {/* Customer Name & Site Address */}
      <Field label="Customer / Company Name">
        <Input
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="e.g. Green Meadows Residency"
        />
      </Field>

      <Field label="Site Address">
        <Input
          value={siteAddress}
          onChangeText={setSiteAddress}
          multiline
          placeholder="Full address where solar will be installed"
        />
      </Field>

      <Field label="Date of Visit">
        <Input value={visitDate} onChangeText={setVisitDate} placeholder="YYYY-MM-DD" />
      </Field>

      {/* GPS Coordinates */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: font.base, fontWeight: '700' }}>GPS Coordinates</Text>
            {gps ? (
              <Text style={{ color: colors.good, fontWeight: '700', marginTop: 2 }}>
                ✓ {gps.lat}, {gps.lng}
              </Text>
            ) : (
              <Text style={{ color: colors.muted, fontSize: font.small, marginTop: 2 }}>
                No GPS captured yet
              </Text>
            )}
          </View>
          <Button
            title={fetchingGps ? 'Locating…' : gps ? 'Re-capture GPS' : 'Auto-capture GPS'}
            variant="secondary"
            loading={fetchingGps}
            onPress={handleCaptureGps}
          />
        </View>
      </Card>

      {/* Site Type */}
      <Field label="Site Type">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {[
            ['commercial', 'Commercial'],
            ['gated_community', 'Gated Community'],
            ['industrial', 'Industrial'],
            ['maintenance', 'Maintenance'],
          ].map(([val, label]) => {
            const isSel = siteType === val
            return (
              <Pressable
                key={val}
                onPress={() => setSiteType(val as SiteType)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: isSel ? colors.primary : colors.border,
                  backgroundColor: isSel ? colors.primarySoft : colors.bg,
                }}
              >
                <Text
                  style={{
                    fontSize: font.small,
                    fontWeight: '700',
                    color: isSel ? colors.primary : colors.text,
                  }}
                >
                  {isSel ? '✓ ' : ''}
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Field>
    </Screen>
  )
}
