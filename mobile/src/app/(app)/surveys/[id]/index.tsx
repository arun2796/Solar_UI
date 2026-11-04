import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { SignaturePad } from '../../../../components/SignaturePad'
import {
  Button,
  Card,
  Field,
  Input,
  Loading,
  NotFound,
  NumberInput,
  Progress,
  Screen,
  StateBadge,
  Toggle,
} from '../../../../components/ui'
import { surveyDrafts } from '../../../../db'
import { useSurveyDraft } from '../../../../forms/useSurveyDraft'
import { captureOrPickPhoto, getCurrentGps } from '../../../../lib/photoService'
import { tariffRate } from '../../../../lib/surveyCalculator'
import { currentSurveySettings, mandatoryPhotos, PHOTO_LABELS } from '../../../../lib/surveySettings'
import type {
  CableRouteItem,
  CustomerType,
  InstallationType,
  MaterialAccess,
  ObstructionAreaItem,
  PhaseType,
  RoofCondition,
  RoofOrientation,
  SiteType,
  SurveyVerdict,
  TariffCategory,
  TiltType,
} from '../../../../lib/surveyTypes'
import { scheduleSurveySync } from '../../../../sync/surveySyncEngine'
import { colors, font, space } from '../../../../theme'
import NewSurveyScreen from '../new'

const SECTION_TITLES = [
  'Site & Customer Info',
  'Customer Details',
  'Electricity & Tariff',
  'Roof Assessment',
  'Shadow Analysis',
  'Electrical Infra',
  'Feasibility & Logistics',
  'Photos & Documents',
  'Signatures & Remarks',
  'Summary & Verdict',
]

export default function SurveyFormScreen() {
  const router = useRouter()
  const nav = useNavigation()
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id
  const [createdId, setCreatedId] = useState<string | null>(null)
  const id = createdId || rawId || ''

  const scrollRef = useRef<any>(null)
  const [currentSection, setCurrentSection] = useState<number>(1)
  const [saved, setSaved] = useState(false)
  const [checklistVisible, setChecklistVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [drawing, setDrawing] = useState(false)

  const {
    draft,
    loading,
    locked,
    sections,
    overrides,
    calculations,
    photos,
    setSection,
    setOverrides,
    setSignature,
    addPhoto,
    removePhoto,
    flush,
  } = useSurveyDraft(id)

  const saveExitRef = useRef<() => void>(() => {})

  const saveExit = async () => {
    await flush()
    setSaved(true)
    scheduleSurveySync(200)
    router.replace('/(app)/site-surveys')
  }
  saveExitRef.current = () => {
    void saveExit()
  }

  useEffect(() => {
    nav.setOptions({
      title: `${currentSection}. ${SECTION_TITLES[currentSection - 1] || 'Survey'}`,
      headerRight: () =>
        draft && !locked ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => saveExitRef.current()}
            hitSlop={12}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: font.base }}>
              {saved ? 'Saved ✓' : 'Save & exit'}
            </Text>
          </Pressable>
        ) : null,
    })
  }, [nav, currentSection, draft, locked, saved])

  if (id === 'new') {
    return (
      <NewSurveyScreen
        onCreated={(newId) => {
          setCreatedId(newId)
          router.replace(`/(app)/surveys/${newId}`)
        }}
      />
    )
  }

  if (loading) return <Loading />
  if (!draft || !sections) {
    return <NotFound text="This survey was not found on this phone." onBack={() => router.replace('/(app)/site-surveys')} />
  }

  const s0 = sections.section0
  const s1 = sections.section1
  const s2 = sections.section2
  const s3 = sections.section3
  const s4 = sections.section4
  const s5 = sections.section5
  const s6 = sections.section6
  const s7 = sections.section7
  const s8 = sections.section8
  const s9 = sections.section9

  // Section completion checks: a section is Done only when its required fields are filled (brief, Rules).
  const required = mandatoryPhotos(s0.siteType)
  const hasPhoto = (tag: string) => photos.some((p: { section: string }) => p.section === tag)
  const missingPhotos = required.filter(t => !hasPhoto(t))
  const sunEntered = [s4.sunHours8to10, s4.sunHours10to2, s4.sunHours2to5].some(h => h != null)
  const isS0Done = !!(s0.customerName && s0.siteAddress && s0.siteType)
  const isS1Done = !!(s1.contactPerson && /^[6-9]\d{9}$/.test(s1.contactPhone || '') && s1.customerType)
  const isS2Done = !!(s2.tariffCategory && (s2.history24MonthsUnits ?? 0) > 0 && s2.ebServiceNumbers?.some(Boolean)
    && (!required.includes('eb_bill') || hasPhoto('eb_bill')))
  const isS3Done = !!(s3.installationType && (s3.availableAreaSqft || (s3.roofLengthFt && s3.roofWidthFt)) && s3.roofCondition
    && s3.waterproofingStatus && (!required.includes('roof') || hasPhoto('roof')))
  const isS4Done = s4.shadowObserved !== undefined && sunEntered && (!s4.shadowObserved || s4.shadowAreaPercent != null)
  const isS5Done = !!(s5.mdbLocation && s5.ebMeterLocation && s5.cableRoutes?.some(r => r.lengthM > 0)
    && (!required.includes('panel_mdb') || hasPhoto('panel_mdb')) && (!required.includes('eb_meter') || hasPhoto('eb_meter')))
  const isS6Done = !!(s6.mountingStructure && s6.cableRouteFeasible !== undefined)
  const isS7Done = missingPhotos.length === 0
  const isS8Done = !!(draft.engineerSigUri && draft.customerSigUri && (s8.customerRepName?.trim() || s1.contactPerson))
  const isS9Done = !!s9.verdict

  const doneSteps = [
    isS0Done,
    isS1Done,
    isS2Done,
    isS3Done,
    isS4Done,
    isS5Done,
    isS6Done,
    isS7Done,
    isS8Done,
    isS9Done,
  ]
  const incompleteSteps = doneSteps.map(d => !d)

  // Photo capture handler
  const handlePhotoAction = async (sectionTag: string, source: 'camera' | 'library') => {
    if (locked) return
    setUploadingPhoto(true)
    try {
      const captured = await captureOrPickPhoto({
        source,
        section: sectionTag,
        surveyNumber: draft.surveyNumber,
        gps: s0.gpsLat && s0.gpsLng ? { lat: s0.gpsLat, lng: s0.gpsLng } : null,
      })
      if (captured) {
        await addPhoto(captured)

        // Auto-check corresponding checklist items
        if (sectionTag === 'eb_bill') {
          setSection('section7', { checklist: { ...s7.checklist, ebBill: true } })
        } else if (sectionTag === 'roof') {
          setSection('section7', { checklist: { ...s7.checklist, roofPhotos: true } })
        } else if (sectionTag === 'panel_mdb' || sectionTag === 'eb_meter') {
          setSection('section7', { checklist: { ...s7.checklist, panelPhoto: true } })
        } else if (sectionTag === 'id_proof') {
          setSection('section7', { checklist: { ...s7.checklist, idProof: true } })
        }
      }
    } catch (e: any) {
      Alert.alert('Photo Error', e.message || 'Could not attach photo.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Pre-submission validation
  const validateForSubmission = (): { ok: boolean; issues: { section: number; text: string }[] } => {
    const issues: { section: number; text: string }[] = []

    if (!s0.customerName || !s0.siteAddress) {
      issues.push({ section: 1, text: 'Customer name and site address are required (Section 1).' })
    }
    if (!s1.contactPerson) {
      issues.push({ section: 2, text: 'Contact person name is required (Section 2).' })
    }
    if (!s1.contactPhone || !/^[6-9]\d{9}$/.test(s1.contactPhone)) {
      issues.push({ section: 2, text: 'Valid 10-digit Indian phone number starting with 6-9 is required (Section 2).' })
    }
    if (s1.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s1.contactEmail)) {
      issues.push({ section: 2, text: 'Contact email format is invalid (Section 2).' })
    }
    if (!s3.availableAreaSqft && (!s3.roofLengthFt || !s3.roofWidthFt)) {
      issues.push({ section: 4, text: 'Available roof area or roof dimensions are required (Section 4).' })
    }
    if (!draft.engineerSigUri) {
      issues.push({ section: 9, text: 'Engineer signature is required (Section 9).' })
    }
    if (!draft.customerSigUri) {
      issues.push({ section: 9, text: 'Customer signature is required (Section 9).' })
    }
    if (missingPhotos.length > 0) {
      issues.push({ section: 8, text: `Mandatory photos missing: ${missingPhotos.map(t => PHOTO_LABELS[t]).join(', ')} (Section 8).` })
    }
    if (!(s8.customerRepName?.trim() || s1.contactPerson)) {
      issues.push({ section: 9, text: 'Name of the customer representative who signs is required (Section 9).' })
    }
    if (!s9.verdict) {
      issues.push({ section: 10, text: 'Survey verdict (Feasible / Conditional / Not Feasible) is MANDATORY (Section 10).' })
    }
    if ((overrides?.capacityKw || overrides?.numberOfPanels) && (!overrides.overrideReason || overrides.overrideReason.trim().length < 5)) {
      issues.push({ section: 10, text: 'Override reason (minimum 5 characters) is required when manual overrides are applied (Section 10).' })
    }

    return { ok: issues.length === 0, issues }
  }

  const handleSubmit = async () => {
    if (locked) return

    const { ok } = validateForSubmission()
    if (!ok) {
      setChecklistVisible(true)
      return
    }

    Alert.alert(
      'Submit Final Survey?',
      'Once submitted, this survey will be locked for editing. A branded PDF report will be generated for the customer and operations team.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Submit',
          onPress: async () => {
            setSubmitting(true)
            try {
              await flush()
              await surveyDrafts.patch(draft.localId, { submitRequested: 1, syncState: 'submitting' })
              scheduleSurveySync(100)
              router.replace(`/(app)/surveys/${draft.localId}/success`)
            } catch (e: any) {
              Alert.alert('Submission Error', e.message || 'Could not submit survey.')
            } finally {
              setSubmitting(false)
            }
          },
        },
      ]
    )
  }

  const next = async () => {
    await flush()
    if (currentSection < 10) {
      setCurrentSection(s => s + 1)
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    } else {
      await handleSubmit()
    }
  }

  const back = async () => {
    await flush()
    if (currentSection > 1) {
      setCurrentSection(s => s - 1)
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    } else {
      await saveExit()
    }
  }

  return (
    <Screen
      scrollRef={scrollRef}
      scrollEnabled={!drawing}
      footer={
        locked ? (
          <Button
            title="Survey Submitted (Locked) · View Report"
            onPress={() => router.push(`/(app)/surveys/${draft.localId}/success`)}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              title={currentSection === 1 ? 'Save & exit' : 'Back'}
              variant="secondary"
              onPress={back}
              style={{ flex: 1 }}
            />
            <Button
              title={
                currentSection < 10
                  ? `Next: section ${currentSection + 1}`
                  : submitting
                  ? 'Submitting…'
                  : 'Submit Final Survey ✓'
              }
              loading={submitting && currentSection === 10}
              onPress={next}
              style={{ flex: 2 }}
            />
          </View>
        )
      }
    >
      {/* Subtitle Bar matching Maintenance App */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: space.sm,
        }}
      >
        <Text style={{ color: colors.muted, fontSize: font.small, flex: 1 }}>
          {s0.customerName || 'New Survey'} · Section {currentSection} of 10
        </Text>
        <StateBadge state={draft.syncState as any} />
      </View>

      {/* 10-Step Progress Stepper matching Maintenance App */}
      <Progress
        done={doneSteps}
        incomplete={incompleteSteps}
        current={currentSection}
        onSelect={async (to: number) => {
          await flush()
          setCurrentSection(to)
          scrollRef.current?.scrollTo({ y: 0, animated: false })
        }}
      />

      {locked && (
        <Text style={{ color: colors.danger, fontWeight: '800', marginBottom: space.md }}>
          This survey is submitted and locked. Values are read-only.
        </Text>
      )}

      {/* SECTION 1: SITE & CUSTOMER INFO */}
      {currentSection === 1 && (
        <Card>
          <Field label="Sales Engineer (from Login)">
            <Input value={s0.engineerName} editable={false} />
          </Field>
          <Field label="Customer / Company Name *">
            <Input
              value={s0.customerName}
              editable={!locked}
              placeholder="e.g. Green Residency / Tata Power"
              onChangeText={(t: string) => setSection('section0', { customerName: t })}
            />
          </Field>
          <Field label="Site Address *">
            <Input
              value={s0.siteAddress}
              editable={!locked}
              multiline
              placeholder="Full site address with street and pincode"
              onChangeText={(t: string) => setSection('section0', { siteAddress: t })}
            />
          </Field>
          <Field label="Date of Visit">
            <Input
              value={s0.visitDate}
              editable={!locked}
              placeholder="YYYY-MM-DD"
              onChangeText={(t: string) => setSection('section0', { visitDate: t })}
            />
          </Field>
          <Field label="GPS Coordinates">
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <Input
                value={s0.gpsLat && s0.gpsLng ? `${s0.gpsLat}, ${s0.gpsLng}` : ''}
                placeholder="No GPS recorded"
                editable={false}
                style={{ flex: 1 }}
              />
              {!locked && (
                <Button
                  title="Capture"
                  variant="secondary"
                  onPress={async () => {
                    const pos = await getCurrentGps()
                    if (pos) setSection('section0', { gpsLat: pos.lat, gpsLng: pos.lng })
                  }}
                />
              )}
            </View>
          </Field>
          <Field label="Site Type">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {(['commercial', 'gated_community', 'industrial', 'maintenance'] as SiteType[]).map(st => (
                <Pressable
                  key={st}
                  disabled={locked}
                  onPress={() => setSection('section0', { siteType: st })}
                  style={[
                    styles.tagBtn,
                    s0.siteType === st && styles.tagBtnActive,
                  ]}
                >
                  <Text style={[styles.tagText, s0.siteType === st && styles.tagTextActive]}>
                    {st.replace('_', ' ').toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>
        </Card>
      )}

      {/* SECTION 2: CUSTOMER CONTACT DETAILS */}
      {currentSection === 2 && (
        <Card>
          <Field label="Contact Person *">
            <Input
              value={s1.contactPerson}
              editable={!locked}
              placeholder="e.g. Ramesh Kumar"
              onChangeText={(t: string) => setSection('section1', { contactPerson: t })}
            />
          </Field>
          <Field label="Phone Number * (10 digits starting with 6-9)">
            <Input
              value={s1.contactPhone}
              editable={!locked}
              keyboardType="phone-pad"
              placeholder="9876543210"
              maxLength={10}
              onChangeText={(t: string) => setSection('section1', { contactPhone: t })}
            />
          </Field>
          <Field label="Email Address">
            <Input
              value={s1.contactEmail}
              editable={!locked}
              keyboardType="email-address"
              placeholder="customer@domain.com"
              onChangeText={(t: string) => setSection('section1', { contactEmail: t })}
            />
          </Field>
          <Field label="Customer Type">
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {(['Residential', 'Commercial', 'Industrial'] as CustomerType[]).map(ct => (
                <Pressable
                  key={ct}
                  disabled={locked}
                  onPress={() => setSection('section1', { customerType: ct })}
                  style={[styles.tagBtn, s1.customerType === ct && styles.tagBtnActive]}
                >
                  <Text style={[styles.tagText, s1.customerType === ct && styles.tagTextActive]}>
                    {ct}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="Designation">
            <Input
              value={s1.designation}
              editable={!locked}
              placeholder="e.g. Facility Manager / President"
              onChangeText={(t: string) => setSection('section1', { designation: t })}
            />
          </Field>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="No. of Units/Flats">
                <NumberInput
                  value={s1.numberOfUnits}
                  editable={!locked}
                  integer
                  placeholder="e.g. 120"
                  onChange={(v: number | null) => setSection('section1', { numberOfUnits: v })}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="No. of Towers">
                <NumberInput
                  value={s1.numberOfTowers}
                  editable={!locked}
                  integer
                  placeholder="e.g. 4"
                  onChange={(v: number | null) => setSection('section1', { numberOfTowers: v })}
                />
              </Field>
            </View>
          </View>
        </Card>
      )}

      {/* SECTION 3: ELECTRICITY CONNECTION & TARIFF */}
      {currentSection === 3 && (
        <Card>
          <Field label="DISCOM / EB Service Numbers">
            {s2.ebServiceNumbers.map((num: string, i: number) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.xs, marginBottom: space.xs }}>
                <Input
                  value={num}
                  editable={!locked}
                  placeholder={`EB Service Number #${i + 1}`}
                  style={{ flex: 1 }}
                  onChangeText={(t: string) => {
                    const next = [...s2.ebServiceNumbers]
                    next[i] = t
                    setSection('section2', { ebServiceNumbers: next })
                  }}
                />
                {!locked && s2.ebServiceNumbers.length > 1 && (
                  <Button
                    title="✕"
                    variant="danger"
                    onPress={() => {
                      const next = s2.ebServiceNumbers.filter((_: string, idx: number) => idx !== i)
                      setSection('section2', { ebServiceNumbers: next })
                    }}
                  />
                )}
              </View>
            ))}
            {!locked && (
              <Button
                title="+ Add another EB number"
                variant="secondary"
                onPress={() => {
                  setSection('section2', { ebServiceNumbers: [...s2.ebServiceNumbers, ''] })
                }}
              />
            )}
          </Field>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="Sanctioned Load (kW)">
                <NumberInput
                  value={s2.sanctionedLoadKw}
                  editable={!locked}
                  placeholder="e.g. 50"
                  onChange={(v: number | null) => setSection('section2', { sanctionedLoadKw: v })}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Contract Demand (kVA)">
                <NumberInput
                  value={s2.contractDemandKva}
                  editable={!locked}
                  placeholder="e.g. 60"
                  onChange={(v: number | null) => setSection('section2', { contractDemandKva: v })}
                />
              </Field>
            </View>
          </View>

          <Field label="Phase Type">
            <Toggle
              value={s2.phaseType}
              disabled={locked}
              options={['1-phase', '3-phase'] as const}
              onChange={(v: string) => setSection('section2', { phaseType: v as PhaseType })}
            />
          </Field>

          <Field label="Monthly Bill (₹)">
            <NumberInput
              value={s2.monthlyBillRs}
              editable={!locked}
              placeholder="e.g. 45000"
              onChange={(v: number | null) => setSection('section2', { monthlyBillRs: v })}
            />
          </Field>

          <Field label="Tariff Category">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {(['LT-1', 'LT-2', 'LT-3', 'HT'] as TariffCategory[]).map(tc => (
                <Pressable
                  key={tc}
                  disabled={locked}
                  onPress={() => setSection('section2', { tariffCategory: tc })}
                  style={[styles.tagBtn, s2.tariffCategory === tc && styles.tagBtnActive]}
                >
                  <Text style={[styles.tagText, s2.tariffCategory === tc && styles.tagTextActive]}>
                    {tc} (₹{tariffRate(tc, currentSurveySettings())}/unit)
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Net Metering Feasible">
            <Toggle
              value={s2.netMetering ? 'YES' : 'NO'}
              disabled={locked}
              options={['YES', 'NO'] as const}
              onChange={(v: string) => setSection('section2', { netMetering: v === 'YES' })}
            />
          </Field>

          <Field label="24-Month Total Units (kWh) *">
            <NumberInput
              value={s2.history24MonthsUnits}
              editable={!locked}
              placeholder="Sum of the last 24 bills, used for sizing"
              onChange={(v: number | null) => setSection('section2', { history24MonthsUnits: v })}
            />
          </Field>

          <Field label="24-Month Amount Paid (₹)">
            <NumberInput
              value={s2.history24MonthsAmount}
              editable={!locked}
              placeholder="Sum of the last 24 bills"
              onChange={(v: number | null) => setSection('section2', { history24MonthsAmount: v })}
            />
          </Field>

          <Field label="Tariff Rate from the Bill (₹ per unit)">
            <NumberInput
              value={s2.tariffRateRs ?? null}
              editable={!locked}
              placeholder={`Empty = ${s2.tariffCategory} rate (₹${tariffRate(s2.tariffCategory, currentSurveySettings())})`}
              onChange={(v: number | null) => setSection('section2', { tariffRateRs: v })}
            />
          </Field>

          {/* EB Bill Photo Attachment */}
          <View style={{ marginTop: space.sm }}>
            <Text style={{ fontWeight: '700', marginBottom: space.xs }}>EB Bill Photo</Text>
            <PhotoSectionView
              sectionTag="eb_bill"
              photos={photos}
              locked={locked}
              onCapture={src => handlePhotoAction('eb_bill', src)}
              onRemove={removePhoto}
            />
          </View>
        </Card>
      )}

      {/* SECTION 4: ROOF & SPACE ASSESSMENT */}
      {currentSection === 4 && (
        <Card>
          <Field label="Installation Type">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {(['RCC', 'Sheet', 'Ground', 'Car Park'] as InstallationType[]).map(it => (
                <Pressable
                  key={it}
                  disabled={locked}
                  onPress={() => setSection('section3', { installationType: it })}
                  style={[styles.tagBtn, s3.installationType === it && styles.tagBtnActive]}
                >
                  <Text style={[styles.tagText, s3.installationType === it && styles.tagTextActive]}>
                    {it}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Available Roof Area (sq. ft.) *">
            <NumberInput
              value={s3.availableAreaSqft}
              editable={!locked}
              placeholder="e.g. 2500"
              onChange={(v: number | null) => setSection('section3', { availableAreaSqft: v })}
            />
          </Field>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="Length (ft)">
                <NumberInput
                  value={s3.roofLengthFt}
                  editable={!locked}
                  placeholder="e.g. 50"
                  onChange={(v: number | null) => setSection('section3', { roofLengthFt: v })}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Width (ft)">
                <NumberInput
                  value={s3.roofWidthFt}
                  editable={!locked}
                  placeholder="e.g. 50"
                  onChange={(v: number | null) => setSection('section3', { roofWidthFt: v })}
                />
              </Field>
            </View>
          </View>

          <Field label="Roof Condition">
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {(['Good', 'Moderate', 'Needs Repair'] as RoofCondition[]).map(rc => (
                <Pressable
                  key={rc}
                  disabled={locked}
                  onPress={() => setSection('section3', { roofCondition: rc })}
                  style={[styles.tagBtn, s3.roofCondition === rc && styles.tagBtnActive]}
                >
                  <Text style={[styles.tagText, s3.roofCondition === rc && styles.tagTextActive]}>
                    {rc}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Orientation">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {(['South', 'North', 'East', 'West', 'South-East', 'South-West'] as RoofOrientation[]).map(ro => (
                <Pressable
                  key={ro}
                  disabled={locked}
                  onPress={() => setSection('section3', { orientation: ro })}
                  style={[styles.tagBtn, s3.orientation === ro && styles.tagBtnActive]}
                >
                  <Text style={[styles.tagText, s3.orientation === ro && styles.tagTextActive]}>
                    {ro}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Tilt Type & Angle (°)">
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Toggle
                  value={s3.tiltType}
                  disabled={locked}
                  options={['Flat', 'Sloped'] as const}
                  onChange={(v: string) => setSection('section3', { tiltType: v as TiltType })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <NumberInput
                  value={s3.tiltAngleDeg}
                  editable={!locked}
                  placeholder="e.g. 10"
                  onChange={(v: number | null) => setSection('section3', { tiltAngleDeg: v })}
                />
              </View>
            </View>
          </Field>

          {/* Obstruction Areas */}
          <Field label="Obstructions on Roof">
            <Toggle
              value={s3.hasObstructions ? 'YES' : 'NO'}
              disabled={locked}
              options={['YES', 'NO'] as const}
              onChange={(v: string) => setSection('section3', { hasObstructions: v === 'YES' })}
            />
            {s3.hasObstructions && (
              <View style={{ marginTop: space.sm, gap: space.xs }}>
                {s3.obstructionAreas.map((obs: ObstructionAreaItem, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
                    <Input
                      value={obs.description}
                      editable={!locked}
                      placeholder="e.g. Water tank / Mumty"
                      style={{ flex: 2 }}
                      onChangeText={(t: string) => {
                        const next = [...s3.obstructionAreas]
                        next[i] = { ...obs, description: t }
                        setSection('section3', { obstructionAreas: next })
                      }}
                    />
                    <NumberInput
                      value={obs.areaSqft}
                      editable={!locked}
                      placeholder="sq.ft"
                      onChange={(v: number | null) => {
                        const next = [...s3.obstructionAreas]
                        next[i] = { ...obs, areaSqft: v ?? 0 }
                        setSection('section3', { obstructionAreas: next })
                      }}
                    />
                    {!locked && (
                      <Button
                        title="✕"
                        variant="danger"
                        onPress={() => {
                          const next = s3.obstructionAreas.filter((_: ObstructionAreaItem, idx: number) => idx !== i)
                          setSection('section3', { obstructionAreas: next })
                        }}
                      />
                    )}
                  </View>
                ))}
                {!locked && (
                  <Button
                    title="+ Add obstruction area"
                    variant="secondary"
                    onPress={() => {
                      setSection('section3', {
                        obstructionAreas: [...s3.obstructionAreas, { description: '', areaSqft: 0 }],
                      })
                    }}
                  />
                )}
              </View>
            )}
          </Field>

          {s3.hasObstructions && (
            <Field label="What are the obstructions?">
              <Input
                value={s3.obstructionsDescription ?? ''}
                editable={!locked}
                placeholder="e.g. Water tank, lift room, solar heater"
                onChangeText={(t: string) => setSection('section3', { obstructionsDescription: t })}
              />
            </Field>
          )}

          <Field label="Waterproofing Status *">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {['Good', 'Needs repair', 'Not done'].map(w => (
                <Pressable
                  key={w}
                  disabled={locked}
                  onPress={() => setSection('section3', { waterproofingStatus: w })}
                  style={[styles.tagBtn, s3.waterproofingStatus === w && styles.tagBtnActive]}
                >
                  <Text style={[styles.tagText, s3.waterproofingStatus === w && styles.tagTextActive]}>{w}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Material Access">
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {(['Stairs', 'Lift', 'Crane'] as MaterialAccess[]).map(ma => (
                <Pressable
                  key={ma}
                  disabled={locked}
                  onPress={() => setSection('section3', { materialAccess: ma })}
                  style={[styles.tagBtn, s3.materialAccess === ma && styles.tagBtnActive]}
                >
                  <Text style={[styles.tagText, s3.materialAccess === ma && styles.tagTextActive]}>
                    {ma}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          {/* Roof Photos */}
          <View style={{ marginTop: space.sm }}>
            <Text style={{ fontWeight: '700', marginBottom: space.xs }}>Roof Photos (All Angles)</Text>
            <PhotoSectionView
              sectionTag="roof"
              photos={photos}
              locked={locked}
              onCapture={src => handlePhotoAction('roof', src)}
              onRemove={removePhoto}
            />
          </View>
        </Card>
      )}

      {/* SECTION 5: SHADOW ANALYSIS */}
      {currentSection === 5 && (
        <Card>
          <Field label="Shadow Observed">
            <Toggle
              value={s4.shadowObserved ? 'YES' : 'NO'}
              disabled={locked}
              options={['YES', 'NO'] as const}
              onChange={(v: string) => setSection('section4', { shadowObserved: v === 'YES' })}
            />
          </Field>
          <Field label="Shadow Sources">
            <Input
              value={s4.shadowSources}
              editable={!locked}
              placeholder="e.g. Adjacent tower, trees, water tank"
              onChangeText={(t: string) => setSection('section4', { shadowSources: t })}
            />
          </Field>
          <Field label="Time of Observation">
            <Input
              value={s4.timeOfObservation}
              editable={!locked}
              placeholder="e.g. 11:30 AM"
              onChangeText={(t: string) => setSection('section4', { timeOfObservation: t })}
            />
          </Field>
          <Field label="Estimated Shadow Area (%)">
            <NumberInput
              value={s4.shadowAreaPercent}
              editable={!locked}
              placeholder="e.g. 15"
              max={100}
              onChange={(v: number | null) => setSection('section4', { shadowAreaPercent: v })}
            />
          </Field>
          <Field label="Sunny (shadow-free) hours in each window *">
            <View style={{ gap: space.xs }}>
              {([
                ['sunHours8to10', '8:00 – 10:00 AM (0–2 h)', s4.sunHours8to10, 2],
                ['sunHours10to2', '10:00 AM – 2:00 PM (0–4 h)', s4.sunHours10to2, 4],
                ['sunHours2to5', '2:00 – 5:00 PM (0–3 h)', s4.sunHours2to5, 3],
              ] as const).map(([key, label, val, max]) => (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ flex: 1, fontWeight: '600' }}>{label}</Text>
                  <View style={{ width: 110 }}>
                    <NumberInput
                      value={val ?? null}
                      editable={!locked}
                      max={max}
                      placeholder="hours"
                      onChange={(v: number | null) => setSection('section4', { [key]: v })}
                    />
                  </View>
                </View>
              ))}
              <Text style={{ fontSize: font.small, color: colors.muted }}>
                Fewer than 6 sunny hours in total, or more than 30% shadow, suggests a Conditional verdict.
              </Text>
            </View>
          </Field>

          {/* Shadow Photos */}
          <View style={{ marginTop: space.sm }}>
            <Text style={{ fontWeight: '700', marginBottom: space.xs }}>Shadow Area Photos</Text>
            <PhotoSectionView
              sectionTag="shadow"
              photos={photos}
              locked={locked}
              onCapture={src => handlePhotoAction('shadow', src)}
              onRemove={removePhoto}
            />
          </View>
        </Card>
      )}

      {/* SECTION 6: ELECTRICAL INFRASTRUCTURE */}
      {currentSection === 6 && (
        <Card>
          <Field label="Main Distribution Board (MDB) Location">
            <Input
              value={s5.mdbLocation}
              editable={!locked}
              placeholder="e.g. Ground floor panel room"
              onChangeText={(t: string) => setSection('section5', { mdbLocation: t })}
            />
          </Field>
          <Field label="Roof to Inverter Distance (meters)">
            <NumberInput
              value={s5.roofToInverterDistanceM}
              editable={!locked}
              placeholder="e.g. 15"
              onChange={(v: number | null) => setSection('section5', { roofToInverterDistanceM: v })}
            />
          </Field>
          <Field label="Inverter Space Available">
            <Input
              value={s5.inverterSpace}
              editable={!locked}
              placeholder="e.g. Adequate wall space next to staircase"
              onChangeText={(t: string) => setSection('section5', { inverterSpace: t })}
            />
          </Field>
          <Field label="Earthing Points Available">
            <NumberInput
              value={s5.earthingPoints}
              editable={!locked}
              integer
              placeholder="e.g. 2"
              onChange={(v: number | null) => setSection('section5', { earthingPoints: v })}
            />
          </Field>
          <Field label="WiFi / Internet Available for Solar Inverter">
            <Toggle
              value={s5.wifiAvailable ? 'YES' : 'NO'}
              disabled={locked}
              options={['YES', 'NO'] as const}
              onChange={(v: string) => setSection('section5', { wifiAvailable: v === 'YES' })}
            />
          </Field>
          <Field label="EB Meter Location">
            <Input
              value={s5.ebMeterLocation}
              editable={!locked}
              placeholder="e.g. Ground floor feeder pillar"
              onChangeText={(t: string) => setSection('section5', { ebMeterLocation: t })}
            />
          </Field>
          <Field label="ACDB Location">
            <Input
              value={s5.acdbLocation}
              editable={!locked}
              placeholder="e.g. Next to solar inverter"
              onChangeText={(t: string) => setSection('section5', { acdbLocation: t })}
            />
          </Field>

          <Field label="Earth Pit Location">
            <Input
              value={s5.earthPitLocation ?? ''}
              editable={!locked}
              placeholder="e.g. Near DG yard, east side"
              onChangeText={(t: string) => setSection('section5', { earthPitLocation: t })}
            />
          </Field>

          {/* Dynamic Cable Routes */}
          <Field label="Cable Routes & Estimated Lengths (m)">
            {s5.cableRoutes.map((cr: CableRouteItem, i: number) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.xs, marginBottom: space.xs }}>
                <Input
                  value={cr.label}
                  editable={!locked}
                  placeholder="Route description"
                  style={{ flex: 2 }}
                  onChangeText={(t: string) => {
                    const next = [...s5.cableRoutes]
                    next[i] = { ...cr, label: t }
                    setSection('section5', { cableRoutes: next })
                  }}
                />
                <NumberInput
                  value={cr.lengthM}
                  editable={!locked}
                  placeholder="meters"
                  onChange={(v: number | null) => {
                    const next = [...s5.cableRoutes]
                    next[i] = { ...cr, lengthM: v ?? 0 }
                    setSection('section5', { cableRoutes: next })
                  }}
                />
                {!locked && (
                  <Button
                    title="✕"
                    variant="danger"
                    onPress={() => {
                      const next = s5.cableRoutes.filter((_: CableRouteItem, idx: number) => idx !== i)
                      setSection('section5', { cableRoutes: next })
                    }}
                  />
                )}
              </View>
            ))}
            {!locked && (
              <Button
                title="+ Add cable route"
                variant="secondary"
                onPress={() => {
                  setSection('section5', {
                    cableRoutes: [...s5.cableRoutes, { label: '', lengthM: 0 }],
                  })
                }}
              />
            )}
            <Text style={{ fontSize: font.small, color: colors.muted, marginTop: space.xs }}>
              Total with 20% buffer: {calculations?.totalCableLengthM ?? 0} meters
            </Text>
          </Field>

          {/* Panel Photos */}
          <View style={{ marginTop: space.sm }}>
            <Text style={{ fontWeight: '700', marginBottom: space.xs }}>Main Panel / MDB Photos</Text>
            <PhotoSectionView
              sectionTag="panel_mdb"
              photos={photos}
              locked={locked}
              onCapture={src => handlePhotoAction('panel_mdb', src)}
              onRemove={removePhoto}
            />
          </View>
          <View style={{ marginTop: space.sm }}>
            <Text style={{ fontWeight: '700', marginBottom: space.xs }}>EB Meter Photos</Text>
            <PhotoSectionView
              sectionTag="eb_meter"
              photos={photos}
              locked={locked}
              onCapture={src => handlePhotoAction('eb_meter', src)}
              onRemove={removePhoto}
            />
          </View>
        </Card>
      )}

      {/* SECTION 7: INSTALLATION FEASIBILITY & LOGISTICS */}
      {currentSection === 7 && (
        <Card>
          <Field label="Mounting Structure Type">
            <Input
              value={s6.mountingStructure}
              editable={!locked}
              placeholder="e.g. Elevated HDGI structure with 10 deg south tilt"
              onChangeText={(t: string) => setSection('section6', { mountingStructure: t })}
            />
          </Field>
          <Field label="Cable Route Feasible">
            <Toggle
              value={s6.cableRouteFeasible ? 'YES' : 'NO'}
              disabled={locked}
              options={['YES', 'NO'] as const}
              onChange={(v: string) => setSection('section6', { cableRouteFeasible: v === 'YES' })}
            />
          </Field>
          <Field label="Structural Reinforcement Needed">
            <Toggle
              value={s6.structuralReinforcement ? 'YES' : 'NO'}
              disabled={locked}
              options={['YES', 'NO'] as const}
              onChange={(v: string) => setSection('section6', { structuralReinforcement: v === 'YES' })}
            />
          </Field>
          <Field label="Safety & Access Constraints">
            <Input
              value={s6.safetyConstraints}
              editable={!locked}
              multiline
              placeholder="e.g. Lifeline required along parapet; stairs access to roof"
              onChangeText={(t: string) => setSection('section6', { safetyConstraints: t })}
            />
          </Field>
        </Card>
      )}

      {/* SECTION 8: DOCUMENTATION CHECKLIST & PHOTOS */}
      {currentSection === 8 && (
        <Card>
          <Text style={{ fontSize: font.base, fontWeight: '700', marginBottom: space.sm }}>
            Required Documents & Photos Checklist
          </Text>
          {[
            ['ebBill', 'EB Electricity Bill', s7.checklist.ebBill],
            ['idProof', 'Customer ID Proof / GST Certificate', s7.checklist.idProof],
            ['roofPhotos', 'Roof Photos (All Directions)', s7.checklist.roofPhotos],
            ['panelPhoto', 'Electrical Panel & Meter Photos', s7.checklist.panelPhoto],
          ].map(([key, label, val]) => (
            <Pressable
              key={key as string}
              disabled={locked}
              onPress={() => {
                setSection('section7', {
                  checklist: { ...s7.checklist, [key as string]: !val },
                })
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: space.sm,
                marginBottom: space.xs,
                backgroundColor: val ? colors.goodSoft : colors.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: val ? colors.good : colors.border,
              }}
            >
              <Text style={{ fontSize: 16, marginRight: space.sm }}>{val ? '✓' : '○'}</Text>
              <Text style={{ fontWeight: '700', color: val ? colors.good : colors.text }}>
                {label as string}
              </Text>
            </Pressable>
          ))}

          <Text style={{ fontSize: font.small, color: colors.muted, marginTop: space.sm }}>
            Items are auto-ticked when the matching photo is attached. Mandatory for this site type:{' '}
            {required.map(t => `${PHOTO_LABELS[t]}${hasPhoto(t) ? ' ✓' : ''}`).join(', ') || 'none'}.
          </Text>

          <View style={{ marginTop: space.md }}>
            <Text style={{ fontWeight: '700', marginBottom: space.xs }}>Customer ID Proof / GST Certificate</Text>
            <PhotoSectionView
              sectionTag="id_proof"
              photos={photos}
              locked={locked}
              onCapture={src => handlePhotoAction('id_proof', src)}
              onRemove={removePhoto}
            />
          </View>

          {/* General Survey Photos Gallery */}
          <View style={{ marginTop: space.md }}>
            <Text style={{ fontWeight: '800', marginBottom: space.xs }}>
              Attached Photos ({photos.length})
            </Text>
            <PhotoSectionView
              sectionTag="general"
              photos={photos}
              locked={locked}
              onCapture={src => handlePhotoAction('general', src)}
              onRemove={removePhoto}
            />
          </View>
        </Card>
      )}

      {/* SECTION 9: REMARKS & SIGNATURES */}
      {currentSection === 9 && (
        <Card>
          <Field label="Sales Engineer Observations">
            <Input
              value={s8.observations}
              editable={!locked}
              multiline
              placeholder="Key technical and site observations"
              onChangeText={(t: string) => setSection('section8', { observations: t })}
            />
          </Field>
          <Field label="Special Requirements">
            <Input
              value={s8.specialRequirements}
              editable={!locked}
              multiline
              placeholder="e.g. High-rise walkway, dual ACDB"
              onChangeText={(t: string) => setSection('section8', { specialRequirements: t })}
            />
          </Field>
          <Field label="Risks Identified">
            <Input
              value={s8.risks}
              editable={!locked}
              multiline
              placeholder="e.g. High wind load area, parapet under 3ft"
              onChangeText={(t: string) => setSection('section8', { risks: t })}
            />
          </Field>

          {/* Engineer Signature Pad */}
          <SignaturePad
            title="Sales Engineer Signature *"
            filePrefix="sig-eng"
            existingUri={draft.engineerSigUri}
            disabled={locked}
            onDrawing={setDrawing}
            onSaved={async (uri: string) => {
              await setSignature('engineer', uri)
            }}
          />

          <Field label="Customer Representative Name *">
            <Input
              value={s8.customerRepName ?? s1.contactPerson ?? ''}
              editable={!locked}
              placeholder="Name of the person signing"
              onChangeText={(t: string) => setSection('section8', { customerRepName: t })}
            />
          </Field>

          {/* Customer Signature Pad */}
          <SignaturePad
            title="Customer / Authorized Representative Signature *"
            filePrefix="sig-cust"
            existingUri={draft.customerSigUri}
            disabled={locked}
            onDrawing={setDrawing}
            onSaved={async (uri: string) => {
              await setSignature('customer', uri)
            }}
          />
        </Card>
      )}

      {/* SECTION 10: SUMMARY & RECOMMENDATIONS (LIVE MATH) */}
      {currentSection === 10 && (
        <Card>
          {/* Live Auto-Calculations Card */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 10,
              padding: space.md,
              marginBottom: space.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: font.base, fontWeight: '800', marginBottom: space.sm, color: colors.primaryDark }}>
              System Sizing & Financial Estimates
            </Text>

            <SummaryRow
              label="Avg. Daily Consumption"
              val={`${calculations?.avgDailyUnits ?? 0} kWh/day`}
            />
            <SummaryRow
              label="Capacity by Consumption"
              val={`${calculations?.capacityByConsumptionKw ?? 0} kW`}
            />
            <SummaryRow
              label="Net Free Roof Area"
              val={`${calculations?.netFreeAreaSqft ?? 0} sq.ft`}
            />
            <SummaryRow
              label="Capacity by Roof Area"
              val={`${calculations?.capacityByRoofKw ?? 0} kW`}
            />
            <SummaryRow
              label="Recommended System Size"
              val={`${calculations?.recommendedSystemSizeKw ?? 0} kW`}
              bold
            />
            <SummaryRow
              label="Panel Count (550 Wp)"
              val={`${calculations?.numberOfPanels ?? 0} panels`}
            />
            <SummaryRow
              label="Estimated Monthly Generation"
              val={`${calculations?.unitsGeneratedPerMonth ?? 0} Units`}
            />
            <SummaryRow
              label="Estimated Monthly Savings"
              val={`₹${calculations?.monthlySavingsRs?.toLocaleString('en-IN') ?? 0}`}
            />
            <SummaryRow
              label="Estimated Annual Savings"
              val={`₹${calculations?.annualSavingsRs?.toLocaleString('en-IN') ?? 0}`}
              bold
            />
            <SummaryRow
              label="Total Cable Length (with buffer)"
              val={`${calculations?.totalCableLengthM ?? 0} meters`}
            />
          </View>

          {/* Warning Banners */}
          {calculations?.isRoofShortfall && (
            <View style={styles.warnBanner}>
              <Text style={styles.warnTitle}>⚠️ Roof Area Shortfall Warning</Text>
              <Text style={styles.warnText}>
                The available shadow-free roof area supports {calculations.capacityByRoofKw} kW, which is less than the
                consumption requirement of {calculations.capacityByConsumptionKw} kW.
              </Text>
            </View>
          )}

          {calculations?.isShadowRisk && (
            <View style={styles.warnBanner}>
              <Text style={styles.warnTitle}>⚠️ Shadow Risk Warning</Text>
              <Text style={styles.warnText}>
                Shadow area exceeds 30% or daily sun exposure is under 6 hours. High risk of reduced generation;
                elevated structure or module-level power electronics recommended.
              </Text>
            </View>
          )}

          {/* Mandatory Verdict */}
          <Field label="Installation Verdict * (MANDATORY)">
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {(['FEASIBLE', 'CONDITIONAL', 'NOT_FEASIBLE'] as SurveyVerdict[]).map(vd => {
                const isSel = s9.verdict === vd
                const color =
                  vd === 'FEASIBLE' ? colors.good : vd === 'CONDITIONAL' ? colors.warn : colors.danger
                return (
                  <Pressable
                    key={vd}
                    disabled={locked}
                    onPress={() => setSection('section9', { verdict: vd })}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      borderWidth: 2,
                      borderColor: isSel ? color : colors.border,
                      backgroundColor: isSel
                        ? vd === 'FEASIBLE'
                          ? colors.goodSoft
                          : vd === 'CONDITIONAL'
                          ? colors.warnSoft
                          : colors.defectSoft
                        : colors.bg,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: '800',
                        fontSize: 12,
                        color: isSel ? color : colors.muted,
                      }}
                    >
                      {isSel ? '✓ ' : ''}
                      {vd.replace('_', ' ')}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: space.xs }}>
              System suggestion based on roof & shadow analysis: {calculations?.suggestedVerdict ?? 'FEASIBLE'}
            </Text>
          </Field>

          {/* Overrides Card */}
          <View
            style={{
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              padding: space.md,
              marginBottom: space.md,
            }}
          >
            <Text style={{ fontSize: font.base, fontWeight: '700', marginBottom: space.sm }}>
              Manual System Size Override (Optional)
            </Text>

            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Field label="Override Capacity (kW)">
                  <NumberInput
                    value={overrides?.capacityKw}
                    editable={!locked}
                    placeholder="e.g. 25"
                    onChange={(v: number | null) => setOverrides({ capacityKw: v })}
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Override Panel Count">
                  <NumberInput
                    value={overrides?.numberOfPanels}
                    editable={!locked}
                    integer
                    placeholder="e.g. 45"
                    onChange={(v: number | null) => setOverrides({ numberOfPanels: v })}
                  />
                </Field>
              </View>
            </View>

            {(overrides?.capacityKw || overrides?.numberOfPanels) && (
              <Field label="Override Reason * (Required for audit log)">
                <Input
                  value={overrides?.overrideReason || ''}
                  editable={!locked}
                  placeholder="Explain why the calculated value was modified (min 5 chars)"
                  onChangeText={(t: string) => setOverrides({ overrideReason: t })}
                />
              </Field>
            )}
          </View>

          <Field label="Recommendation Note">
            <Input
              value={s9.recommendationNote}
              editable={!locked}
              multiline
              placeholder="Summary recommendation to show on the customer proposal report"
              onChangeText={(t: string) => setSection('section9', { recommendationNote: t })}
            />
          </Field>

          <Field label="Special Conditions / Prerequisites">
            <Input
              value={s9.conditions}
              editable={!locked}
              multiline
              placeholder="Conditions before installation (e.g. waterproofing, tree pruning)"
              onChangeText={(t: string) => setSection('section9', { conditions: t })}
            />
          </Field>
        </Card>
      )}

      {/* Pre-submit Checklist Modal */}
      <Modal visible={checklistVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: font.title, fontWeight: '800', marginBottom: space.xs }}>
              Incomplete Survey Checklist
            </Text>
            <Text style={{ fontSize: font.small, color: colors.muted, marginBottom: space.md }}>
              Please resolve the following items before submitting the final survey:
            </Text>

            <ScrollView style={{ maxHeight: 300, marginBottom: space.md }}>
              {validateForSubmission().issues.map((iss, i) => (
                <Pressable
                  key={i}
                  onPress={() => {
                    setChecklistVisible(false)
                    setCurrentSection(iss.section)
                    scrollRef.current?.scrollTo({ y: 0, animated: false })
                  }}
                  style={styles.issueRow}
                >
                  <Text style={{ color: colors.danger, fontWeight: '800', marginRight: space.sm }}>✕</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{iss.text}</Text>
                    <Text style={{ color: colors.primary, fontSize: 12, marginTop: 2 }}>
                      Tap to open Section {iss.section} →
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <Button title="Close & Review" onPress={() => setChecklistVisible(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

function SummaryRow({ label, val, bold }: { label: string; val: string; bold?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
      }}
    >
      <Text style={{ color: colors.muted, fontSize: font.small }}>{label}</Text>
      <Text style={{ fontSize: font.base, fontWeight: bold ? '800' : '600', color: colors.text }}>
        {val}
      </Text>
    </View>
  )
}

function PhotoSectionView({
  sectionTag,
  photos,
  locked,
  onCapture,
  onRemove,
}: {
  sectionTag: string
  photos: any[]
  locked: boolean
  onCapture: (source: 'camera' | 'library') => void
  onRemove: (id: string) => void
}) {
  const matching = photos.filter(
    p => p.section === sectionTag || (sectionTag === 'general' && p.section !== 'eb_bill')
  )

  return (
    <View>
      {matching.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {matching.map(p => (
              <View
                key={p.id}
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: 8,
                  overflow: 'hidden',
                  position: 'relative',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Image source={{ uri: p.localUri }} style={{ width: '100%', height: '100%' }} />
                {!locked && (
                  <Pressable
                    onPress={() => onRemove(p.id)}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      backgroundColor: 'rgba(239, 68, 68, 0.85)',
                      borderRadius: 12,
                      width: 22,
                      height: 22,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={{ color: colors.muted, fontSize: font.small, marginBottom: space.sm }}>
          No photos captured for this section yet.
        </Text>
      )}

      {!locked && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            title="📷 Take Photo"
            variant="secondary"
            onPress={() => onCapture('camera')}
            style={{ flex: 1 }}
          />
          <Button
            title="🖼 Gallery"
            variant="secondary"
            onPress={() => onCapture('library')}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  tagBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  tagBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  tagText: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.muted,
  },
  tagTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  warnBanner: {
    backgroundColor: colors.warnSoft,
    borderWidth: 1.5,
    borderColor: colors.warn,
    borderRadius: 8,
    padding: space.sm,
    marginBottom: space.md,
  },
  warnTitle: {
    fontWeight: '800',
    fontSize: font.small,
    color: colors.warn,
    marginBottom: 2,
  },
  warnText: {
    fontSize: font.small,
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: space.lg,
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: space.lg,
    maxHeight: '80%',
  },
  issueRow: {
    flexDirection: 'row',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
  },
})
