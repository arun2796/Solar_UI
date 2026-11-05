import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Building2, Calculator, Camera, ImageIcon, IndianRupee, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react'
import { api, API_URL, errorMessage, problemOf } from '../../lib/api'
import { isDevSession } from '../../lib/devAuth'
import { useMe } from '../../lib/useMe'
import type { Company, FieldRole, PermissionMatrix } from '../../lib/types'
import { cx, fmtDateTime } from '../../lib/format'
import { isValidPhone, PHONE_MESSAGE } from '../../lib/phone'
import { Button, ErrorState, Field, Input, Notice, PageHeader, Skeleton, Textarea } from '../../components/ui'

// Settings is split into sections, one per job, each with its own address (/settings/<section>) so links and Back work.
type SectionId = 'company' | 'logo' | 'account' | 'roles' | 'calculations' | 'tariffs' | 'photos'
const SECTIONS: { id: SectionId; group: string; label: string; desc: string; icon: LucideIcon }[] = [
  { id: 'company', group: 'Company', label: 'Company details', desc: 'Name, address and contacts on every PDF', icon: Building2 },
  { id: 'logo', group: 'Company', label: 'Logo', desc: 'Shown on reports and survey PDFs', icon: ImageIcon },
  { id: 'account', group: 'Account', label: 'My account', desc: 'Your sign-in and password', icon: UserRound },
  { id: 'roles', group: 'Account', label: 'Roles & permissions', desc: 'What engineers and site engineers may do', icon: ShieldCheck },
  { id: 'calculations', group: 'Site survey', label: 'Calculations', desc: 'Constants for system sizing', icon: Calculator },
  { id: 'tariffs', group: 'Site survey', label: 'Tariffs', desc: '₹ per unit by tariff category', icon: IndianRupee },
  { id: 'photos', group: 'Site survey', label: 'Mandatory photos', desc: 'Required before Submit', icon: Camera },
]

export default function SettingsPage() {
  const { section } = useParams<{ section?: string }>()
  const current = SECTIONS.find(s => s.id === section)
  const tabs = useRef<HTMLUListElement>(null)
  // On phones the tab row scrolls sideways: keep the open section's tab in view (e.g. after a deep link).
  useEffect(() => { tabs.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [section])
  if (!current) return <Navigate to="/settings/company" replace />

  return <>
    <PageHeader title="Settings" subtitle="Company details, your account and the site survey rules" />
    {/* One row of tabs (scrolls sideways on phones), grouped by topic: no second sidebar next to the main menu */}
    <nav aria-label="Settings sections" className="-mx-4 mb-6 border-b border-slate-200 px-4 md:mx-0 md:px-0">
      <ul ref={tabs} className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {SECTIONS.map((s, i) => <li key={s.id} className="flex shrink-0 items-center">
          {i > 0 && SECTIONS[i - 1].group !== s.group && <span aria-hidden className="mx-2 h-5 w-px bg-slate-200" />}
          <NavLink to={`/settings/${s.id}`} title={s.desc} className={({ isActive }) => cx(
            'group flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors duration-200 ease-soft focus:outline-none focus-visible:rounded-t-lg focus-visible:bg-sky-50',
            isActive ? 'border-sky-700 font-semibold text-sky-900' : 'border-transparent font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800')}>
            {({ isActive }) => <><s.icon className={cx('h-4 w-4 shrink-0', isActive ? 'text-sky-700' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />{s.label}</>}
          </NavLink></li>)}
      </ul>
    </nav>

    <div className="min-w-0">
        {current.id === 'company' && <CompanySection />}
        {current.id === 'logo' && <LogoSection />}
        {current.id === 'account' && <AccountSection />}
        {current.id === 'roles' && <RolesSection />}
        {current.id === 'calculations' && <SurveyKeysSection keys={SURVEY_CONSTANTS.map(c => c.key)} title="Survey calculations"
          desc="The mobile app and the server size every system with these values. Changes apply to calculations made after saving.">
          {(form, set) => <div className="grid max-w-5xl gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
            {SURVEY_CONSTANTS.map(c => <Field key={c.key} label={c.label} hint={c.hint}>
              <Input type="number" inputMode="decimal" step="any" min="0" value={form[c.key] ?? ''} onChange={e => set(c.key, e.target.value)} required />
            </Field>)}
          </div>}
        </SurveyKeysSection>}
        {current.id === 'tariffs' && <SurveyKeysSection keys={SURVEY_TARIFFS.map(t => t.key)} title="Tariffs"
          desc="Used for the savings estimate when the engineer picks a tariff category and has no rate from the bill.">
          {(form, set) => <div className="grid max-w-4xl gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {SURVEY_TARIFFS.map(t => <Field key={t.key} label={t.label} hint="₹ per unit">
              <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500" aria-hidden>₹</span>
                <Input type="number" inputMode="decimal" step="any" min="0" className="pl-7" value={form[t.key] ?? ''} onChange={e => set(t.key, e.target.value)} required /></div>
            </Field>)}
          </div>}
        </SurveyKeysSection>}
        {current.id === 'photos' && <SurveyKeysSection keys={SITE_TYPES.map(([t]) => `mandatory_photos_${t}`)} title="Mandatory photos"
          desc="The app and the server refuse Submit until these photos are attached. Choose per site type.">
          {(form, set) => <MandatoryPhotosGrid form={form} set={set} />}
        </SurveyKeysSection>}
    </div>
  </>
}

/** One group inside a panel: on wide screens the label and help sit left of the fields, like a form sheet. */
function Group({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  const id = `grp-${title.toLowerCase().replace(/\W+/g, '-')}`
  return <div role="group" aria-labelledby={id} className="grid gap-x-10 gap-y-4 border-t border-slate-100 py-6 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
    <div><h3 id={id} className="text-sm font-semibold text-slate-900">{title}</h3>{help && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{help}</p>}</div>
    <div className="min-w-0">{children}</div>
  </div>
}

/** One settings panel: title, short explanation, then the content. */
function Panel({ title, desc, children, footer }: { title: string; desc: string; children: ReactNode; footer?: ReactNode }) {
  return <section className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-900/6">
    <div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-900">{title}</h2><p className="mt-1 max-w-[65ch] text-sm text-slate-500">{desc}</p></div>
    <div className="px-5 py-6 sm:px-7">{children}</div>
    {footer && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-7">{footer}</div>}
  </section>
}

// ---------------------------------------------------------------- company details
type CompanyForm = Omit<Company, 'logoUrl' | 'updatedAt'>
const emailRule = { validate: (v?: string | null) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email' }
const phoneRule = { validate: (v?: string | null) => !v?.trim() || isValidPhone(v) || PHONE_MESSAGE }
/** Cleared inputs become null (not '') so the API stores "not set". */
const toPayload = (d: CompanyForm): CompanyForm => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v])) as CompanyForm
const toForm = (c: Company): CompanyForm => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'logoUrl' && k !== 'updatedAt').map(([k, v]) => [k, v ?? ''])) as CompanyForm

function CompanySection() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['company'], queryFn: api.company.get })
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<CompanyForm>()
  useEffect(() => { if (q.data) reset(toForm(q.data)) }, [q.data, reset])
  const save = useMutation({ mutationFn: (d: CompanyForm) => api.company.update(toPayload(d)), onSuccess: () => qc.invalidateQueries({ queryKey: ['company'] }) })
  const desc = 'Printed in the header and footer of every PDF and used for reminder emails.'
  if (q.isLoading) return <Panel title="Company details" desc={desc}><Skeleton rows={6} /></Panel>
  if (q.isError) return <Panel title="Company details" desc={desc}><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></Panel>

  return <form onSubmit={handleSubmit(d => { save.reset(); save.mutate(d) })} noValidate>
    <Panel title="Company details" desc={desc} footer={<>
      <span className="text-xs text-slate-500">{isDirty ? 'You have unsaved changes' : `Last updated ${fmtDateTime(q.data!.updatedAt)}`}</span>
      <Button type="submit" loading={save.isPending} disabled={!isDirty}>Save changes</Button></>}>
      <div>
        <Group title="Identity" help="The legal name and registration printed on every report.">
          <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            <Field label="Company name *" error={errors.companyName?.message} className="md:col-span-2"><Input {...register('companyName', { validate: v => !!v?.trim() || 'Company name is required' })} /></Field>
            <Field label="GST number"><Input {...register('gstNumber')} /></Field>
            <Field label="Website"><Input {...register('website')} placeholder="https://" /></Field>
          </div>
        </Group>
        <Group title="Address" help="Shown in the PDF header under the company name.">
          <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            <Field label="Address line 1"><Input {...register('addressLine1')} /></Field><Field label="Address line 2"><Input {...register('addressLine2')} /></Field>
            <Field label="City"><Input {...register('city')} /></Field>
            <div className="grid grid-cols-2 gap-4"><Field label="State"><Input {...register('state')} /></Field><Field label="Pincode"><Input inputMode="numeric" {...register('pincode')} /></Field></div>
          </div>
        </Group>
        <Group title="Contacts" help="How clients reach you, and where reminder emails go.">
          <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            <Field label="Phone" error={errors.phone?.message}><Input type="tel" placeholder="e.g. 9876543210 or 04412345678" {...register('phone', phoneRule)} /></Field>
            <Field label="Email" error={errors.email?.message}><Input type="email" {...register('email', emailRule)} /></Field>
            <Field label="Reminder emails go to" hint="Next-visit and AMC reminders" error={errors.adminAlertEmail?.message} className="md:col-span-2"><Input type="email" {...register('adminAlertEmail', emailRule)} /></Field>
          </div>
        </Group>
        <Group title="PDF footer" help="A short line at the bottom of every page.">
          <div className="max-w-3xl"><Field label="Footer text" hint="Printed at the bottom of every page"><Textarea {...register('pdfFooterText')} /></Field></div>
        </Group>
        <div className="max-w-3xl space-y-3 lg:ml-70">
          {save.isSuccess && !isDirty && <Notice tone="success" className="mt-4">Saved. New PDFs use these details.</Notice>}
          {save.error && <Notice className="mt-4">{errorMessage(save.error)}</Notice>}
        </div>
      </div>
    </Panel>
  </form>
}

// ---------------------------------------------------------------- logo
const MAX_LOGO = 1024 * 1024

function LogoSection() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['company'], queryFn: api.company.get })
  const logo = useMutation({ mutationFn: (f: File) => api.company.logo(f), onSuccess: () => qc.invalidateQueries({ queryKey: ['company'] }) })
  const [logoErr, setLogoErr] = useState<string | null>(null)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''          // reset so picking the same file again still fires
    if (!file) return
    setLogoErr(null); logo.reset()
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setLogoErr('Choose a PNG or JPEG image.')
    if (file.size > MAX_LOGO) return setLogoErr(`The file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 1 MB.`)
    logo.mutate(file)
  }
  return <Panel title="Logo" desc="Shown at the top of every maintenance report and survey PDF.">
    {q.isLoading ? <Skeleton rows={3} /> : <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex h-36 w-full shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-[repeating-conic-gradient(var(--color-slate-50)_0%_25%,white_0%_50%)] bg-size-[16px_16px] p-4 sm:w-72">
        {q.data?.logoUrl ? <img src={new URL(q.data.logoUrl, API_URL).toString()} alt="Current company logo" className="max-h-full max-w-full object-contain" />
          : <span className="text-sm text-slate-500">No logo uploaded</span>}
      </div>
      <div className="space-y-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-button transition-[background-color,transform] duration-200 ease-soft hover:bg-sky-800 active:scale-[0.98] focus-within:ring-4 focus-within:ring-sky-500/25">
          <ImageIcon className="h-4 w-4" aria-hidden />{logo.isPending ? 'Uploading…' : q.data?.logoUrl ? 'Replace logo' : 'Upload logo'}
          <input type="file" accept="image/png,image/jpeg" onChange={pick} disabled={logo.isPending} className="sr-only" /></label>
        <p className="text-xs text-slate-500">PNG or JPEG, up to 1 MB. A wide logo on a white background works best.</p>
        {logo.isSuccess && <Notice tone="success">Logo updated. New PDFs show it.</Notice>}
        {(logoErr || logo.error) && <Notice>{logoErr ?? errorMessage(logo.error)}</Notice>}
      </div>
    </div>}
  </Panel>
}

// ---------------------------------------------------------------- my account
function AccountSection() {
  const me = useMe()
  const isDev = isDevSession()
  const [curPw, setCurPw] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false)
  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)                                   // never leave an old result on screen while a new attempt runs
    if (!curPw) return setMsg({ ok: false, text: 'Enter your current password.' })
    if (pw.length < 8) return setMsg({ ok: false, text: 'The new password needs at least 8 characters.' })
    if (pw !== pw2) return setMsg({ ok: false, text: 'The two new passwords are different.' })
    setBusy(true)
    try { await api.auth.changePassword(curPw, pw); setMsg({ ok: true, text: 'Password changed.' }); setCurPw(''); setPw(''); setPw2('') }
    catch (err) { const errs = problemOf(err).errors; setMsg({ ok: false, text: errs ? Object.values(errs).flat().join(' ') : errorMessage(err) }) }   // the server's sentence, without field keys
    finally { setBusy(false) }
  }
  return <div className="space-y-6">
    <Panel title="My account" desc="The account you are signed in with.">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs font-medium text-slate-500">Email</dt><dd className="mt-1 text-sm font-medium text-slate-900">{me.data?.email ?? '—'}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500">Role</dt><dd className="mt-1 text-sm font-medium capitalize text-slate-900">{me.data?.role ?? '—'}</dd></div>
      </dl>
    </Panel>
    {isDev ? <Notice tone="info">You are signed in with the developer login, which has no password. Sign in with email and password to change one.</Notice>
      : <form onSubmit={change} noValidate>
        <Panel title="Change password" desc="At least 8 characters. Other devices stay signed in until their session ends."
          footer={<><span className="text-xs text-slate-500">You will stay signed in on this browser.</span><Button type="submit" loading={busy}>Change password</Button></>}>
          <div className="grid max-w-md gap-4">
            <Field label="Current password"><Input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} autoComplete="current-password" /></Field>
            <Field label="New password"><Input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" /></Field>
            <Field label="Repeat the new password"><Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" /></Field>
            {msg && <Notice tone={msg.ok ? 'success' : 'error'}>{msg.text}</Notice>}
          </div>
        </Panel>
      </form>}
  </div>
}

// ---------------------------------------------------------------- roles & permissions
/** What each field role may do. Per-person exceptions are set on the Engineers page. */
function RolesSection() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['permissions'], queryFn: api.permissions.get })
  const desc = 'Tick what each role may do in the mobile apps. The API enforces it; the admin is not affected.'
  if (q.isLoading) return <Panel title="Roles & permissions" desc={desc}><Skeleton rows={5} /></Panel>
  if (q.isError) return <Panel title="Roles & permissions" desc={desc}><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></Panel>
  // no key from the data: re-mounting after Save would drop the "Saved" message (the form compares with the new data anyway)
  return <RolesForm data={q.data!} desc={desc} onSaved={d => { qc.setQueryData(['permissions'], d); void qc.invalidateQueries({ queryKey: ['engineers'] }) }} />
}

function RolesForm({ data, desc, onSaved }: { data: PermissionMatrix; desc: string; onSaved: (d: PermissionMatrix) => void }) {
  const saved = Object.fromEntries(data.roles.map(r => [r.role, r.permissions])) as Record<FieldRole, string[]>
  const [form, setForm] = useState(saved)
  const dirty = data.roles.some(r => [...form[r.role]].sort().join() !== [...saved[r.role]].sort().join())
  const save = useMutation({
    mutationFn: async () => {
      let last = data
      for (const r of data.roles) if ([...form[r.role]].sort().join() !== [...saved[r.role]].sort().join()) last = await api.permissions.setRole(r.role, form[r.role])
      return last
    },
    onSuccess: onSaved,
  })
  const toggle = (role: FieldRole, key: string) => { save.reset(); setForm(f => ({ ...f, [role]: f[role].includes(key) ? f[role].filter(k => k !== key) : [...f[role], key] })) }

  return <form onSubmit={e => { e.preventDefault(); save.mutate() }}>
    <Panel title="Roles & permissions" desc={desc} footer={<>
      <span className="text-xs text-slate-500">{dirty ? 'You have unsaved changes' : "Applies to each person's next action in the app"}</span>
      <div className="flex gap-2">{dirty && <Button variant="ghost" onClick={() => { setForm(saved); save.reset() }}>Discard</Button>}
        <Button type="submit" loading={save.isPending} disabled={!dirty}>Save changes</Button></div></>}>
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Permissions per role</caption>
            <thead><tr className="border-b border-slate-200">
              <th scope="col" className="py-3 pr-4 text-left text-xs font-semibold text-slate-500">Action</th>
              {data.roles.map(r => <th key={r.role} scope="col" className="w-36 px-3 py-3 text-center text-xs font-semibold text-slate-500">{r.label}</th>)}
            </tr></thead>
            <tbody>{data.catalogue.map(p => <tr key={p.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <th scope="row" className="py-2.5 pr-4 text-left font-medium text-slate-800">{p.label}<span className="block max-w-[60ch] text-xs font-normal text-slate-500">{p.description}</span></th>
              {data.roles.map(r => <td key={r.role} className="px-3 py-1 text-center">
                <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-sky-50">
                  <input type="checkbox" aria-label={`${r.label}: ${p.label}`} checked={form[r.role].includes(p.key)} onChange={() => toggle(r.role, p.key)} className="h-4 w-4 cursor-pointer accent-sky-700" />
                </label></td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">To allow or deny an action for one person only, open <Link to="/engineers" className="font-medium text-sky-700 underline-offset-4 hover:underline">Engineers</Link> and use Permissions on their row.</p>
        {save.isSuccess && !dirty && <Notice tone="success">Saved. The apps follow the new permissions from each person's next action.</Notice>}
        {save.error && <Notice>{errorMessage(save.error)}</Notice>}
      </div>
    </Panel>
  </form>
}

// ---------------------------------------------------------------- site survey settings
// Same keys as the API (SurveySettingsService); the mobile app reads them for its calculations and Submit checks.
const SURVEY_CONSTANTS = [
  { key: 'generation_per_kw_per_day', label: 'Generation per kW per day (units)', hint: 'Default 4' },
  { key: 'area_per_kw_sqft', label: 'Roof area per kW (sq.ft)', hint: 'Default 50' },
  { key: 'default_panel_wp', label: 'Panel rating (Wp)', hint: 'Default 550' },
  { key: 'cable_buffer_multiplier', label: 'Cable buffer multiplier', hint: '1.2 = 20% extra' },
  { key: 'days_in_24_months', label: 'Days in 24 months', hint: 'Default 730' },
  { key: 'days_in_month', label: 'Days per month', hint: 'Default 30' },
]
const SURVEY_TARIFFS = [{ key: 'tariff_lt1', label: 'LT-1' }, { key: 'tariff_lt2', label: 'LT-2' }, { key: 'tariff_lt3', label: 'LT-3' }, { key: 'tariff_ht', label: 'HT' }]
const SITE_TYPES = [['gated_community', 'Gated community'], ['commercial', 'Commercial'], ['industrial', 'Industrial'], ['maintenance', 'Maintenance']] as const
const PHOTO_TAGS = [['eb_bill', 'EB bill'], ['roof', 'Roof'], ['shadow', 'Shadow areas'], ['panel_mdb', 'Main panel / MDB'], ['eb_meter', 'EB meter'], ['id_proof', 'ID proof']] as const

/** Loads the survey settings and saves only this section's keys, so one section never overwrites another. */
function SurveyKeysSection({ keys, title, desc, children }: {
  keys: string[]; title: string; desc: string
  children: (form: Record<string, string>, set: (k: string, v: string) => void) => ReactNode
}) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['survey-settings'], queryFn: api.surveys.settings.get })
  const [form, setForm] = useState<Record<string, string>>({})
  const saved = Object.fromEntries(keys.map(k => [k, q.data?.[k] ?? '']))
  const values = { ...saved, ...form }
  const dirty = keys.some(k => (form[k] ?? saved[k]) !== saved[k])
  const save = useMutation({
    mutationFn: () => api.surveys.settings.update(Object.fromEntries(keys.map(k => [k, values[k]]))),
    onSuccess: () => { setForm({}); void qc.invalidateQueries({ queryKey: ['survey-settings'] }) },
  })
  const set = (k: string, v: string) => { save.reset(); setForm(f => ({ ...f, [k]: v })) }

  if (q.isLoading) return <Panel title={title} desc={desc}><Skeleton rows={4} /></Panel>
  if (q.isError) return <Panel title={title} desc={desc}><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></Panel>
  return <form onSubmit={e => { e.preventDefault(); save.mutate() }}>
    <Panel title={title} desc={desc} footer={<>
      <span className="text-xs text-slate-500">{dirty ? 'You have unsaved changes' : 'Saved values are in use'}</span>
      <div className="flex gap-2">{dirty && <Button variant="ghost" onClick={() => { setForm({}); save.reset() }}>Discard</Button>}
        <Button type="submit" loading={save.isPending} disabled={!dirty}>Save changes</Button></div></>}>
      <div className="space-y-4">
        {children(values, set)}
        {save.isSuccess && <Notice tone="success">Saved. The mobile app picks up the new values on its next sync.</Notice>}
        {save.error && <Notice>{Object.values(problemOf(save.error).errors ?? {}).flat().join(' ') || errorMessage(save.error)}</Notice>}
      </div>
    </Panel>
  </form>
}

function MandatoryPhotosGrid({ form, set }: { form: Record<string, string>; set: (k: string, v: string) => void }) {
  return <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <caption className="sr-only">Mandatory photos per site type</caption>
      <thead><tr className="border-b border-slate-200">
        <th scope="col" className="py-3 pr-4 text-left text-xs font-semibold text-slate-500">Site type</th>
        {PHOTO_TAGS.map(([, l]) => <th key={l} scope="col" className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{l}</th>)}
      </tr></thead>
      <tbody>{SITE_TYPES.map(([type, label]) => {
        const key = `mandatory_photos_${type}`
        const tags = (form[key] ?? '').split(',').map(t => t.trim()).filter(Boolean)
        const toggle = (tag: string) => set(key, (tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]).join(','))
        return <tr key={type} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <th scope="row" className="py-1 pr-4 text-left font-medium text-slate-800">{label}<span className="block text-xs font-normal text-slate-500">{tags.length} required</span></th>
          {PHOTO_TAGS.map(([tag, l]) => <td key={tag} className="px-3 py-1 text-center">
            {/* the whole cell is the touch target (44 px), not just the 16 px box */}
            <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-sky-50">
              <input type="checkbox" aria-label={`${label}: ${l}`} checked={tags.includes(tag)} onChange={() => toggle(tag)} className="h-4 w-4 cursor-pointer accent-sky-700" />
            </label>
          </td>)}
        </tr>
      })}</tbody>
    </table>
  </div>
}
