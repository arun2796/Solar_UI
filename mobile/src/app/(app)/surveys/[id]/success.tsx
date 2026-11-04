import { useEffect, useState } from 'react'
import { BackHandler, Linking, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { surveyDrafts } from '../../../../db'
import type { SurveyDraft } from '../../../../lib/surveyTypes'
import { api } from '../../../../lib/api'
import { syncStore } from '../../../../lib/store'
import { Button, Card, Loading, NotFound, Screen } from '../../../../components/ui'
import { colors, font, space } from '../../../../theme'

export default function SurveySuccess() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [draft, setDraft] = useState<SurveyDraft | null | undefined>(undefined)
  const [sharing, setSharing] = useState(false)
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Reload after every sync: a survey submitted offline gets its SV number when it reaches the server.
  const tick = syncStore.use(s => s.tick)
  useEffect(() => {
    void surveyDrafts.get(id).then(setDraft)
  }, [id, tick])

  const finish = () => {
    router.dismissAll()
    router.replace('/(app)/site-surveys')
  }

  useEffect(() => {
    const s = BackHandler.addEventListener('hardwareBackPress', () => {
      finish()
      return true
    })
    return () => s.remove()
  }, [])

  if (draft === undefined) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }

  if (draft === null) {
    return <NotFound text="Survey record not found." onBack={finish} />
  }

  const sent = draft.syncState === 'submitted'
  const surveyNum = draft.surveyNumber || 'No number yet'
  const customerName = draft.customerName || draft.sections?.section0?.customerName || 'Customer'
  const recommendedKw = draft.calculations?.recommendedSystemSizeKw ?? draft.sections?.section9?.systemSizeKw ?? 0
  const annualSavings = draft.calculations?.annualSavingsRs ?? draft.sections?.section9?.annualSavingsRs ?? 0
  const verdict = draft.sections?.section9?.verdict ?? 'FEASIBLE'
  const customerPhone = draft.sections?.section1?.contactPhone?.replace(/\D/g, '')

  const handleSharePdf = async () => {
    if (!draft.serverId) {
      setMsg('The survey has been submitted locally and will sync shortly when online.')
      return
    }
    setSharing(true)
    setMsg(null)
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setMsg('Sharing is not supported on this device.')
        return
      }
      const file = await api.surveys.downloadPdf(draft.serverId, `${surveyNum}_Survey_Report.pdf`)
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share Site Survey Report ${surveyNum}`,
        UTI: 'com.adobe.pdf',
      })
    } catch (e: any) {
      setMsg(e.message || 'Could not download or share survey PDF.')
    } finally {
      setSharing(false)
    }
  }


  const handleSendWhatsApp = async () => {
    setSharingWhatsApp(true)
    let shareUrl = ''
    if (draft.serverId) {
      try {
        const link = await api.surveys.shareLink(draft.serverId)
        shareUrl = link.url
      } catch {
        // Fall back gracefully to direct message without link
      }
    }
    setSharingWhatsApp(false)

    const phone = customerPhone ? (customerPhone.startsWith('91') ? customerPhone : `91${customerPhone}`) : ''
    const linkText = shareUrl ? `\n\n📄 View / Download your official Survey PDF Report:\n${shareUrl}` : ''
    const text = encodeURIComponent(
      `Hello ${draft.sections?.section1?.contactPerson || customerName},\n\nThank you for choosing Shree Abhi Electricals & Engineering Pvt. Ltd. Your rooftop solar site survey (${surveyNum}) has been completed.\n\nRecommended System Size: ${recommendedKw} kW\nEstimated Annual Savings: ₹${annualSavings.toLocaleString('en-IN')}\nInstallation Verdict: ${verdict}${linkText}\n\nOur engineering team will share the complete feasibility proposal shortly.`
    )
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `whatsapp://send?text=${text}`
    void Linking.openURL(url).catch(() => {
      setMsg('WhatsApp is not installed on this device.')
    })
  }

  const handleSendEmail = async () => {
    if (!draft.serverId) {
      setMsg('The survey has been submitted locally and will sync shortly when online.')
      return
    }
    const customerEmail = draft.sections?.section1?.contactEmail
    setEmailing(true)
    setMsg(null)
    try {
      await api.surveys.email(draft.serverId, customerEmail || undefined)
      setMsg(`✓ Report PDF emailed successfully to ${customerEmail || 'customer'}.`)
    } catch (e: any) {
      setMsg(e.message || 'Could not send report email.')
    } finally {
      setEmailing(false)
    }
  }

  return (
    <Screen
      footer={
        <View style={{ gap: space.sm }}>
          {!sent && (
            <Text style={{ color: colors.muted, fontSize: font.small, textAlign: 'center' }}>
              The PDF, WhatsApp and email options work once the survey has reached the server.
            </Text>
          )}
          <Button
            title="📄  Share PDF (WhatsApp, Email…)"
            loading={sharing}
            disabled={!sent}
            onPress={handleSharePdf}
          />
          <Button
            title="💬  Send WhatsApp Summary & Link"
            variant="secondary"
            loading={sharingWhatsApp}
            disabled={!sent}
            onPress={handleSendWhatsApp}
          />
          <Button
            title="✉️  Email PDF Report to Customer"
            variant="secondary"
            loading={emailing}
            disabled={!sent}
            onPress={handleSendEmail}
          />
          <Button title="Done" variant="secondary" onPress={finish} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <Text style={{ fontSize: 64 }}>☀️</Text>
        <Text
          style={{
            fontSize: font.title,
            fontWeight: '800',
            color: colors.good,
            marginTop: space.md,
          }}
        >
          Site Survey Submitted!
        </Text>
        <Text
          style={{
            fontSize: 28,
            fontWeight: '800',
            marginTop: space.sm,
            letterSpacing: 1,
            color: colors.primaryDark,
          }}
        >
          {surveyNum}
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: font.base,
            marginTop: space.xs,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {customerName}
        </Text>
        <Text style={{ color: colors.muted, fontSize: font.small, textAlign: 'center', marginTop: 2 }}>
          {draft.siteAddress}
        </Text>

        <Card style={{ marginTop: space.lg, width: '100%' }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: '#E2E8F0',
            }}
          >
            <Text style={{ color: colors.muted, fontSize: font.small }}>Recommended Size</Text>
            <Text style={{ fontSize: font.base, fontWeight: '800', color: colors.primaryDark }}>
              {recommendedKw} kW
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: '#E2E8F0',
            }}
          >
            <Text style={{ color: colors.muted, fontSize: font.small }}>Est. Annual Savings</Text>
            <Text style={{ fontSize: font.base, fontWeight: '800', color: colors.good }}>
              ₹{annualSavings.toLocaleString('en-IN')}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: font.small }}>Installation Verdict</Text>
            <Text
              style={{
                fontSize: font.base,
                fontWeight: '800',
                color: verdict === 'FEASIBLE' ? colors.good : verdict === 'CONDITIONAL' ? colors.warn : colors.danger,
              }}
            >
              {verdict}
            </Text>
          </View>
        </Card>

        {msg && (
          <Text
            accessibilityRole="alert"
            style={{
              color: colors.danger,
              marginTop: space.md,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {msg}
          </Text>
        )}

        <Text
          style={{
            color: colors.muted,
            fontSize: font.small,
            marginTop: space.lg,
            textAlign: 'center',
          }}
        >
          {sent
            ? 'This survey is locked for editing. The Operations and Management teams have received the report for proposal review.'
            : 'This survey is locked for editing and saved on this phone. It is sent automatically as soon as there is a connection; the survey number appears here then.'}
        </Text>
      </View>
    </Screen>
  )
}
