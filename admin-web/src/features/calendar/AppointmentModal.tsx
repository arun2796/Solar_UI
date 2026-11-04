import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import type { Appointment, AppointmentUpsert } from '../../lib/types'
import { invalidateAppointments } from '../../lib/invalidate'
import { fmtDate, today } from '../../lib/format'
import { Badge, Button, Field, Input, Modal, Notice, Select, Textarea } from '../../components/ui'
import { canAssign, PERM } from '../../lib/roles'

/** What the dialog starts with: an existing appointment to edit, or defaults for a new one. */
export type AppointmentDraft = { appointment?: Appointment; clientId?: string; engineerId?: string; date?: string }

/**
 * Schedule a visit (admin assigns an engineer to a client on a day), or change / cancel an existing one.
 * Completed and cancelled appointments open read-only.
 */
export function AppointmentModal({ draft, onClose }: { draft: AppointmentDraft | null; onClose: () => void }) {
  if (!draft) return null
  // keyed so a different appointment/day always starts from fresh values
  return <AppointmentDialog key={draft.appointment?.id ?? `new-${draft.clientId ?? ''}-${draft.date ?? ''}`} draft={draft} onClose={onClose} />
}

const initial = (draft: AppointmentDraft): AppointmentUpsert => {
  const a = draft.appointment
  return a
    ? { clientId: a.clientId, engineerId: a.engineerId, scheduledDate: a.scheduledDate, scheduledTime: a.scheduledTime?.slice(0, 5) ?? '', notes: a.notes ?? '' }
    : { clientId: draft.clientId ?? '', engineerId: draft.engineerId ?? '', scheduledDate: draft.date && draft.date >= today() ? draft.date : today(), scheduledTime: '', notes: '' }
}

function AppointmentDialog({ draft, onClose }: { draft: AppointmentDraft; onClose: () => void }) {
  const qc = useQueryClient()
  const a = draft.appointment
  const editable = !a || a.status === 'scheduled'
  const [f, setF] = useState<AppointmentUpsert>(() => initial(draft))
  const [confirmCancel, setConfirmCancel] = useState(false)

  const clients = useQuery({ queryKey: ['clients', 'active-all'], queryFn: api.activeClients, staleTime: 60_000 })
  const engineers = useQuery({ queryKey: ['engineers', true], queryFn: () => api.engineers.list(true), staleTime: 60_000 })
  // other visits the chosen engineer already has that day (shown as a hint, not a block)
  const sameDay = useQuery({
    queryKey: ['appointments', { from: f.scheduledDate, to: f.scheduledDate, engineerId: f.engineerId }],
    queryFn: () => api.appointments.list({ from: f.scheduledDate, to: f.scheduledDate, engineerId: f.engineerId, status: 'scheduled' }),
    enabled: editable && !!f.engineerId && !!f.scheduledDate,
  })
  const others = (sameDay.data ?? []).filter(x => x.id !== a?.id)

  const done = () => { invalidateAppointments(qc); onClose() }
  const payload = (): AppointmentUpsert => ({ ...f, scheduledTime: f.scheduledTime || null, notes: f.notes?.trim() || null })
  const save = useMutation({ mutationFn: () => (a ? api.appointments.update(a.id, payload()) : api.appointments.create(payload())), onSuccess: done })
  const cancel = useMutation({ mutationFn: () => api.appointments.cancel(a!.id), onSuccess: done })
  const set = <K extends keyof AppointmentUpsert>(k: K, v: AppointmentUpsert[K]) => { save.reset(); setF(p => ({ ...p, [k]: v })) }
  const canSave = !!f.clientId && !!f.engineerId && !!f.scheduledDate

  const title = !a ? 'Schedule a visit' : a.status === 'scheduled' ? 'Edit visit' : a.status === 'completed' ? 'Completed visit' : 'Cancelled visit'
  return <Modal open title={title} onClose={onClose} closeOnBackdrop={false}>
    {a && !editable && <div className="mb-3 space-y-1 text-sm">
      <div><Badge tone={a.status === 'completed' ? 'green' : 'slate'}>{a.status}</Badge></div>
      <div><b>{a.clientName}</b>{a.siteLocation ? ` · ${a.siteLocation}` : ''}</div>
      <div>{fmtDate(a.scheduledDate)}{a.scheduledTime ? `, ${a.scheduledTime.slice(0, 5)}` : ''} · {a.engineerName}</div>
      {a.notes && <div className="text-slate-600">{a.notes}</div>}
      {a.reportId && <Link to={`/reports/${a.reportId}`} className="inline-block text-sky-700 hover:underline" onClick={onClose}>Open report {a.reportRef ?? ''}</Link>}
    </div>}
    {editable && <form onSubmit={e => { e.preventDefault(); if (canSave) save.mutate() }} className="space-y-3" noValidate>
      <Field label="Client *">
        <Select value={f.clientId} onChange={e => set('clientId', e.target.value)} disabled={clients.isLoading} aria-label="Client">
          <option value="">{clients.isLoading ? 'Loading clients…' : '— Choose a client —'}</option>
          {clients.data?.map(c => <option key={c.id} value={c.id}>{c.name}{c.siteLocation ? ` — ${c.siteLocation}` : ''}</option>)}
        </Select></Field>
      <Field label="Engineer *">
        <Select value={f.engineerId} onChange={e => set('engineerId', e.target.value)} disabled={engineers.isLoading} aria-label="Engineer">
          <option value="">{engineers.isLoading ? 'Loading engineers…' : '— Choose an engineer —'}</option>
          {engineers.data?.filter(x => canAssign(x, PERM.reportsWork, a?.engineerId)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date *"><Input type="date" value={f.scheduledDate} min={a ? undefined : today()} onChange={e => set('scheduledDate', e.target.value)} /></Field>
        <Field label="Time" hint="Optional"><Input type="time" value={f.scheduledTime ?? ''} onChange={e => set('scheduledTime', e.target.value)} /></Field>
      </div>
      <Field label="Note for the engineer" hint="Optional, e.g. call before coming, bring a ladder"><Textarea value={f.notes ?? ''} maxLength={500} onChange={e => set('notes', e.target.value)} /></Field>
      {others.length > 0 && <Notice tone="info">This engineer already has {others.length} other visit{others.length > 1 ? 's' : ''} that day: {others.map(o => `${o.scheduledTime ? o.scheduledTime.slice(0, 5) + ' ' : ''}${o.clientName}`).join(', ')}.</Notice>}
      {save.error && <Notice>{errorMessage(save.error)}</Notice>}
      {cancel.error && <Notice>{errorMessage(cancel.error)}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div>{a && (confirmCancel
          ? <span className="flex items-center gap-2 text-sm">Cancel this visit?<Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Yes, cancel visit</Button><Button variant="ghost" onClick={() => setConfirmCancel(false)}>No</Button></span>
          : <Button variant="ghost" className="text-red-700" onClick={() => setConfirmCancel(true)}>Cancel visit</Button>)}</div>
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button type="submit" loading={save.isPending} disabled={!canSave}>{a ? 'Save changes' : 'Assign visit'}</Button></div>
      </div>
    </form>}
    {!editable && <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
  </Modal>
}
