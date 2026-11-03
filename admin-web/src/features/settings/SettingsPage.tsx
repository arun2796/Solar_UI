import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { api, API_URL, errorMessage, problemOf } from '../../lib/api'
import { isDevSession } from '../../lib/devAuth'
import { useMe } from '../../lib/useMe'
import type { Company } from '../../lib/types'
import { fmtDateTime } from '../../lib/format'
import { isValidPhone, PHONE_MESSAGE } from '../../lib/phone'
import { Button, Card, ErrorState, Field, Input, Notice, PageHeader, Skeleton, Textarea } from '../../components/ui'

type CompanyForm = Omit<Company, 'logoUrl' | 'updatedAt'>
const MAX_LOGO = 1024 * 1024
const emailRule = { validate: (v?: string | null) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email' }
const phoneRule = { validate: (v?: string | null) => !v?.trim() || isValidPhone(v) || PHONE_MESSAGE }

/** Cleared inputs become null (not '') so the API stores "not set". */
const toPayload = (d: CompanyForm): CompanyForm => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v])) as CompanyForm
const toForm = (c: Company): CompanyForm => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'logoUrl' && k !== 'updatedAt').map(([k, v]) => [k, v ?? ''])) as CompanyForm

export default function SettingsPage() {
  const qc = useQueryClient(); const me = useMe()
  const isDev = isDevSession()
  const q = useQuery({ queryKey: ['company'], queryFn: api.company.get })
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<CompanyForm>()
  useEffect(() => { if (q.data) reset(toForm(q.data)) }, [q.data, reset])
  const save = useMutation({ mutationFn: (d: CompanyForm) => api.company.update(toPayload(d)), onSuccess: () => qc.invalidateQueries({ queryKey: ['company'] }) })
  const logo = useMutation({ mutationFn: (f: File) => api.company.logo(f), onSuccess: () => qc.invalidateQueries({ queryKey: ['company'] }) })
  const [logoErr, setLogoErr] = useState<string | null>(null)
  const [curPw, setCurPw] = useState(''); const [pw, setPw] = useState(''); const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null); const [pwBusy, setPwBusy] = useState(false)
  const changePw = async () => {
    setPwMsg(null)                                   // never leave an old result on screen while a new attempt runs
    if (!curPw) return setPwMsg({ ok: false, text: 'Enter your current password' })
    if (pw.length < 8) return setPwMsg({ ok: false, text: 'The new password needs at least 8 characters' })
    setPwBusy(true)
    try { await api.auth.changePassword(curPw, pw); setPwMsg({ ok: true, text: 'Password changed.' }); setCurPw(''); setPw('') }
    catch (e) { const errs = problemOf(e).errors; setPwMsg({ ok: false, text: errs ? Object.values(errs).flat().join(' ') : errorMessage(e) }) }   // the server's sentence, without field keys
    finally { setPwBusy(false) }
  }
  const pickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''          // reset so picking the same file again still fires
    if (!file) return
    setLogoErr(null); logo.reset()
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setLogoErr('Choose a PNG or JPEG image.')
    if (file.size > MAX_LOGO) return setLogoErr(`The file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 1 MB.`)
    logo.mutate(file)
  }

  return <>
    <PageHeader title="Settings" />
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><h2 className="mb-1 font-semibold">Company settings</h2><p className="mb-3 text-sm text-slate-500">Used in the PDF header and footer and for alert emails.</p>
        {q.isLoading ? <Skeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> :
          <form onSubmit={handleSubmit(d => { save.reset(); save.mutate(d) })} className="grid gap-3 md:grid-cols-2" noValidate>
            <Field label="Company name *" error={errors.companyName?.message} className="md:col-span-2"><Input {...register('companyName', { validate: v => !!v?.trim() || 'Company name is required' })} /></Field>
            <Field label="Address line 1"><Input {...register('addressLine1')} /></Field><Field label="Address line 2"><Input {...register('addressLine2')} /></Field>
            <Field label="City"><Input {...register('city')} /></Field><Field label="State"><Input {...register('state')} /></Field><Field label="Pincode"><Input inputMode="numeric" {...register('pincode')} /></Field>
            <Field label="Phone" error={errors.phone?.message}><Input type="tel" placeholder="e.g. 9876543210 or 04412345678" {...register('phone', phoneRule)} /></Field>
            <Field label="Email" error={errors.email?.message}><Input type="email" {...register('email', emailRule)} /></Field>
            <Field label="Website"><Input {...register('website')} /></Field>
            <Field label="GST number"><Input {...register('gstNumber')} /></Field>
            <Field label="Admin alert email (reminders go here)" error={errors.adminAlertEmail?.message}><Input type="email" {...register('adminAlertEmail', emailRule)} /></Field>
            <Field label="PDF footer text" className="md:col-span-2"><Textarea {...register('pdfFooterText')} /></Field>
            {save.isSuccess && !isDirty && <Notice tone="success" className="md:col-span-2">Company settings saved. New PDFs use these details.</Notice>}
            {save.error && <Notice className="md:col-span-2">{errorMessage(save.error)}</Notice>}
            <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-2"><span className="text-xs text-slate-500">Last updated {fmtDateTime(q.data!.updatedAt)}</span><Button type="submit" loading={save.isPending}>Save</Button></div>
          </form>}
      </Card>
      <div className="space-y-4">
        <Card><h2 className="mb-2 font-semibold">Company logo</h2>
          {q.data?.logoUrl ? <img src={new URL(q.data.logoUrl, API_URL).toString()} alt="Company logo" className="mb-2 max-h-24 rounded border border-slate-200 bg-white p-1" /> : <p className="mb-2 text-sm text-slate-500">No logo uploaded.</p>}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            {logo.isPending ? 'Uploading…' : 'Choose image'}<input type="file" accept="image/png,image/jpeg" onChange={pickLogo} disabled={logo.isPending} className="sr-only" /></label>
          <p className="mt-1 text-xs text-slate-500">PNG or JPEG, up to 1 MB. Appears on every PDF.</p>
          {logo.isSuccess && <Notice tone="success" className="mt-2">Logo updated.</Notice>}
          {(logoErr || logo.error) && <Notice className="mt-2">{logoErr ?? errorMessage(logo.error)}</Notice>}</Card>
        <Card><h2 className="mb-2 font-semibold">Your account</h2><p className="text-sm text-slate-600">{me.data?.email}</p><p className="mb-3 text-xs text-slate-500">Role: {me.data?.role}</p>
          {isDev ? <Notice tone="info">Signed in with the developer login, which has no password. Sign in with email and password to change one.</Notice> : <>
            <Field label="Current password"><Input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} autoComplete="current-password" /></Field>
            <Field label="New password" className="mt-2"><Input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" /></Field>
            <Button variant="secondary" className="mt-2" loading={pwBusy} onClick={changePw}>Change password</Button>
            {pwMsg && <Notice tone={pwMsg.ok ? 'success' : 'error'} className="mt-2">{pwMsg.text}</Notice>}</>}</Card>
      </div>
    </div>

    {/* Site Survey Calculation Constants */}
    <div className="mt-6">
      <SurveySettingsCard />
    </div>
  </>
}

// Same keys as the API (SurveySettingsService.Defaults); the survey app reads them for its calculations.
const SURVEY_CONSTANTS = [
  { key: 'generation_per_kw_per_day', label: 'Generation per kW per day (units)', hint: 'Default 4' },
  { key: 'area_per_kw_sqft', label: 'Roof area per kW (sq.ft)', hint: 'Default 50' },
  { key: 'default_panel_wp', label: 'Panel rating (Wp)', hint: 'Default 550' },
  { key: 'cable_buffer_multiplier', label: 'Cable buffer multiplier', hint: '1.2 = 20% extra' },
  { key: 'days_in_24_months', label: 'Days in 24 months', hint: 'Default 730' },
  { key: 'days_in_month', label: 'Days per month', hint: 'Default 30' },
]
// Photos the engineer must attach before Submit, per site type (setting mandatory_photos_<siteType>, comma-separated).
const SITE_TYPES = [['gated_community', 'Gated community'], ['commercial', 'Commercial'], ['industrial', 'Industrial'], ['maintenance', 'Maintenance']] as const
const PHOTO_TAGS = [['eb_bill', 'EB bill'], ['roof', 'Roof'], ['shadow', 'Shadow areas'], ['panel_mdb', 'Main panel / MDB'], ['eb_meter', 'EB meter'], ['id_proof', 'ID proof']] as const
const SURVEY_TARIFFS = [
  { key: 'tariff_lt1', label: 'LT-1' }, { key: 'tariff_lt2', label: 'LT-2' }, { key: 'tariff_lt3', label: 'LT-3' }, { key: 'tariff_ht', label: 'HT' },
]

function SurveySettingsCard() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['survey-settings'],
    queryFn: api.surveys.settings.get,
  })

  const [form, setForm] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (q.data) {
      setForm(q.data)
    }
  }, [q.data])

  const saveMutation = useMutation({
    mutationFn: (d: Record<string, string>) => api.surveys.settings.update(d),
    onSuccess: () => {
      setMsg({ ok: true, text: 'Site survey calculation settings updated successfully.' })
      void qc.invalidateQueries({ queryKey: ['survey-settings'] })
    },
    onError: (err) => {
      setMsg({ ok: false, text: errorMessage(err) })
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    saveMutation.mutate(form)
  }

  const setVal = (k: string, v: string) => {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Site survey calculation constants</h2>
        <p className="text-sm text-slate-500">
          Formulas used by the mobile app and server to calculate recommended system size, panel count, generation, and savings.
        </p>
      </div>

      {q.isLoading ? (
        <Skeleton rows={4} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {SURVEY_CONSTANTS.map(c => <Field key={c.key} label={c.label} hint={c.hint}>
              <Input type="number" step="any" min="0" value={form[c.key] ?? ''} onChange={e => setVal(c.key, e.target.value)} required />
            </Field>)}
          </div>
          <div className="border-t border-slate-200 pt-2">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Tariff by category (₹ per unit)</h3>
            <div className="grid gap-4 sm:grid-cols-4">
              {SURVEY_TARIFFS.map(c => <Field key={c.key} label={c.label}>
                <Input type="number" step="any" min="0" value={form[c.key] ?? ''} onChange={e => setVal(c.key, e.target.value)} required />
              </Field>)}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-2">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Mandatory photos before Submit</h3>
            <p className="mb-2 text-xs text-slate-500">The app and the server refuse Submit until these photos are attached.</p>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead><tr><th className="pr-4 text-left font-medium text-slate-600">Site type</th>{PHOTO_TAGS.map(([, l]) => <th key={l} className="px-2 text-xs font-medium text-slate-600">{l}</th>)}</tr></thead>
                <tbody>{SITE_TYPES.map(([type, label]) => {
                  const key = `mandatory_photos_${type}`
                  const tags = (form[key] ?? '').split(',').map(t => t.trim()).filter(Boolean)
                  const toggle = (tag: string) => setVal(key, (tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]).join(','))
                  return <tr key={type} className="border-t border-slate-100">
                    <td className="py-1.5 pr-4 font-medium text-slate-700">{label}</td>
                    {PHOTO_TAGS.map(([tag, l]) => <td key={tag} className="px-2 text-center">
                      <input type="checkbox" aria-label={`${label}: ${l}`} checked={tags.includes(tag)} onChange={() => toggle(tag)} className="h-4 w-4 accent-sky-700" />
                    </td>)}
                  </tr>
                })}</tbody>
              </table>
            </div>
          </div>

          {msg && <Notice tone={msg.ok ? 'success' : 'error'}>{msg.text}</Notice>}

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={saveMutation.isPending}>
              Save Calculation Settings
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

