import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, type Resolver } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Pencil, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { Engineer, PermissionInfo, UserPermissions } from '../../lib/types'
import { cx } from '../../lib/format'
import { isValidPhone, normalizePhone, PHONE_MESSAGE } from '../../lib/phone'
import { PERM, ROLE_LABEL, ROLE_TONE } from '../../lib/roles'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Skeleton, Table } from '../../components/ui'

const optStr = (max: number) => z.string().trim().max(max, `At most ${max} characters`).optional().or(z.literal('')).transform(v => (v ? v : null))
const phoneOpt = z.preprocess(v => (typeof v === 'string' && v.trim() ? normalizePhone(v) : null),
  z.string().refine(isValidPhone, PHONE_MESSAGE).nullable().optional())

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'At most 200 characters'),
  email: z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email').max(200, 'At most 200 characters'),
  phone: phoneOpt,
  employeeCode: optStr(50),
  password: z.string().min(8, 'At least 8 characters').max(128, 'At most 128 characters'),
  role: z.enum(['engineer', 'site_engineer']),
})
const updateSchema = createSchema.pick({ name: true, phone: true, employeeCode: true, role: true })
type CreateData = z.output<typeof createSchema>
type UpdateData = z.output<typeof updateSchema>

export default function EngineersPage() {
  const qc = useQueryClient()
  const [active, setActive] = useState('true')
  const [roleFilter, setRoleFilter] = useState('')
  const list = useQuery({ queryKey: ['engineers', active], queryFn: () => api.engineers.list(active === 'all' ? undefined : active === 'true') })
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<Engineer | null>(null); const [toggle, setToggle] = useState<Engineer | null>(null)
  const [permsFor, setPermsFor] = useState<Engineer | null>(null)
  const done = () => { void qc.invalidateQueries({ queryKey: ['engineers'] }); setCreating(false); setEditing(null); setToggle(null) }
  const create = useMutation({ mutationFn: (d: CreateData) => api.engineers.create(d), onSuccess: done })
  const update = useMutation({ mutationFn: (d: UpdateData) => api.engineers.update(editing!.id, d), onSuccess: done })
  const setActiveM = useMutation({ mutationFn: (e: Engineer) => api.engineers.setActive(e.id, !e.isActive), onSuccess: done })
  const [pwFor, setPwFor] = useState<Engineer | null>(null); const [newPw, setNewPw] = useState('')
  const setPw = useMutation({ mutationFn: () => api.engineers.setPassword(pwFor!.id, newPw), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['engineers'] }); setPwFor(null); setNewPw('') } })
  const rows = (list.data ?? []).filter(e => !roleFilter || e.role === roleFilter)

  return <>
    <PageHeader title="Engineers" subtitle="Engineer and site engineer accounts for the mobile apps"
      actions={<Button onClick={() => { create.reset(); setCreating(true) }}><Plus className="h-4 w-4" aria-hidden />New engineer</Button>} />
    <div className="mb-4 flex flex-wrap gap-2">
      <Select aria-label="Active filter" value={active} onChange={e => setActive(e.target.value)} className="w-40"><option value="true">Active</option><option value="false">Inactive</option><option value="all">All</option></Select>
      <Select aria-label="Role filter" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="w-48"><option value="">All roles</option><option value="engineer">Engineers</option><option value="site_engineer">Site engineers</option></Select>
    </div>
    {list.isLoading ? <Skeleton /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState text="No engineers." /> :
      <Table rows={rows} keyOf={e => e.id} cols={[
        { h: 'Name', cell: e => <div className="leading-tight"><div className="font-medium text-slate-900">{e.name}</div><div className="text-xs text-slate-500">{e.email}{e.employeeCode ? ` · ${e.employeeCode}` : ''}</div></div> },
        { h: 'Role', cell: e => <Badge tone={ROLE_TONE[e.role]}>{ROLE_LABEL[e.role]}</Badge> },
        { h: 'Can do', cell: e => e.userId
          ? <button type="button" onClick={() => setPermsFor(e)} className="rounded-md text-sm font-medium text-sky-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500/25">{e.permissions.length} of {Object.keys(PERM).length} actions</button>
          : <span className="text-slate-400">—</span> },
        { h: 'Phone', cell: e => e.phone ?? '—' },
        { h: 'Login', cell: e => e.userId && e.hasPassword ? <Badge tone="green">password set</Badge> : <Badge tone="red">no password</Badge> },
        { h: 'Status', cell: e => <Badge tone={e.isActive ? 'green' : 'slate'}>{e.isActive ? 'Active' : 'Inactive'}</Badge> },
        { h: '', cell: e => <div className="flex justify-end gap-0.5">
          <Button variant="ghost" className="px-2" onClick={() => { update.reset(); setEditing(e) }} aria-label={`Edit ${e.name}`} title="Edit"><Pencil className="h-4 w-4" aria-hidden /></Button>
          {e.userId && <Button variant="ghost" className="px-2" onClick={() => setPermsFor(e)} aria-label={`Permissions for ${e.name}`} title="Permissions"><ShieldCheck className="h-4 w-4" aria-hidden /></Button>}
          <Button variant="ghost" className="px-2" onClick={() => { setPw.reset(); setNewPw(''); setPwFor(e) }} aria-label={`Set password for ${e.name}`} title={e.hasPassword ? 'Reset password' : 'Set password'}><KeyRound className="h-4 w-4" aria-hidden /></Button>
          <Button variant="ghost" className={e.isActive ? 'px-2 text-red-700' : 'px-2 text-emerald-700'} onClick={() => { setActiveM.reset(); setToggle(e) }} aria-label={`${e.isActive ? 'Deactivate' : 'Activate'} ${e.name}`} title={e.isActive ? 'Deactivate' : 'Activate'}>{e.isActive ? <UserX className="h-4 w-4" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}</Button>
        </div> }]} />}
    <Modal open={creating} title="New engineer" onClose={() => setCreating(false)} closeOnBackdrop={false}>
      <EngineerForm mode="create" onSubmit={d => create.mutate(d as CreateData)} busy={create.isPending} error={create.error ? errorMessage(create.error) : null} onCancel={() => setCreating(false)} /></Modal>
    <Modal open={!!editing} title={`Edit ${editing?.name ?? ''}`} onClose={() => setEditing(null)} closeOnBackdrop={false}>
      {editing && <EngineerForm mode="edit" initial={editing} onSubmit={d => update.mutate(d)} busy={update.isPending} error={update.error ? errorMessage(update.error) : null} onCancel={() => setEditing(null)} />}</Modal>
    <Modal open={!!permsFor} wide title={`Permissions for ${permsFor?.name ?? ''}`} onClose={() => setPermsFor(null)} closeOnBackdrop={false}>
      {permsFor && <PersonPermissions engineer={permsFor} onDone={() => setPermsFor(null)} />}</Modal>
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

const ROLE_HINT = 'Engineer: maintenance visits and reports. Site engineer: site surveys. What each role may do is set in Settings > Roles & permissions.'

function EngineerForm({ mode, initial, onSubmit, busy, error, onCancel }: { mode: 'create' | 'edit'; initial?: Engineer; onSubmit: (d: CreateData | UpdateData) => void; busy: boolean; error: string | null; onCancel: () => void }) {
  type FormIn = z.input<typeof createSchema>
  const resolver = (mode === 'create' ? zodResolver(createSchema) : zodResolver(updateSchema)) as unknown as Resolver<FormIn, unknown, CreateData>
  const { register, handleSubmit, formState: { errors } } = useForm<FormIn, unknown, CreateData>({ resolver,
    defaultValues: initial ? { name: initial.name, phone: initial.phone ?? '', employeeCode: initial.employeeCode ?? '', role: initial.role } : { role: 'engineer' } })
  return <form onSubmit={handleSubmit(d => onSubmit(d))} className="space-y-3" noValidate>
    <Field label="Name *" error={errors.name?.message}><Input {...register('name')} /></Field>
    <Field label="Role *" error={errors.role?.message} hint={ROLE_HINT}>
      <Select {...register('role')}><option value="engineer">Engineer</option><option value="site_engineer">Site engineer</option></Select></Field>
    {mode === 'create' && <Field label="Email (login) *" error={errors.email?.message}><Input type="email" autoComplete="off" {...register('email')} /></Field>}
    <Field label="Phone" error={errors.phone?.message}><Input type="tel" placeholder="e.g. 9876543210" {...register('phone')} /></Field>
    <Field label="Employee code" error={errors.employeeCode?.message}><Input {...register('employeeCode')} /></Field>
    {mode === 'create' && <Field label="Initial password *" error={errors.password?.message} hint="Share it with the engineer privately. They can change it from the app profile."><Input type="text" autoComplete="new-password" {...register('password')} /></Field>}
    {error && <Notice>{error}</Notice>}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={busy}>{mode === 'create' ? 'Create login' : 'Save'}</Button></div>
  </form>
}

type Choice = 'role' | 'allow' | 'deny'
const CHOICES: { v: Choice; label: string }[] = [{ v: 'role', label: 'Follow role' }, { v: 'allow', label: 'Allow' }, { v: 'deny', label: 'Deny' }]

/** Per-person exceptions: for each action follow the role, or always allow / deny it for this person. */
function PersonPermissions({ engineer, onDone }: { engineer: Engineer; onDone: () => void }) {
  const qc = useQueryClient()
  const matrix = useQuery({ queryKey: ['permissions'], queryFn: api.permissions.get, staleTime: 60_000 })
  const perms = useQuery({ queryKey: ['engineer-permissions', engineer.id], queryFn: () => api.engineers.permissions(engineer.id) })
  if (matrix.isLoading || perms.isLoading) return <Skeleton rows={5} />
  if (matrix.isError || perms.isError) return <ErrorState message={errorMessage(matrix.error ?? perms.error)} onRetry={() => { void matrix.refetch(); void perms.refetch() }} />
  return <PersonPermissionsForm key={JSON.stringify(perms.data!.overrides)} catalogue={matrix.data!.catalogue} data={perms.data!}
    onSaved={() => { void qc.invalidateQueries({ queryKey: ['engineers'] }); void qc.invalidateQueries({ queryKey: ['engineer-permissions', engineer.id] }); onDone() }} onCancel={onDone} />
}

function PersonPermissionsForm({ catalogue, data, onSaved, onCancel }: { catalogue: PermissionInfo[]; data: UserPermissions; onSaved: () => void; onCancel: () => void }) {
  const [choice, setChoice] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(catalogue.map(p => [p.key, p.key in data.overrides ? (data.overrides[p.key] ? 'allow' : 'deny') : 'role'])))
  const save = useMutation({
    mutationFn: () => api.engineers.setPermissions(data.engineerId,
      Object.fromEntries(Object.entries(choice).filter(([, c]) => c !== 'role').map(([k, c]) => [k, c === 'allow']))),
    onSuccess: onSaved,
  })
  const byRole = (k: string) => data.rolePermissions.includes(k)
  const result = (k: string) => choice[k] === 'role' ? byRole(k) : choice[k] === 'allow'

  return <form onSubmit={e => { e.preventDefault(); save.mutate() }} className="space-y-4">
    <p className="text-sm text-slate-600">
      Role: <b className="font-semibold text-slate-900">{data.roleLabel}</b>. Leave an action on <i>Follow role</i> to use the role's setting
      from <Link to="/settings/roles" className="font-medium text-sky-700 underline-offset-4 hover:underline">Settings › Roles &amp; permissions</Link>, or allow or deny it for this person only.
    </p>
    <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-900/6">
      {catalogue.map(p => <li key={p.key} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-slate-900">{p.label}</span>
            <Badge tone={result(p.key) ? 'green' : 'slate'}>{result(p.key) ? 'Allowed' : 'Not allowed'}</Badge></div>
          <p className="mt-0.5 text-xs text-slate-500">{p.description} Role: {byRole(p.key) ? 'allowed' : 'not allowed'}.</p>
        </div>
        <fieldset className="flex rounded-lg bg-slate-100 p-1">
          <legend className="sr-only">{p.label}</legend>
          {CHOICES.map(c => <label key={c.v} className={cx('relative flex min-h-9 cursor-pointer items-center rounded-md px-3 text-xs font-semibold transition-colors focus-within:ring-4 focus-within:ring-sky-500/25',
            choice[p.key] === c.v ? (c.v === 'deny' ? 'bg-white text-red-700 shadow-card' : c.v === 'allow' ? 'bg-white text-emerald-700 shadow-card' : 'bg-white text-slate-900 shadow-card') : 'text-slate-500 hover:text-slate-800')}>
            <input type="radio" name={`perm-${p.key}`} value={c.v} checked={choice[p.key] === c.v} onChange={() => { save.reset(); setChoice(s => ({ ...s, [p.key]: c.v })) }} className="sr-only" />
            {c.label}</label>)}
        </fieldset>
      </li>)}
    </ul>
    {save.error && <Notice>{errorMessage(save.error)}</Notice>}
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">Applies to this person's next action in the app.</span>
      <div className="flex gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={save.isPending}>Save permissions</Button></div>
    </div>
  </form>
}
