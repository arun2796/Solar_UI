import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../../lib/api'
import { assignedTasksCache, surveyDrafts } from '../../../../db'
import { authStore, currentEngineerName } from '../../../../lib/auth'
import { getCurrentGps } from '../../../../lib/photoService'
import {
  defaultSurveySections,
  type AssignedSurveyTask,
  type CustomerType,
  type SiteType,
} from '../../../../lib/surveyTypes'
import { generateUuid } from '../../../../lib/types'
import { Button, Card, Empty, Screen, StateBadge, Title } from '../../../../components/ui'
import { colors, font, space, touch } from '../../../../theme'

export default function AssignedTaskDetailScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const taskId = Array.isArray(params.id) ? params.id[0] : params.id || ''

  const user = authStore.get()
  const engineerName = currentEngineerName()

  const [starting, setStarting] = useState(false)
  const [cachedTask, setCachedTask] = useState<AssignedSurveyTask | null>(null)
  const [existingDraftLocalId, setExistingDraftLocalId] = useState<string | null>(null)

  // 1. Fetch from server, fallback to local cache
  const taskQuery = useQuery({
    queryKey: ['survey-task', taskId],
    queryFn: async () => {
      try {
        const remote = await api.surveys.get(taskId)
        if (remote) {
          await assignedTasksCache.put([remote])
          return remote as AssignedSurveyTask
        }
      } catch {
        // offline or remote error, fallback to cache
      }
      const local = await assignedTasksCache.get(taskId)
      if (local) return local
      throw new Error('Assigned task details could not be loaded.')
    },
    staleTime: 30_000,
  })

  // 2. Load cached task immediately
  useEffect(() => {
    void assignedTasksCache.get(taskId).then(t => {
      if (t) setCachedTask(t)
    })
  }, [taskId])

  // 3. Check if local draft already exists for this task
  useEffect(() => {
    if (!taskId) return
    void surveyDrafts.findByServerId(taskId, user.userId).then(d => {
      if (d) setExistingDraftLocalId(d.localId)
    })
  }, [taskId, user.userId])

  const task: AssignedSurveyTask | null = taskQuery.data || cachedTask

  const handleCall = (phoneNumber?: string) => {
    if (!phoneNumber) {
      Alert.alert('No Phone', 'No contact phone number is available for this site.')
      return
    }
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '')
    const url = `tel:${cleanPhone}`
    Linking.canOpenURL(url)
      .then(supported => {
        if (!supported) {
          Alert.alert('Calling Unavailable', `Cannot place a call from this device to ${phoneNumber}.`)
        } else {
          void Linking.openURL(url)
        }
      })
      .catch(() => {
        Alert.alert('Error', `Could not dial ${phoneNumber}.`)
      })
  }

  const handleOpenMaps = (address?: string, customUrl?: string, lat?: number | null, lng?: number | null) => {
    if (customUrl) {
      void Linking.openURL(customUrl).catch(() => {
        Alert.alert('Error', 'Could not open the map link.')
      })
      return
    }

    let url = ''
    if (lat != null && lng != null) {
      const scheme = Platform.select({ ios: 'maps:', android: 'geo:' })
      url = Platform.OS === 'ios'
        ? `maps://?q=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}`
    } else if (address) {
      const query = encodeURIComponent(address)
      url = `https://www.google.com/maps/search/?api=1&query=${query}`
    } else {
      Alert.alert('No Location', 'No address or GPS coordinates specified.')
      return
    }

    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open map application.')
    })
  }

  const handleStartSurvey = async () => {
    if (!task) return

    // If draft already exists locally, directly resume it
    if (existingDraftLocalId) {
      router.push(`/(app)/surveys/${existingDraftLocalId}`)
      return
    }

    setStarting(true)
    try {
      // 1. Double check again if draft was created in parallel
      const alreadyDraft = await surveyDrafts.findByServerId(task.id, user.userId)
      if (alreadyDraft) {
        setExistingDraftLocalId(alreadyDraft.localId)
        router.push(`/(app)/surveys/${alreadyDraft.localId}`)
        return
      }

      // 2. Notify backend to transition status to 'draft' (safe to repeat; returns 200 with SurveyDto)
      let serverSurvey = task
      try {
        serverSurvey = await api.surveys.start(task.id)
      } catch (err: any) {
        // If offline or network glitch, still allow engineer to proceed locally
        console.warn('Backend start endpoint call failed, proceeding offline', err)
      }

      // 3. Pre-fill survey form fields
      const isCommercial = task.customerType === 'Commercial'
      const customerDisplayName = isCommercial
        ? (task.companyName || task.contactPerson || 'Commercial Client')
        : (task.contactPerson || task.companyName || 'Residential Client')

      // Customer type mapping: Individual -> Residential, Commercial -> Commercial
      const mappedCustomerType: CustomerType = isCommercial ? 'Commercial' : 'Residential'

      // Check current GPS (attempt capture without blocking indefinitely)
      let capturedGps = null
      try {
        capturedGps = await getCurrentGps()
      } catch {
        // GPS permission / timeout fallback
      }

      const sections = defaultSurveySections(engineerName)

      // Section 0
      sections.section0.customerName = customerDisplayName
      sections.section0.siteAddress = task.siteAddress || ''
      sections.section0.visitDate = task.plannedVisitDate || new Date().toISOString().slice(0, 10)
      sections.section0.siteType = (task.siteType as SiteType) || 'commercial'
      sections.section0.gpsLat = capturedGps?.lat ?? task.gpsLatitude ?? null
      sections.section0.gpsLng = capturedGps?.lng ?? task.gpsLongitude ?? null
      sections.section0.engineerName = engineerName

      // Section 1
      sections.section1.contactPerson = task.contactPerson || ''
      sections.section1.contactPhone = task.contactPhone || ''
      sections.section1.customerType = mappedCustomerType

      const localId = generateUuid()
      const surveyVersion = (serverSurvey as any)?.version || (task as any)?.version || 1

      await surveyDrafts.create({
        localId,
        ownerUserId: user.userId,
        serverId: task.id,
        surveyNumber: task.surveyRef,
        version: surveyVersion,
        customerName: customerDisplayName,
        siteAddress: task.siteAddress || '',
        sections,
      })

      // Update cached task status locally
      const updatedTask: AssignedSurveyTask = { ...task, status: 'draft' }
      await assignedTasksCache.put([updatedTask])

      // Navigate to the survey form screen
      router.replace(`/(app)/surveys/${localId}`)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not start survey form.')
    } finally {
      setStarting(false)
    }
  }

  if (taskQuery.isLoading && !task) {
    return (
      <Screen>
        <View style={{ padding: space.xl, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: space.md, color: colors.muted }}>Loading task details…</Text>
        </View>
      </Screen>
    )
  }

  if (!task) {
    return (
      <Screen>
        <Empty text="Task not found or failed to load." />
        <Button title="← Back to Home" variant="secondary" onPress={() => router.replace('/(app)/(tabs)')} />
      </Screen>
    )
  }

  const isCommercial = task.customerType === 'Commercial'
  const primaryTitle = isCommercial
    ? (task.companyName || task.contactPerson || 'Commercial Site')
    : (task.contactPerson || task.companyName || 'Individual Customer')

  const isCompleted = task.status === 'submitted' || task.status === 'reviewed' || task.status === 'won'
  const hasLocalDraft = !!existingDraftLocalId

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          {isCompleted ? (
            <Button
              title="View Submitted Survey →"
              variant="secondary"
              onPress={() => router.push(`/(app)/surveys/${existingDraftLocalId || task.id}`)}
            />
          ) : hasLocalDraft ? (
            <Button
              title="Continue Survey Form →"
              onPress={handleStartSurvey}
              loading={starting}
            />
          ) : (
            <Button
              title="☀️  Start Survey"
              onPress={handleStartSurvey}
              loading={starting}
            />
          )}
        </View>
      }
    >
      {/* Header Banner */}
      <View style={{ marginBottom: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: font.small, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
            {task.surveyRef}
          </Text>
          <StateBadge state={task.status} />
        </View>
        <Text style={{ fontSize: font.title, fontWeight: '800', color: colors.text }}>
          {primaryTitle}
        </Text>
        {isCommercial && task.contactPerson ? (
          <Text style={{ fontSize: font.base, color: colors.muted, marginTop: 2 }}>
            Contact: <Text style={{ fontWeight: '700', color: colors.text }}>{task.contactPerson}</Text>
          </Text>
        ) : null}
      </View>

      {/* Engineer Assignment Verification */}
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primaryDark, textTransform: 'uppercase' }}>
          Assigned Survey Engineer
        </Text>
        <Text style={{ fontSize: font.large, fontWeight: '800', color: colors.primaryDark, marginTop: 2 }}>
          {engineerName}
        </Text>
        <Text style={{ fontSize: 12, color: colors.primaryDark, marginTop: 2 }}>
          Assigned to your engineer account by operations
        </Text>
      </Card>

      {/* Contact & Calling Card */}
      <Card>
        <Text style={{ fontSize: font.base, fontWeight: '800', color: colors.text, marginBottom: space.sm }}>
          Customer & Contact
        </Text>

        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: font.small }}>Customer Type</Text>
            <Text style={{ fontWeight: '700', fontSize: font.base, color: colors.text }}>
              {task.customerType || 'Commercial'}
            </Text>
          </View>

          {isCommercial && task.companyName ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: font.small }}>Company Name</Text>
              <Text style={{ fontWeight: '700', fontSize: font.base, color: colors.text, flex: 1, textAlign: 'right' }}>
                {task.companyName}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: font.small }}>Contact Person</Text>
            <Text style={{ fontWeight: '700', fontSize: font.base, color: colors.text }}>
              {task.contactPerson || '—'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: font.small }}>Phone Number</Text>
              <Text style={{ fontWeight: '800', fontSize: font.base, color: colors.primaryDark }}>
                {task.contactPhone || '—'}
              </Text>
            </View>
            {task.contactPhone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call contact person"
                onPress={() => handleCall(task.contactPhone)}
                style={{
                  minHeight: 46,
                  paddingHorizontal: space.md,
                  backgroundColor: colors.good,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: font.small }}>
                  📞 Call
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Site Location & Maps Card */}
      <Card>
        <Text style={{ fontSize: font.base, fontWeight: '800', color: colors.text, marginBottom: space.sm }}>
          Site Location
        </Text>

        <View style={{ gap: space.sm }}>
          <View>
            <Text style={{ color: colors.muted, fontSize: font.small }}>Site Address</Text>
            <Text style={{ fontWeight: '600', fontSize: font.base, color: colors.text, marginTop: 2 }}>
              {task.siteAddress || 'No address specified'}
            </Text>
            {task.cityArea ? (
              <Text style={{ fontSize: font.small, color: colors.muted, marginTop: 2 }}>
                Area / City: {task.cityArea}
              </Text>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: font.small }}>Site Type</Text>
            <Text style={{ fontWeight: '700', fontSize: font.base, textTransform: 'capitalize', color: colors.text }}>
              {task.siteType ? String(task.siteType).replace('_', ' ') : 'Commercial'}
            </Text>
          </View>

          {(task.siteAddress || task.googleMapsUrl || task.gpsLatitude) ? (
            <View style={{ marginTop: space.xs }}>
              <Button
                title="🗺️  Open in Google Maps"
                variant="secondary"
                onPress={() => handleOpenMaps(task.siteAddress, task.googleMapsUrl, task.gpsLatitude, task.gpsLongitude)}
              />
            </View>
          ) : null}
        </View>
      </Card>

      {/* Planned Visit & Assignment Notes */}
      <Card>
        <Text style={{ fontSize: font.base, fontWeight: '800', color: colors.text, marginBottom: space.sm }}>
          Visit Schedule & Notes
        </Text>

        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: font.small }}>Planned Visit Date</Text>
            <Text style={{ fontWeight: '800', fontSize: font.base, color: colors.primaryDark }}>
              {task.plannedVisitDate || 'Not specified'}
            </Text>
          </View>

          {task.assignmentNotes ? (
            <View style={{ marginTop: space.xs }}>
              <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: 4 }}>
                Admin Notes for Engineer:
              </Text>
              <View style={{ backgroundColor: colors.surface, padding: space.md, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: font.small, color: colors.text, lineHeight: 22 }}>
                  {task.assignmentNotes}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: font.small, color: colors.muted, fontStyle: 'italic' }}>
              No special instructions provided by admin.
            </Text>
          )}
        </View>
      </Card>

      {/* Status Notice */}
      {hasLocalDraft && (
        <View style={{ backgroundColor: colors.warnSoft, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.warn, marginBottom: space.lg }}>
          <Text style={{ fontSize: font.small, fontWeight: '800', color: colors.warn }}>
            Draft in progress on this device
          </Text>
          <Text style={{ fontSize: 13, color: colors.warn, marginTop: 2 }}>
            You have already started this survey. Tap "Continue Survey Form" below to resume where you left off.
          </Text>
        </View>
      )}
    </Screen>
  )
}
