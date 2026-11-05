import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { AppUser } from '../../lib/types'
import { fmtDate, fmtDateTime } from '../../lib/format'
import { useMe } from '../../lib/useMe'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Skeleton, Table } from '../../components/ui'
import { isFieldRole, ROLE_LABEL, ROLE_TONE } from '../../lib/roles'


const createSchema = z.object({
  name: z.string().trim().max(200, 'At most 200 characters').optional().or(z.literal('')).transform(v => (v ? v : null)),
  email: z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email').max(200, 'At most 200 characters'),
  role: z.literal('admin'),
  password: z.string().min(8, 'At least 8 characters').max(128, 'At most 128 characters'),
})
type CreateIn = z.input<typeof createSchema>
type CreateData = z.output<typeof createSchema>

const label = (u: AppUser) => u.name || u.email || 'user'

/** Office (admin) sign-ins. Engineers are listed with their role but managed on the Engineers page. */
export default function UsersPage() {
  const qc = useQueryClient()
  const me = useMe()
  const [roleFilter, setRoleFilter] = useState('')
  const list = useQuery({ queryKey: ['users'], queryFn: api.users.list })
  const [creating, setCreating] = useState(false)
  const [toggle, setToggle] = useState<AppUser | null>(null)
  const [pwFor, setPwFor] = useState<AppUser | null>(null); const [newPw, setNewPw] = useState('')
  const refresh = () => void qc.invalidateQueries({ queryKey: ['users'] })
  const create = useMutation({ mutationFn: (d: CreateData) => api.users.create(d), onSuccess: () => { refresh(); setCreating(false) } })
  const setActive = useMutation({ mutationFn: (u: AppUser) => api.users.setActive(u.id, !u.isActive), onSuccess: () => { refresh(); setToggle(null) } })
  const setPw = useMutation({ mutationFn: () => api.users.setPassword(pwFor!.id, newPw), onSuccess: () => { refresh(); setPwFor(null); setNewPw('') } })

  const rows = (list.data ?? []).filter(u => !roleFilter || u.role === roleFilter)

  return <>
    <PageHeader title="Users" subtitle="Sign-in accounts and their role. Engineers are added on the Engineers page."
      actions={<Button onClick={() => { create.reset(); setCreating(true) }}><Plus className="h-4 w-4" aria-hidden />New user</Button>} />
    <Select aria-label="Role filter" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="mb-3 w-56">
      <option value="">All roles</option><option value="admin">Operations / admin</option><option value="engineer">Engineers</option><option value="site_engineer">Site engineers</option>
    </Select>
    {list.isLoading ? <Skeleton /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState text="No users." /> :
      <Table rows={rows} keyOf={u => u.id} cols={[
        { h: 'Name', cell: u => <span className="font-medium">{u.name || '—'}{u.id === me.data?.userId && <span className="ml-1.5 text-xs text-slate-500">(you)</span>}</span> },
        { h: 'Email (login)', cell: u => u.email ?? '—' },
        { h: 'Role', cell: u => <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge> },
        { h: 'Login', cell: u => u.hasPassword ? <Badge tone="green">password set</Badge> : <Badge tone="red">no password</Badge> },
        { h: 'Status', cell: u => <Badge tone={u.isActive ? 'green' : 'slate'}>{u.isActive ? 'Active' : 'Inactive'}</Badge> },
        { h: 'Last sign-in', cell: u => fmtDateTime(u.lastLoginAt) },
        { h: 'Since', cell: u => fmtDate(u.createdAt) },
        { h: '', cell: u => isFieldRole(u.role)
          ? <Link to="/engineers" className="text-xs font-medium text-sky-700 hover:underline">Manage on Engineers page</Link>
          : <div className="flex justify-end gap-0.5">
            <Button variant="ghost" className="px-2" onClick={() => { setPw.reset(); setNewPw(''); setPwFor(u) }} aria-label={`Set password for ${label(u)}`} title={u.hasPassword ? 'Reset password' : 'Set password'}><KeyRound className="h-4 w-4" aria-hidden /></Button>
            <Button variant="ghost" className={u.isActive ? 'px-2 text-red-700' : 'px-2 text-emerald-700'} disabled={u.isActive && u.id === me.data?.userId}
              onClick={() => { setActive.reset(); setToggle(u) }} aria-label={`${u.isActive ? 'Deactivate' : 'Activate'} ${label(u)}`}
              title={u.isActive && u.id === me.data?.userId ? 'You cannot deactivate your own account' : u.isActive ? 'Deactivate' : 'Activate'}>
              {u.isActive ? <UserX className="h-4 w-4" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}</Button>
          </div> },
      ]} />}

    <Modal open={creating} title="New user" onClose={() => setCreating(false)} closeOnBackdrop={false}>
      <UserForm onSubmit={d => create.mutate(d)} busy={create.isPending} error={create.error ? errorMessage(create.error) : null} onCancel={() => setCreating(false)} /></Modal>

    <Modal open={!!pwFor} title={`${pwFor?.hasPassword ? 'Reset' : 'Set'} password for ${pwFor ? label(pwFor) : ''}`} onClose={() => setPwFor(null)} closeOnBackdrop={false}>
      <form onSubmit={ev => { ev.preventDefault(); if (newPw.length >= 8) setPw.mutate() }} className="space-y-3" noValidate>
        <Field label="New password *" error={newPw && newPw.length < 8 ? 'At least 8 characters' : undefined} hint="Share it privately. The user is signed out on all devices and signs in again with this password.">
          <Input type="text" autoComplete="new-password" value={newPw} onChange={ev => setNewPw(ev.target.value)} /></Field>
        {setPw.error && <Notice>{errorMessage(setPw.error)}</Notice>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPwFor(null)}>Cancel</Button><Button type="submit" loading={setPw.isPending} disabled={newPw.length < 8}>Save password</Button></div>
      </form></Modal>

    <ConfirmDialog open={!!toggle} title={toggle?.isActive ? 'Deactivate user' : 'Activate user'} danger={!!toggle?.isActive} loading={setActive.isPending} error={setActive.error ? errorMessage(setActive.error) : null}
      body={toggle?.isActive ? <><b>{label(toggle)}</b> will be signed out and unable to sign in.</> : <><b>{toggle ? label(toggle) : ''}</b> will be able to sign in again.</>}
      onConfirm={() => setActive.mutate(toggle!)} onClose={() => setToggle(null)} />
  </>
}

function UserForm({ onSubmit, busy, error, onCancel }: { onSubmit: (d: CreateData) => void; busy: boolean; error: string | null; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateIn, unknown, CreateData>({ resolver: zodResolver(createSchema), defaultValues: { role: 'admin' } })
  return <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
    <Field label="Name" error={errors.name?.message}><Input {...register('name')} /></Field>
    <Field label="Email (login) *" error={errors.email?.message}><Input type="email" autoComplete="off" {...register('email')} /></Field>
    <input type="hidden" {...register('role')} />
    <p className="text-sm text-slate-600">Role: <span className="font-medium text-slate-900">Operations / admin</span>. Engineers and site engineers are added on the Engineers page.</p>
    <Field label="Initial password *" error={errors.password?.message} hint="Share it privately. They can change it after signing in."><Input type="text" autoComplete="new-password" {...register('password')} /></Field>
    {error && <Notice>{error}</Notice>}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={busy}>Create user</Button></div>
  </form>
}
