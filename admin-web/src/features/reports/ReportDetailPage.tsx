import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Check, Copy, Download, Mail, MessageCircle, Pencil, Share2 } from 'lucide-react'
import { api, errorMessage, fieldLabel, problemOf, statusOf } from '../../lib/api'
import { SECTIONS, type Report, type ReportFields, type ShareLink } from '../../lib/types'
import { invalidateReportData } from '../../lib/invalidate'
import { fmtDate, fmtDateTime, saveBlob, statusTone } from '../../lib/format'
import { Badge, Button, Card, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Skeleton, Textarea } from '../../components/ui'

export default function ReportDetailPage() {
  const { id = '' } = useParams(); const qc = useQueryClient()
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api.reports.get(id) })
  const [correcting, setCorrecting] = useState(false); const [pdfKey, setPdfKey] = useState(0)
  const [link, setLink] = useState<ShareLink | null>(null); const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const share = useMutation({ mutationFn: () => api.reports.shareLink(id), onSuccess: l => { setLink(l); setShareOpen(true) } })
  const download = useMutation({ mutationFn: async () => saveBlob(await api.reports.pdfBlob(id), `${q.data?.reportRef ?? 'draft-' + id}.pdf`) })
  if (q.isLoading) return <Skeleton rows={10} />
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
  const r = q.data!; const f = r.fields; const locked = r.status !== 'draft'

  // One signed link per page visit (each request creates an audit entry); reuse it until it is about to expire.
  const openShare = () => {
    setCopied(null)
    if (link && new Date(link.expiresAt).getTime() > Date.now() + 60_000) setShareOpen(true)
    else share.mutate()
  }
  const copy = async () => {
    if (!link) return
    try { await navigator.clipboard.writeText(link.url); setCopied('ok') } catch { setCopied('fail') }
  }
  const text = (url: string) => encodeURIComponent(`Solar maintenance report ${r.reportRef} for ${r.clientName} (visit ${fmtDate(f.visitDate)}). PDF: ${url}`)

  return <>
    <PageHeader title={r.reportRef ?? 'Draft report'} subtitle={`${r.clientName} · ${r.engineerName}`} actions={<>
      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
      <Button variant="secondary" loading={download.isPending} onClick={() => download.mutate()}><Download className="h-4 w-4" aria-hidden />PDF</Button>
      {locked && <><Button variant="secondary" loading={share.isPending} onClick={openShare}><Share2 className="h-4 w-4" aria-hidden />Share</Button>
        <Button onClick={() => setCorrecting(true)}><Pencil className="h-4 w-4" aria-hidden />Correct</Button></>}</>} />
    {download.error && <Notice className="mb-3">PDF download failed: {errorMessage(download.error)}</Notice>}
    {share.error && <Notice className="mb-3">Could not create a share link: {errorMessage(share.error)}</Notice>}
    {shareOpen && link && <Card className="mb-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Share report</h2><span className="text-xs text-slate-500">Link valid until {fmtDateTime(link.expiresAt)}</span></div>
      <div className="flex flex-wrap gap-2">
        <Input readOnly value={link.url} aria-label="Share link" onFocus={e => e.currentTarget.select()} className="min-w-0 flex-1" />
        <Button variant="secondary" onClick={copy}>{copied === 'ok' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}{copied === 'ok' ? 'Copied' : 'Copy'}</Button>
        {/* Real links (not window.open after an await) so browsers never block them as pop-ups. */}
        <a className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200 shadow-[0_1px_2px_rgb(20_33_58/0.06)] transition-[background-color,transform] duration-200 ease-soft hover:bg-slate-50 hover:ring-slate-300 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500/25" href={`https://wa.me/?text=${text(link.url)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a>
        <a className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200 shadow-[0_1px_2px_rgb(20_33_58/0.06)] transition-[background-color,transform] duration-200 ease-soft hover:bg-slate-50 hover:ring-slate-300 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500/25" href={`mailto:?subject=${encodeURIComponent(`Maintenance report ${r.reportRef}`)}&body=${text(link.url)}`}><Mail className="h-4 w-4" aria-hidden />Email</a>
      </div>
      {copied === 'fail' && <Notice className="mt-2">The browser blocked clipboard access. Select the link above and copy it manually.</Notice>}
      <p className="mt-2 text-xs text-slate-500">WhatsApp and email open with the link prefilled. Attach the downloaded PDF if the recipient needs the file itself.</p>
    </Card>}

    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card><dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
          {([['Client', <Link key="client-link" to={`/clients/${r.clientId}`} className="text-sky-700 hover:underline">{r.clientName}</Link>], ['Engineer', r.engineerName], ['Visit date', fmtDate(f.visitDate)], ['Previous maintenance', fmtDate(f.previousMaintenanceDate)], ['Next visit date', fmtDate(f.nextVisitDate)], ['Technicians', f.technicianCount ?? '—'], ['Submitted', fmtDateTime(r.submittedAt)], ['Defects', r.defectCount], ['Signatures', `${r.hasEngineerSignature ? 'engineer ✓' : 'engineer ✗'}, ${r.hasClientSignature ? 'client ✓' : 'client ✗'}${f.clientRepName ? ` (${f.clientRepName})` : ''}`]] as [string, React.ReactNode][])
            .map(([k, v]) => <div key={k} className="border-b border-slate-100 py-1"><dt className="text-xs text-slate-500">{k}</dt><dd>{v}</dd></div>)}</dl></Card>
        {SECTIONS.map(s => <Card key={s.title}><h2 className="mb-2 font-semibold">{s.title}</h2>
          <table className="w-full text-sm"><tbody>{s.rows.map(row => { const v = f[row.key] as string | number | null | undefined; return <tr key={row.key} className="border-b border-slate-100"><td className="py-1.5 text-slate-700">{row.label}</td><td className="py-1.5 text-right">
            {row.type === 'num' ? (v ?? '—') : v ? <Badge tone={v === 'DEFECT' ? 'red' : v === 'GOOD' ? 'green' : 'slate'}>{v}</Badge> : <span className="text-slate-400">—</span>}</td></tr> })}</tbody></table>
          <p className="mt-2 text-sm text-slate-600"><span className="text-slate-400">Remarks: </span>{(f[s.remarks] as string) || '—'}</p></Card>)}
        <Card><h2 className="mb-2 font-semibold">8. Observations and Issues</h2><div className="space-y-2 text-sm"><p><span className="text-slate-400">General observations: </span>{f.s8GeneralObservations || '—'}</p><p><span className="text-slate-400">Action required: </span>{f.s8ActionRequired || '—'}</p><p><span className="text-slate-400">Next visit date: </span>{fmtDate(f.nextVisitDate)}</p></div></Card>
      </div>
      <Card className="xl:sticky xl:top-4 xl:self-start"><h2 className="mb-2 font-semibold">PDF preview</h2><PdfFrame id={id} reloadKey={pdfKey} onReload={() => setPdfKey(k => k + 1)} /><Button variant="ghost" className="mt-2" onClick={() => setPdfKey(k => k + 1)}>Reload preview</Button></Card>
    </div>
    <Modal open={correcting} title="Admin correction" onClose={() => setCorrecting(false)} wide closeOnBackdrop={false}>
      <CorrectionForm key={r.version} report={r}
        onDone={() => { setCorrecting(false); invalidateReportData(qc, id, r.clientId); setLink(null); setShareOpen(false); setPdfKey(k => k + 1) }}
        onLatest={latest => { if (latest) qc.setQueryData(['report', id], latest); else void qc.invalidateQueries({ queryKey: ['report', id] }) }}
        onCancel={() => setCorrecting(false)} /></Modal>
  </>
}

function PdfFrame({ id, reloadKey, onReload }: { id: string; reloadKey: number; onReload: () => void }) {
  const [state, setState] = useState<{ url: string | null; error: string | null; loading: boolean }>({ url: null, error: null, loading: true })
  useEffect(() => {
    let active = true; let blobUrl: string | null = null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before a new fetch is the intended behaviour
    setState({ url: null, error: null, loading: true })
    api.reports.pdfBlob(id)
      .then(blob => { if (!active) return; blobUrl = URL.createObjectURL(blob); setState({ url: blobUrl, error: null, loading: false }) })
      .catch(e => { if (active) setState({ url: null, error: errorMessage(e), loading: false }) })
    return () => { active = false; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [id, reloadKey])

  if (state.loading) return <div className="h-[70vh] animate-pulse rounded bg-slate-100" aria-busy="true" aria-label="Loading PDF" />
  if (state.error || !state.url) return <ErrorState message={state.error ?? 'Failed to load PDF'} onRetry={onReload} />
  return <iframe title="Report PDF" src={state.url} className="h-[70vh] w-full rounded border border-slate-200" />
}

type CorrectionValues = ReportFields & { reason: string }
const num = (int = false) => ({ setValueAs: (v: unknown) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? (int ? Math.trunc(n) : n) : null } })
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

/** Fields whose value differs from the submitted report, for the confirmation step. */
function changes(before: ReportFields, after: ReportFields): string[] {
  return (Object.keys(after) as (keyof ReportFields)[]).filter(k => (blank(before[k]) ?? null) !== (blank(after[k]) ?? null))
    .map(k => `${fieldLabel(k)}: ${String(before[k] ?? '—')} → ${String(after[k] ?? '—')}`)
}

function CorrectionForm({ report, onDone, onLatest, onCancel }: { report: Report; onDone: () => void; onLatest: (latest: Report | null) => void; onCancel: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<CorrectionValues>({ defaultValues: { ...report.fields, reason: '' } })
  const [pending, setPending] = useState<{ reason: string; fields: ReportFields; diff: string[] } | null>(null)
  const m = useMutation({ mutationFn: (p: { reason: string; fields: ReportFields }) => api.reports.correct(report.id, { version: report.version, reason: p.reason, fields: p.fields }), onSuccess: onDone })
  const conflict = statusOf(m.error) === 409

  const review = (d: CorrectionValues) => {
    const { reason, ...rest } = d
    const fields = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, blank(v)])) as ReportFields
    m.reset(); setPending({ reason: reason.trim(), fields, diff: changes(report.fields, fields) })
  }
  const err = (k: string) => (errors as Record<string, { message?: string }>)[k]?.message

  if (pending) return <div className="space-y-3">
    <h3 className="font-semibold">Confirm correction</h3>
    {pending.diff.length === 0 ? <Notice tone="info">No field values changed. The report will still be marked corrected with your reason.</Notice>
      : <ul className="max-h-[40vh] list-disc space-y-1 overflow-y-auto rounded border border-slate-200 p-3 pl-7 text-sm">{pending.diff.map(c => <li key={c}>{c}</li>)}</ul>}
    <p className="text-sm text-slate-600"><span className="text-slate-400">Reason: </span>{pending.reason}</p>
    {m.error && <Notice>{errorMessage(m.error)}</Notice>}
    <div className="flex flex-wrap justify-end gap-2">
      {conflict && <Button variant="secondary" onClick={() => onLatest((problemOf(m.error).current as Report | undefined) ?? null)}>Reload latest version</Button>}
      <Button variant="secondary" onClick={() => setPending(null)}>Back to edit</Button>
      <Button loading={m.isPending} disabled={conflict} onClick={() => m.mutate(pending)} data-autofocus>Confirm correction</Button>
    </div>
  </div>

  return <form onSubmit={handleSubmit(review)} className="space-y-3" noValidate>
    <p className="text-sm text-slate-600">Corrections are recorded in the audit log with your user id and reason. The report status becomes <b>corrected</b> and the PDF is regenerated.</p>
    <Field label="Reason for correction *" error={errors.reason?.message}>
      <Textarea {...register('reason', { validate: v => v.trim().length >= 5 || 'Reason must be at least 5 characters' })} placeholder="e.g. Fan status was recorded incorrectly" />
    </Field>
    <div className="grid gap-2 md:grid-cols-4">
      <Field label="Visit date *" error={err('visitDate')}><Input type="date" {...register('visitDate', { required: 'Visit date is required' })} /></Field>
      <Field label="Previous visit"><Input type="date" {...register('previousMaintenanceDate', { setValueAs: v => v || null })} /></Field>
      <Field label="Technicians *" error={err('technicianCount')}><Input type="number" min={0} max={50} step={1} {...register('technicianCount', { ...num(true), validate: v => (v != null && v >= 0 && v <= 50) || 'Enter 0–50' })} /></Field>
      <Field label="Next visit date" error={err('nextVisitDate')}><Input type="date" {...register('nextVisitDate', { setValueAs: v => v || null, validate: (v, all) => !v || !all.visitDate || v >= all.visitDate || 'Must be on or after the visit date' })} /></Field>
    </div>
    <Field label="Client representative name"><Input {...register('clientRepName')} placeholder="e.g. Mr. Sharma" /></Field>
    <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded border border-slate-200 p-3">
      {SECTIONS.map(s => <fieldset key={s.title}><legend className="mb-1 text-sm font-semibold">{s.title}</legend><div className="grid gap-2 md:grid-cols-2">
        {s.rows.map(row => <Field key={row.key} label={`${row.label} *`} error={err(row.key)}>{row.type === 'num'
          ? <Input type="number" min={0} step="0.01" inputMode="decimal" {...register(row.key, { ...num(), validate: v => (v != null && Number(v) >= 0) || 'Required (0 or more)' })} />
          : <Select {...register(row.key, { validate: v => !!v || 'Required' })}>{!report.fields[row.key] && <option value="" disabled>Select…</option>}{(row.type === 'yn' ? ['YES', 'NO'] : ['GOOD', 'DEFECT']).map(o => <option key={o} value={o}>{o}</option>)}</Select>}</Field>)}
        <Field label="Remarks" className="md:col-span-2"><Input {...register(s.remarks)} /></Field></div></fieldset>)}
      <fieldset><legend className="text-sm font-semibold">8. Observations and Issues</legend>
        <Field label="General observations"><Textarea {...register('s8GeneralObservations')} /></Field><Field label="Action required"><Textarea {...register('s8ActionRequired')} /></Field></fieldset>
    </div>
    {Object.keys(errors).length > 0 && <Notice>Fix the {Object.keys(errors).length} highlighted field(s) before continuing.</Notice>}
    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit">Review changes</Button></div>
  </form>
}
