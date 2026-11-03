import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarPlus, Pencil } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { ClientUpsert } from '../../lib/types'
import { invalidateClientData } from '../../lib/invalidate'
import { addDaysIso, amcTone, fmtDate, statusTone, today } from '../../lib/format'
import { Badge, Button, Card, ErrorState, Modal, PageHeader, Pagination, Skeleton, Table } from '../../components/ui'
import { ClientForm } from './ClientForm'
import { AppointmentModal, type AppointmentDraft } from '../calendar/AppointmentModal'

const HISTORY_PAGE = 20

export default function ClientDetailPage() {
  const { id = '' } = useParams(); const qc = useQueryClient(); const nav = useNavigate()
  const [page, setPage] = useState(1)
  const client = useQuery({ queryKey: ['client', id], queryFn: () => api.clients.get(id) })
  const reports = useQuery({ queryKey: ['reports', { clientId: id, page }], queryFn: () => api.reports.list({ clientId: id, page, pageSize: HISTORY_PAGE }) })
  const surveys = useQuery({ queryKey: ['surveys', { clientId: id }], queryFn: () => api.surveys.list({ clientId: id, pageSize: 10 }) })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<AppointmentDraft | null>(null)
  const visitsQ = useQuery({ queryKey: ['appointments', { clientId: id }], queryFn: () => api.appointments.list({ from: addDaysIso(-30), to: addDaysIso(365), clientId: id }) })
  const visits = { ...visitsQ, data: visitsQ.data?.filter(a => a.status !== 'cancelled') }   // cancelled ones stay in the audit log, not on this page
  const update = useMutation({ mutationFn: (d: ClientUpsert) => api.clients.update(id, d), onSuccess: () => { invalidateClientData(qc, id); setEditing(false) } })
  if (client.isLoading) return <Skeleton />
  if (client.isError) return <ErrorState message={errorMessage(client.error)} onRetry={() => client.refetch()} />
  const c = client.data!
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm"><span className="text-slate-500">{k}</span><span className="text-right">{v === null || v === undefined || v === '' ? '—' : v}</span></div>
  return <>
    <PageHeader title={c.name} subtitle={c.siteLocation ?? c.address ?? undefined} actions={<><Badge tone={c.isActive ? 'green' : 'red'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>{c.isActive && <Button onClick={() => setDraft({ clientId: c.id, date: c.nextDueDate && c.nextDueDate >= today() ? c.nextDueDate : today() })}><CalendarPlus className="h-4 w-4" aria-hidden />Schedule visit</Button>}<Button variant="secondary" onClick={() => { update.reset(); setEditing(true) }}><Pencil className="h-4 w-4" aria-hidden />Edit</Button></>} />
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><h2 className="mb-2 font-semibold">Contact</h2>{row('Contact person', c.contactPerson)}{row('Phone', c.phone)}{row('Email', c.email)}{row('Address', c.address)}</Card>
      <Card><h2 className="mb-2 font-semibold">Installation</h2>{row('Capacity', c.solarCapacityKwp != null ? `${c.solarCapacityKwp} kWp` : null)}{row('Modules', [c.moduleMake, c.moduleModel, c.moduleCount != null ? `${c.moduleCount} nos` : null, c.moduleWattage != null ? `${c.moduleWattage} W` : null].filter(Boolean).join(', ') || null)}
        {row('Inverter', [c.inverterMake, c.inverterModel, c.inverterCapacityKw != null ? `${c.inverterCapacityKw} kW` : null].filter(Boolean).join(', ') || null)}{row('Installed', fmtDate(c.installationDate))}</Card>
      <Card><h2 className="mb-2 font-semibold">Maintenance and AMC</h2>{row('Previous maintenance', fmtDate(c.previousMaintenanceDate))}{row('Next due', fmtDate(c.nextDueDate))}{row('AMC status', <Badge tone={amcTone(c.amcStatus)}>{c.amcStatus}</Badge>)}{row('AMC period', `${fmtDate(c.amcStartDate)} → ${fmtDate(c.amcExpiryDate)}`)}
        <Link to={`/amc?client=${c.id}`} className="mt-2 inline-block text-sm text-sky-700 hover:underline">Manage AMC</Link></Card>
    </div>
    <Card className="mt-4"><h2 className="mb-3 font-semibold">Assigned visits</h2>
      {visits.isLoading ? <Skeleton rows={2} /> : visits.isError ? <ErrorState message={errorMessage(visits.error)} onRetry={() => visitsQ.refetch()} /> : !visits.data?.length ? <p className="text-sm text-slate-500">No visits assigned. Use “Schedule visit” to assign an engineer.</p> :
        <Table rows={visits.data} keyOf={a => a.id} onRow={a => setDraft({ appointment: a })} rowLabel={a => `Open visit on ${fmtDate(a.scheduledDate)}`} cols={[
          { h: 'Date', cell: a => fmtDate(a.scheduledDate) }, { h: 'Time', cell: a => a.scheduledTime?.slice(0, 5) ?? '—' }, { h: 'Engineer', cell: a => a.engineerName },
          { h: 'Status', cell: a => <Badge tone={a.status === 'completed' ? 'green' : a.status === 'cancelled' ? 'slate' : 'blue'}>{a.status}</Badge> },
          { h: 'Report', cell: a => a.reportRef ?? '—' }, { h: 'Note', cell: a => <span className="block max-w-[14rem] truncate" title={a.notes ?? ''}>{a.notes ?? '—'}</span> }]} />}
    </Card>
    <Card className="mt-4"><h2 className="mb-3 font-semibold">Maintenance history</h2>
      {reports.isLoading ? <Skeleton /> : reports.isError ? <ErrorState message={errorMessage(reports.error)} onRetry={() => reports.refetch()} /> : reports.data!.items.length === 0 ? <p className="text-sm text-slate-500">No reports yet.</p> : <>
        <Table rows={reports.data!.items} keyOf={r => r.id} onRow={r => nav(`/reports/${r.id}`)} rowLabel={r => `Open report ${r.reportRef ?? 'draft'}`} cols={[
          { h: 'Ref', cell: r => r.reportRef ?? <span className="text-slate-400">draft</span> }, { h: 'Visit', cell: r => fmtDate(r.visitDate) }, { h: 'Engineer', cell: r => r.engineerName },
          { h: 'Status', cell: r => <Badge tone={statusTone(r.status)}>{r.status}</Badge> }, { h: 'Defects', cell: r => r.defectCount || '—' }, { h: 'Next visit', cell: r => fmtDate(r.nextVisitDate) }]} />
        {reports.data!.total > HISTORY_PAGE && <Pagination page={page} pageSize={HISTORY_PAGE} total={reports.data!.total} onPage={setPage} />}</>}</Card>
    <Card className="mt-4"><h2 className="mb-3 font-semibold">Site surveys</h2>
      {surveys.isLoading ? <Skeleton rows={2} /> : surveys.isError ? <ErrorState message={errorMessage(surveys.error)} onRetry={() => surveys.refetch()} /> : surveys.data!.items.length === 0 ? <p className="text-sm text-slate-500">No site surveys for this client yet.</p> :
        <Table rows={surveys.data!.items} keyOf={s => s.id} onRow={s => nav(`/surveys/${s.id}`)} rowLabel={s => `Open survey ${s.surveyRef ?? 'draft'}`} cols={[
          { h: 'Ref', cell: s => s.surveyRef ?? <span className="text-slate-400">draft</span> },
          { h: 'Visit date', cell: s => fmtDate(s.createdAt) },
          { h: 'Engineer', cell: s => s.engineerName },
          { h: 'Capacity', cell: s => s.recommendedSystemSizeKw ? `${s.recommendedSystemSizeKw} kW` : '—' },
          { h: 'Verdict', cell: s => s.verdict ? <Badge tone={s.verdict === 'FEASIBLE' ? 'green' : s.verdict === 'CONDITIONAL' ? 'amber' : 'red'}>{s.verdict}</Badge> : '—' },
          { h: 'Status', cell: s => <Badge tone="blue">{s.status.toUpperCase()}</Badge> },
        ]} />}
    </Card>
    <Modal open={editing} title="Edit client" onClose={() => setEditing(false)} wide closeOnBackdrop={false}>
      <ClientForm initial={c} onSubmit={d => update.mutate(d)} busy={update.isPending} onCancel={() => setEditing(false)} error={update.error ? errorMessage(update.error) : null} /></Modal>
    <AppointmentModal draft={draft} onClose={() => setDraft(null)} />
  </>
}
