import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import { addDaysIso, today } from '../../lib/format'
import { Button, EmptyState, ErrorState, Field, Input, PageHeader, Skeleton } from '../../components/ui'

const isIso = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export default function DefectSummaryPage() {
  const [sp, setSp] = useSearchParams(); const nav = useNavigate()
  const from = isIso(sp.get('from')) ? sp.get('from')! : addDaysIso(-90)
  const to = isIso(sp.get('to')) ? sp.get('to')! : today()
  const set = (k: 'from' | 'to', v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }) }
  const q = useQuery({ queryKey: ['defects', from, to], queryFn: () => api.defects(from, to), enabled: from <= to })
  const max = Math.max(1, ...(q.data?.map(d => d.count) ?? [1]))
  return <>
    <PageHeader title="Defect summary" subtitle="Count of DEFECT results per inspection item in submitted reports" />
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <Field label="From"><Input type="date" value={from} max={to} onChange={e => set('from', e.target.value)} className="w-44" /></Field>
      <Field label="To"><Input type="date" value={to} min={from} onChange={e => set('to', e.target.value)} className="w-44" /></Field>
      <Button variant="secondary" onClick={() => nav(`/reports?from=${from}&to=${to}&sort=defects_desc`)}>Open reports</Button>
    </div>
    {from > to ? <ErrorState message="The start date is after the end date." /> : q.isLoading ? <Skeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState text="No defects recorded in this period." /> :
      <ul className="space-y-2 rounded-xl bg-white shadow-card ring-1 ring-slate-900/6 p-5">{q.data.map(d => <li key={d.field} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm md:grid-cols-[280px_1fr_auto]">
        <span className="truncate">{d.label}</span><div className="hidden h-3 rounded bg-slate-100 md:block" aria-hidden><div className="h-3 rounded bg-red-500" style={{ width: `${(d.count / max) * 100}%` }} /></div><span className="w-8 text-right font-semibold text-red-700">{d.count}</span></li>)}</ul>}
  </>
}
