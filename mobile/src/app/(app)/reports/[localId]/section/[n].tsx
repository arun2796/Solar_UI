import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useDraft } from '../../../../../forms/useDraft'
import { draftProblems, getMissingReportIssues, headerComplete, LIMITS, sectionComplete } from '../../../../../forms/schema'
import { SECTION_8_TITLE, SECTIONS, addDays, todayIso, type ReportFields } from '../../../../../lib/types'
import { DateField } from '../../../../../components/DateField'
import { Button, Field, Input, Loading, NotFound, NumberInput, Progress, Screen, StateBadge, Toggle } from '../../../../../components/ui'
import { colors, font, space } from '../../../../../theme'

export default function SectionScreen() {
  const { localId, n: nStr, check } = useLocalSearchParams<{ localId: string; n: string; check?: string }>()
  const n = Math.min(8, Math.max(1, Number(nStr) || 1))
  const router = useRouter()
  const nav = useNavigation()
  const scrollRef = useRef<any>(null)
  const fieldPositions = useRef<Record<string, number>>({})
  const scrolledRef = useRef(false)
  const { draft, fields, setFields, flush, loading, locked } = useDraft(localId)
  const [saved, setSaved] = useState(false)
  const section = SECTIONS.find(s => s.n === n)

  useEffect(() => { nav.setOptions({ title: `${n}. ${section?.title ?? SECTION_8_TITLE}` }) }, [n, nav, section])
  const saveExitRef = useRef<() => void>(() => {})
  useEffect(() => {
    nav.setOptions({ headerRight: () => (draft && !locked ? <Pressable accessibilityRole="button" onPress={() => saveExitRef.current()} hitSlop={12} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
      <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: font.base }}>{saved ? 'Saved ✓' : 'Save & exit'}</Text></Pressable> : null) })
  }, [nav, draft, locked, saved])

  if (loading) return <Screen><Loading /></Screen>
  if (!draft || !fields) return <NotFound onBack={() => router.replace('/(app)')} />
  const f = fields
  const done = [1, 2, 3, 4, 5, 6, 7, 8].map(i => sectionComplete(i, f))
  const incomplete = done.map(d => !d)
  const problems = draftProblems(f)

  // Identify all missing/invalid fields in this section
  const issues = getMissingReportIssues(f, { engineer: !!draft.engineerSigUri, client: !!draft.clientSigUri }, localId)
  // Missing fields are marked only when the engineer came from the review's list (?check=1), not while filling in.
  const sectionIssues = check === '1' ? issues.filter(x => x.section === n) : []
  const issueMap = new Map(sectionIssues.map(i => [i.fieldKey, i.message]))

  const recordLayout = (key: string, y: number) => {
    fieldPositions.current[key] = y
    // Auto-scroll to the first problem in this section on entry
    if (!scrolledRef.current && sectionIssues.length > 0 && sectionIssues[0].fieldKey === key) {
      scrolledRef.current = true
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true })
      }, 100)
    }
  }

  const set = (p: Partial<ReportFields>) => { setSaved(false); setFields(p) }

  const next = async () => {
    await flush()
    if (!done[n - 1] && sectionIssues.length > 0) {
      const firstKey = sectionIssues[0].fieldKey
      const y = fieldPositions.current[firstKey]
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true })
      }
    }
    router.push(n < 8 ? `/(app)/reports/${localId}/section/${n + 1}` : `/(app)/reports/${localId}/signatures`)
  }
  const back = async () => { await flush(); if (router.canGoBack()) router.back(); else router.replace(`/(app)/reports/${localId}/review`) }
  const saveExit = async () => { await flush(); setSaved(true); router.dismissAll(); router.replace('/(app)/drafts') }
  saveExitRef.current = () => { void saveExit() }

  /** Most items are usually GOOD: one tap fills every unanswered GOOD/DEFECT item of this section; DEFECTs are then changed individually. */
  const unansweredGd = section ? section.rows.filter(r => r.type === 'gd' && !f[r.key]) : []
  const markAllGood = () => set(Object.fromEntries(unansweredGd.map(r => [r.key, 'GOOD'])) as Partial<ReportFields>)

  /** Changing the visit date moves the default next visit (visit + 90) along, unless a different date was agreed. */
  const setVisitDate = (v: string | null) => {
    if (!v) return
    const wasDefault = !f.nextVisitDate || f.nextVisitDate === addDays(f.visitDate, 90) || f.nextVisitDate <= v
    set(wasDefault ? { visitDate: v, nextVisitDate: addDays(v, 90) } : { visitDate: v })
  }

  return <Screen scrollRef={scrollRef} footer={<>
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <Button title="Back" variant="secondary" onPress={back} style={{ flex: 1 }} />
      <Button title={n < 8 ? `Next: section ${n + 1}` : 'Next: signatures'} onPress={next} style={{ flex: 2 }} />
    </View>
    </>}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
      <Text style={{ color: colors.muted, fontSize: font.small, flex: 1 }}>{draft.clientName} · Section {n} of 8</Text><StateBadge state={draft.syncState} />
    </View>
    <Progress done={done} incomplete={incomplete} current={n} onSelect={async to => { await flush(); router.replace(`/(app)/reports/${localId}/section/${to}`) }} />
    {locked && <Text style={{ color: colors.danger, fontWeight: '800', marginBottom: space.md }}>
      {draft.syncState === 'conflict' ? 'Resolve the conflict on the Review screen before editing.' : 'This report is submitted and locked. Values are read-only.'}</Text>}
    {!locked && problems.length > 0 && <Text accessibilityRole="alert" style={{ color: colors.danger, fontWeight: '700', marginBottom: space.md }}>{problems.join('\n')}</Text>}

    {n === 1 && <View style={{ marginBottom: space.md, padding: space.md, backgroundColor: colors.surface, borderRadius: 10 }}>
      <Text style={{ fontWeight: '800', fontSize: font.base, marginBottom: space.sm }}>Visit details</Text>
      <Field
        label="Visit date"
        error={issueMap.get('visitDate')}
        onLayout={e => recordLayout('visitDate', e.nativeEvent.layout.y)}
      >
        <DateField value={f.visitDate} editable={!locked} min={LIMITS.minDate} max={addDays(todayIso(), LIMITS.futureDays)} onChange={setVisitDate} />
      </Field>
      <Field label="Previous maintenance date">
        <DateField value={f.previousMaintenanceDate} editable={!locked} clearable max={f.visitDate} placeholder="Not recorded" onChange={v => set({ previousMaintenanceDate: v })} />
      </Field>
      <Field
        label="Number of technicians"
        error={issueMap.get('technicianCount')}
        onLayout={e => recordLayout('technicianCount', e.nativeEvent.layout.y)}
      >
        <NumberInput integer max={LIMITS.maxTechnicians} value={f.technicianCount} editable={!locked} onChange={v => set({ technicianCount: v })} />
      </Field>
      {!headerComplete(f) && <Text style={{ color: colors.muted, fontSize: font.small }}>Visit date and number of technicians are required.</Text>}
    </View>}

    {section && <>
      {!locked && unansweredGd.length > 1 && <Button title={`✓ Mark ${unansweredGd.length} unanswered as GOOD`} variant="secondary" onPress={markAllGood} style={{ marginBottom: space.lg, borderColor: colors.good }} />}
      {section.rows.map(r => (
        <Field
          key={r.key}
          label={r.label}
          error={issueMap.get(r.key)}
          onLayout={e => recordLayout(r.key, e.nativeEvent.layout.y)}
        >
          {r.type === 'num'
            ? <NumberInput value={f[r.key] as number | null | undefined} editable={!locked} max={LIMITS.maxNumber} onChange={v => set({ [r.key]: v } as Partial<ReportFields>)} placeholder="Enter value" />
            : <Toggle value={f[r.key] as string | null} disabled={locked} options={r.type === 'yn' ? ['YES', 'NO'] : ['GOOD', 'DEFECT']} onChange={v => set({ [r.key]: v } as Partial<ReportFields>)} />}
        </Field>
      ))}
      <Field label={section.remarksLabel ?? 'Remarks'}><Input value={(f[section.remarks] as string) ?? ''} editable={!locked} multiline maxLength={LIMITS.maxText} onChangeText={v => set({ [section.remarks]: v } as Partial<ReportFields>)} placeholder="Optional" /></Field>
    </>}

    {n === 8 && <>
      <Field label="General observations"><Input value={f.s8GeneralObservations ?? ''} editable={!locked} multiline maxLength={LIMITS.maxText} onChangeText={v => set({ s8GeneralObservations: v })} /></Field>
      <Field label="Action required"><Input value={f.s8ActionRequired ?? ''} editable={!locked} multiline maxLength={LIMITS.maxText} onChangeText={v => set({ s8ActionRequired: v })} /></Field>
      <Field
        label="Next visit date"
        error={issueMap.get('nextVisitDate')}
        onLayout={e => recordLayout('nextVisitDate', e.nativeEvent.layout.y)}
        hint="Defaults to 90 days after the visit date. Change it if a different date was agreed."
      >
        <DateField value={f.nextVisitDate} editable={!locked} min={addDays(f.visitDate, 1)} max={addDays(f.visitDate, 365 * LIMITS.nextVisitYears)} onChange={v => set({ nextVisitDate: v })} />
      </Field>
      {!locked && <Button title="Reset to visit date + 90 days" variant="ghost" onPress={() => set({ nextVisitDate: addDays(f.visitDate, 90) })} />}
    </>}
  </Screen>
}
