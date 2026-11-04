import { useEffect, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { useCan } from '../../../lib/auth'
import { PERM } from '../../../lib/types'
import { initialKind, KindSwitch, type WorkKind } from '../../../components/KindSwitch'
import { ReportHistory } from '../../../screens/ReportHistory'
import { SurveyHistory } from '../../../screens/SurveyHistory'

/** Submitted work from the server: maintenance reports and/or site surveys, depending on what the account may do. */
export default function History() {
  const { kind } = useLocalSearchParams<{ kind?: string }>()
  const canReports = useCan(PERM.reportsWork), canSurveys = useCan(PERM.surveysWork)
  const [k, setK] = useState<WorkKind>(() => initialKind(kind, canReports, canSurveys))
  useEffect(() => { setK(initialKind(kind, canReports, canSurveys)) }, [kind, canReports, canSurveys])
  const header = canReports && canSurveys ? <KindSwitch value={k} onChange={setK} /> : null
  return k === 'surveys' ? <SurveyHistory header={header} /> : <ReportHistory header={header} />
}
