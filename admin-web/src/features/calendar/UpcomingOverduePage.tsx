import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarPlus, Download } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { Appointment, ScheduleItem } from '../../lib/types'
import { addDaysIso, amcTone, cx, daysUntil, fmtDate, saveBlob, today } from '../../lib/format'
import { Badge, Button, EmptyState, ErrorState, PageHeader, Select, Skeleton, Table } from '../../components/ui'
import { AppointmentModal, type AppointmentDraft } from './AppointmentModal'

const WINDOWS = [7, 14, 30, 60, 90]

export default function UpcomingOverduePage() {
  const [sp, setSp] = useSearchParams(); const nav = useNavigate()
  const tab = sp.get('tab') === 'overdue' ? 'overdue' : 'upcoming'
  const days = WINDOWS.includes(Number(sp.get('days'))) ? Number(sp.get('days')) : 60
  const t = today(); const until = addDaysIso(days)
  const upcoming = useQuery({ queryKey: ['schedule', t, until], queryFn: () => api.schedule.range(t, until), enabled: tab === 'upcoming' })
  const overdue = useQuery({ queryKey: ['schedule', 'overdue'], queryFn: api.schedule.overdue, enabled: tab === 'overdue' })
  const q = tab === 'upcoming' ? upcoming : overdue
  const [draft, setDraft] = useState<AppointmentDraft | null>(null)
  // open visits already assigned, so each due client shows who is going (or an Assign button)
  const assigned = useQuery({ queryKey: ['appointments', { open: true, t }], queryFn: () => api.appointments.list({ from: addDaysIso(-30), to: addDaysIso(180), status: 'scheduled' }) })
  const byClient = new Map<string, Appointment>()
  assigned.data?.forEach(a => { const cur = byClient.get(a.clientId); if (!cur || a.scheduledDate < cur.scheduledDate) byClient.set(a.clientId, a) })
  const csv = (rows: ScheduleItem[]) => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['Client', 'Site', 'Next due', 'Previous maintenance', 'AMC'].map(cell).join(','), ...rows.map(r => [r.clientName, r.siteLocation, r.nextDueDate, r.previousMaintenanceDate, r.amcStatus].map(cell).join(','))]
    // BOM so Excel reads UTF-8 (non-ASCII client names) correctly; CRLF line endings for Excel on Windows.
    saveBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${tab}-visits-${t}.csv`)
  }
  const setTab = (v: 'upcoming' | 'overdue') => setSp(v === 'overdue' ? { tab: v } : days === 60 ? {} : { days: String(days) })
  const dayText = (iso?: string | null) => { if (!iso) return '—'; const d = daysUntil(iso); return d === 0 ? 'today' : d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : `in ${d} day${d === 1 ? '' : 's'}` }

  return <>
    <PageHeader title="Upcoming and overdue visits" actions={q.data && q.data.length > 0 && <Button variant="secondary" onClick={() => csv(q.data!)}><Download className="h-4 w-4" aria-hidden />CSV</Button>} />
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Visit list" className="flex gap-1 rounded-lg bg-slate-200/60 p-1 text-sm">{(['upcoming', 'overdue'] as const).map(v => <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cx('rounded px-3 py-1.5', tab === v ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}>{v === 'upcoming' ? `Upcoming (${days} days)` : 'Overdue'}</button>)}</div>
      {tab === 'upcoming' && <Select aria-label="Upcoming window" value={days} onChange={e => setSp({ days: e.target.value })} className="w-36">{WINDOWS.map(w => <option key={w} value={w}>Next {w} days</option>)}</Select>}
    </div>
    {q.isLoading ? <Skeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState text={tab === 'overdue' ? 'No overdue visits. 🎉' : `No visits due in the next ${days} days.`} /> :
      <Table rows={q.data} keyOf={r => r.clientId} onRow={r => nav(`/clients/${r.clientId}`)} rowLabel={r => `Open client ${r.clientName}`} cols={[
        { h: 'Client', cell: r => <span className="block max-w-[16rem] truncate font-medium" title={r.clientName}>{r.clientName}</span> }, { h: 'Site', cell: r => r.siteLocation ?? '—' },
        { h: 'Due', cell: r => <span className={r.isOverdue ? 'font-semibold text-red-700' : ''}>{fmtDate(r.nextDueDate)}</span> }, { h: 'When', cell: r => dayText(r.nextDueDate) },
        { h: 'Previous', cell: r => fmtDate(r.previousMaintenanceDate) }, { h: 'AMC', cell: r => <Badge tone={amcTone(r.amcStatus)}>{r.amcStatus}</Badge> },
        { h: 'Assigned to', cell: r => { const a = byClient.get(r.clientId)
          return a ? <button type="button" className="text-left text-sky-800 hover:underline" onClick={e => { e.stopPropagation(); setDraft({ appointment: a }) }}>{a.engineerName}<span className="block text-xs text-slate-500">{fmtDate(a.scheduledDate)}{a.scheduledTime ? `, ${a.scheduledTime.slice(0, 5)}` : ''}</span></button>
            : <Button variant="secondary" className="px-2 py-1" onClick={e => { e.stopPropagation(); setDraft({ clientId: r.clientId, date: r.nextDueDate && r.nextDueDate >= t ? r.nextDueDate : t }) }}><CalendarPlus className="h-4 w-4" aria-hidden />Assign</Button> } }]} />}
    <AppointmentModal draft={draft} onClose={() => setDraft(null)} />
  </>
}
