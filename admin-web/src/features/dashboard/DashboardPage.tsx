import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CalendarPlus, CheckCircle2, ClipboardList, FilePenLine, ShieldAlert, UserPlus, Wrench } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { addDaysIso, amcTone, cx, daysUntil, fmtDate, monthStartIso, parseIsoDate, statusTone, today } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, Table } from '../../components/ui'

const dueLabel = (iso?: string | null) => {
  if (!iso) return { text: 'No date', cls: 'bg-slate-100 text-slate-600' }
  const d = daysUntil(iso)
  return d <= 0 ? { text: 'Today', cls: 'bg-red-100 text-red-700' } : d === 1 ? { text: 'Tomorrow', cls: 'bg-amber-100 text-amber-800' } : { text: `In ${d} days`, cls: 'bg-sky-100 text-sky-800' }
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">{children}</h2>{action}</div>
}

export default function DashboardPage() {
  const nav = useNavigate()
  const t = today(); const in14 = addDaysIso(14); const monthStart = monthStartIso()
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard.summary })
  const recent = useQuery({ queryKey: ['reports', { recent: true }], queryFn: () => api.reports.list({ pageSize: 8, sort: 'updated_desc' }) })
  const upcoming = useQuery({ queryKey: ['schedule', t, in14], queryFn: () => api.schedule.range(t, in14) })
  const todays = useQuery({ queryKey: ['appointments', t, t], queryFn: () => api.appointments.list({ from: t, to: t }) })
  const dateLine = parseIsoDate(t).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const month = new Date(`${monthStart}T00:00:00`).toLocaleDateString('en-IN', { month: 'long' })
  const s = summary.data

  // Each card links to the list that produces the same number.
  return <>
    <PageHeader title="Dashboard" subtitle={dateLine} actions={<>
      <Button variant="secondary" onClick={() => nav('/clients')}><UserPlus className="h-4 w-4" aria-hidden />Clients</Button>
      <Button onClick={() => nav('/calendar')}><CalendarPlus className="h-4 w-4" aria-hidden />Assign a visit</Button></>} />

    {summary.isLoading ? <Skeleton rows={2} /> : summary.isError ? <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} /> : <>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{month} at a glance</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Visits this month" value={s!.visitsThisMonth} icon={ClipboardList} hint="Open reports →" onClick={() => nav(`/reports?from=${monthStart}&to=${t}`)} />
        <StatCard label="Submitted reports" value={s!.submittedReports} tone="ok" icon={CheckCircle2} hint="All submitted →" onClick={() => nav('/reports')} />
        <StatCard label="Pending drafts" value={s!.pendingDrafts} tone={s!.pendingDrafts ? 'warn' : 'default'} icon={FilePenLine} hint="Not yet submitted →" onClick={() => nav('/reports?status=draft')} />
        <StatCard label="Defects this month" value={s!.defectsIdentified} tone={s!.defectsIdentified ? 'danger' : 'default'} icon={Wrench} hint="Defect summary →" onClick={() => nav(`/defects?from=${monthStart}&to=${t}`)} />
      </div>
      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">Needs attention</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Due in the next 14 days" value={s!.upcomingVisits} icon={CalendarClock} hint="Upcoming visits →" onClick={() => nav('/schedule?days=14')} />
        <StatCard label="Overdue visits" value={s!.overdueVisits} tone={s!.overdueVisits ? 'danger' : 'ok'} icon={AlertTriangle} hint={s!.overdueVisits ? 'Plan these first →' : 'Nothing overdue'} onClick={() => nav('/schedule?tab=overdue')} />
        <StatCard label="AMC expiring in 30 days" value={s!.amcExpiringSoon} tone={s!.amcExpiringSoon ? 'warn' : 'ok'} icon={ShieldAlert} hint="AMC list →" onClick={() => nav('/amc?expiring=30')} />
      </div></>}

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card className="min-w-0">
        <SectionTitle action={<Link to="/calendar" className="text-sm font-medium text-sky-700 hover:underline">Plan visits</Link>}>Today's assigned visits</SectionTitle>
        {todays.isLoading ? <Skeleton rows={3} /> : todays.isError ? <ErrorState message={errorMessage(todays.error)} onRetry={() => todays.refetch()} />
          : todays.data!.filter(a => a.status !== 'cancelled').length === 0 ? <EmptyState text="No visits assigned for today." />
          : <ul className="divide-y divide-slate-100">{todays.data!.filter(a => a.status !== 'cancelled').map(a =>
            <li key={a.id}><button type="button" onClick={() => nav(`/clients/${a.clientId}`)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-slate-700">{a.scheduledTime?.slice(0, 5) ?? '—'}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-900">{a.clientName}</span>
                <span className="block truncate text-xs text-slate-500">{a.engineerName}{a.siteLocation ? ` · ${a.siteLocation}` : ''}</span></span>
              <Badge tone={a.status === 'completed' ? 'green' : 'blue'}>{a.status === 'completed' ? 'done' : 'scheduled'}</Badge></button></li>)}</ul>}
      </Card>
      <Card className="min-w-0">
        <SectionTitle action={<Link to="/schedule?days=14" className="text-sm font-medium text-sky-700 hover:underline">View all</Link>}>Maintenance due (next 14 days)</SectionTitle>
        {upcoming.isLoading ? <Skeleton rows={3} /> : upcoming.isError ? <ErrorState message={errorMessage(upcoming.error)} onRetry={() => upcoming.refetch()} /> : upcoming.data!.length === 0 ? <EmptyState text="No visits due in the next 14 days." /> :
          <ul className="divide-y divide-slate-100">{upcoming.data!.slice(0, 8).map(r => { const due = dueLabel(r.nextDueDate)
            return <li key={r.clientId}><button type="button" onClick={() => nav(`/clients/${r.clientId}`)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-900">{r.clientName}</span>
                <span className="block truncate text-xs text-slate-500">{r.siteLocation ?? 'No site location'} · due {fmtDate(r.nextDueDate)}</span></span>
              <Badge tone={amcTone(r.amcStatus)}>{r.amcStatus}</Badge>
              <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', due.cls)}>{due.text}</span></button></li> })}</ul>}
      </Card>
    </div>

    <Card className="mt-6 min-w-0">
      <SectionTitle action={<Link to="/reports" className="text-sm font-medium text-sky-700 hover:underline">See all</Link>}>Recent reports</SectionTitle>
      {recent.isLoading ? <Skeleton /> : recent.isError ? <ErrorState message={errorMessage(recent.error)} onRetry={() => recent.refetch()} /> : recent.data!.items.length === 0 ? <EmptyState text="No reports yet." /> :
        <Table rows={recent.data!.items} keyOf={r => r.id} onRow={r => nav(`/reports/${r.id}`)} rowLabel={r => `Open report ${r.reportRef ?? 'draft'} for ${r.clientName}`} cols={[
          { h: 'Ref', cell: r => r.reportRef ? <span className="font-medium text-slate-900">{r.reportRef}</span> : <span className="italic text-slate-400">Not submitted</span> },
          { h: 'Client', cell: r => <span className="block max-w-[14rem] truncate" title={r.clientName}>{r.clientName}</span> },
          { h: 'Engineer', cell: r => <span className="block max-w-[10rem] truncate">{r.engineerName ?? '—'}</span> },
          { h: 'Visit', cell: r => fmtDate(r.visitDate) },
          { h: 'Status', cell: r => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
          { h: 'Defects', cell: r => r.defectCount ? <span className="font-semibold text-red-600">{r.defectCount}</span> : '—', className: 'text-right' }]} />}
    </Card>
  </>
}
