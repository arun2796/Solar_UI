import { useEffect, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { useCan } from '../../../lib/auth'
import { PERM } from '../../../lib/types'
import { initialKind, KindSwitch, type WorkKind } from '../../../components/KindSwitch'
import { ReportDrafts } from '../../../screens/ReportDrafts'
import { SurveyDrafts } from '../../../screens/SurveyDrafts'

/** Drafts on this phone: maintenance reports and/or site surveys, depending on what the account may do. */
export default function Drafts() {
  const { kind } = useLocalSearchParams<{ kind?: string }>()
  const canReports = useCan(PERM.reportsWork), canSurveys = useCan(PERM.surveysWork)
  const [k, setK] = useState<WorkKind>(() => initialKind(kind, canReports, canSurveys))
  useEffect(() => { setK(initialKind(kind, canReports, canSurveys)) }, [kind, canReports, canSurveys])
  const header = canReports && canSurveys ? <KindSwitch value={k} onChange={setK} /> : null
  return k === 'surveys' ? <SurveyDrafts header={header} /> : <ReportDrafts header={header} />
}
