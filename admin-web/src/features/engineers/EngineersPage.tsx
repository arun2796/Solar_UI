import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { Engineer } from '../../lib/types'
import { fmtDate } from '../../lib/format'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Skeleton, Table } from '../../components/ui'

const optStr = (max: number) => z.string().trim().max(max, `At most ${max} characters`).optional().or(z.literal('')).transform(v => (v ? v : null))
const mobilePhoneOpt = z.preprocess(v => {
  if (typeof v !== 'string' || !v.trim()) return null
  const clean = v.trim().replace(/\s+/g, '')
  return clean.startsWith('+91') ? clean.slice(3) : clean
}, z.string().regex(/^[6-9]\d{9}$/, 'Mobile number must be exactly 10 digits starting with 6-9').nullable().optional())

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'At most 200 characters'),
  email: z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email').max(200, 'At most 200 characters'),
  phone: mobilePhoneOpt,
  employeeCode: optStr(50),
  password: z.string().min(8, 'At least 8 characters').max(128, 'At most 128 characters'),
})
const updateSchema = createSchema.pick({ name: true, phone: true, employeeCode: true })
type CreateData = z.output<typeof createSchema>
type UpdateData = z.output<typeof updateSchema>

export default function EngineersPage() {
  const qc = useQueryClient()
  const [active, setActive] = useState('true')
  const list = useQuery({ queryKey: ['engineers', active], queryFn: () => api.engineers.list(active === 'all' ? undefined : active === 'true') })
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<Engineer | null>(null); const [toggle, setToggle] = useState<Engineer | null>(null)
  const done = () => { void qc.invalidateQueries({ queryKey: ['engineers'] }); setCreating(false); setEditing(null); setToggle(null) }
  const create = useMutation({ mutationFn: (d: CreateData) => api.engineers.create(d), onSuccess: done })
  const update = useMutation({ mutationFn: (d: UpdateData) => api.engineers.update(editing!.id, d), onSuccess: done })
  const setActiveM = useMutation({ mutationFn: (e: Engineer) => api.engineers.setActive(e.id, !e.isActive), onSuccess: done })
  const [pwFor, setPwFor] = useState<Engineer | null>(null); const [newPw, setNewPw] = useState('')
  const setPw = useMutation({ mutationFn: () => api.engineers.setPassword(pwFor!.id, newPw), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['engineers'] }); setPwFor(null); setNewPw('') } })

  return <>
    <PageHeader title="Engineers" subtitle="Field engineer accounts for the mobile app" actions={<Button onClick={() => { create.reset(); setCreating(true) }}><Plus className="h-4 w-4" aria-hidden />New engineer</Button>} />
    <Select aria-label="Active filter" value={active} onChange={e => setActive(e.target.value)} className="mb-3 w-40"><option value="true">Active</option><option value="false">Inactive</option><option value="all">All</option></Select>
    {list.isLoading ? <Skeleton /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : list.data!.length === 0 ? <EmptyState text="No engineers." /> :
      <Table rows={list.data!} keyOf={e => e.id} cols={[
        { h: 'Name', cell: e => <span className="font-medium">{e.name}</span> }, { h: 'Code', cell: e => e.employeeCode ?? '—' }, { h: 'Phone', cell: e => e.phone ?? '—' }, { h: 'Email', cell: e => e.email },
        { h: 'Login', cell: e => e.userId && e.hasPassword ? <Badge tone="green">password set</Badge> : <Badge tone="red">no password</Badge> },
        { h: 'Status', cell: e => <Badge tone={e.isActive ? 'green' : 'slate'}>{e.isActive ? 'Active' : 'Inactive'}</Badge> }, { h: 'Since', cell: e => fmtDate(e.createdAt) },
        { h: '', cell: e => <div className="flex justify-end gap-0.5">
          <Button variant="ghost" className="px-2" onClick={() => { update.reset(); setEditing(e) }} aria-label={`Edit ${e.name}`} title="Edit"><Pencil className="h-4 w-4" aria-hidden /></Button>
          <Button variant="ghost" className="px-2" onClick={() => { setPw.reset(); setNewPw(''); setPwFor(e) }} aria-label={`Set password for ${e.name}`} title={e.hasPassword ? 'Reset password' : 'Set password'}><KeyRound className="h-4 w-4" aria-hidden /></Button>
          <Button variant="ghost" className={e.isActive ? 'px-2 text-red-700' : 'px-2 text-emerald-700'} onClick={() => { setActiveM.reset(); setToggle(e) }} aria-label={`${e.isActive ? 'Deactivate' : 'Activate'} ${e.name}`} title={e.isActive ? 'Deactivate' : 'Activate'}>{e.isActive ? <UserX className="h-4 w-4" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}</Button>
        </div> }]} />}
    <Modal open={creating} title="New engineer" onClose={() => setCreating(false)} closeOnBackdrop={false}>
      <EngineerForm mode="create" onSubmit={d => create.mutate(d as CreateData)} busy={create.isPending} error={create.error ? errorMessage(create.error) : null} onCancel={() => setCreating(false)} /></Modal>
    <Modal open={!!editing} title={`Edit ${editing?.name ?? ''}`} onClose={() => setEditing(null)} closeOnBackdrop={false}>
      {editing && <EngineerForm mode="edit" initial={editing} onSubmit={d => update.mutate(d)} busy={update.isPending} error={update.error ? errorMessage(update.error) : null} onCancel={() => setEditing(null)} />}</Modal>
    <Modal open={!!pwFor} title={`${pwFor?.hasPassword ? 'Reset' : 'Set'} password for ${pwFor?.name ?? ''}`} onClose={() => setPwFor(null)} closeOnBackdrop={false}>
      <form onSubmit={ev => { ev.preventDefault(); if (newPw.length >= 8) setPw.mutate() }} className="space-y-3" noValidate>
        <Field label="New password *" error={newPw && newPw.length < 8 ? 'At least 8 characters' : undefined} hint="Share it with the engineer privately. They are signed out on all devices and sign in again with this password.">
          <Input type="text" autoComplete="new-password" value={newPw} onChange={ev => setNewPw(ev.target.value)} /></Field>
        {setPw.error && <Notice>{errorMessage(setPw.error)}</Notice>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPwFor(null)}>Cancel</Button><Button type="submit" loading={setPw.isPending} disabled={newPw.length < 8}>Save password</Button></div>
      </form></Modal>
    <ConfirmDialog open={!!toggle} title={toggle?.isActive ? 'Deactivate engineer' : 'Activate engineer'} danger={!!toggle?.isActive} loading={setActiveM.isPending} error={setActiveM.error ? errorMessage(setActiveM.error) : null}
      body={toggle?.isActive ? <><b>{toggle.name}</b> will be signed out and unable to log in. Reports are kept.</> : <><b>{toggle?.name}</b> will be able to log in again.</>} onConfirm={() => setActiveM.mutate(toggle!)} onClose={() => setToggle(null)} />
  </>
}

function EngineerForm({ mode, initial, onSubmit, busy, error, onCancel }: { mode: 'create' | 'edit'; initial?: Engineer; onSubmit: (d: CreateData | UpdateData) => void; busy: boolean; error: string | null; onCancel: () => void }) {
  type FormIn = z.input<typeof createSchema>
  const resolver = (mode === 'create' ? zodResolver(createSchema) : zodResolver(updateSchema)) as unknown as Resolver<FormIn, unknown, CreateData>
  const { register, handleSubmit, formState: { errors } } = useForm<FormIn, unknown, CreateData>({ resolver, defaultValues: initial ? { name: initial.name, phone: initial.phone ?? '', employeeCode: initial.employeeCode ?? '' } : {} })
  return <form onSubmit={handleSubmit(d => onSubmit(d))} className="space-y-3" noValidate>
    <Field label="Name *" error={errors.name?.message}><Input {...register('name')} /></Field>
    {mode === 'create' && <Field label="Email (login) *" error={errors.email?.message}><Input type="email" autoComplete="off" {...register('email')} /></Field>}
    <Field label="Phone" error={errors.phone?.message}><Input type="tel" placeholder="10-digit mobile, e.g. 9876543210" {...register('phone')} /></Field>
    <Field label="Employee code" error={errors.employeeCode?.message}><Input {...register('employeeCode')} /></Field>
    {mode === 'create' && <Field label="Initial password *" error={errors.password?.message} hint="Share it with the engineer privately. They can change it from the app profile."><Input type="text" autoComplete="new-password" {...register('password')} /></Field>}
    {error && <Notice>{error}</Notice>}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={busy}>{mode === 'create' ? 'Create login' : 'Save'}</Button></div>
  </form>
}
