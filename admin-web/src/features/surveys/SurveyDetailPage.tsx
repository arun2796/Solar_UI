import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle,
  Copy,
  Download,
  Eye,
  Mail,
  MapPin,
  Pencil,
  Share2,
  ShieldAlert,
  UserCheck,
  Zap,
} from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { fmtDateTime, saveBlob } from '../../lib/format'
import type { SurveyStatus } from '../../lib/types'
import { Badge, Button, Card, ErrorState, Input, Modal, Notice, Select, Skeleton } from '../../components/ui'
import { useRole } from '../../lib/useMe'
import { SurveyComments } from './SurveyComments'
import { SurveyEditModal } from './SurveyEditModal'
import { SurveyReassignModal } from './SurveyReassignModal'

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const role = useRole()
  const isAdmin = role === 'admin'   // management (MD): read-only, plus approve for proposal and comments
  const canApprove = role === 'admin' || role === 'management'

  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<SurveyStatus>('reviewed')
  const [internalComments, setInternalComments] = useState('')

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const query = useQuery({
    queryKey: ['survey', id],
    queryFn: () => api.surveys.get(id!),
    enabled: !!id,
  })

  const statusMutation = useMutation({
    mutationFn: (d: { status: string; internalComments?: string | null }) =>
      api.surveys.updateStatus(id!, d),
    onSuccess: () => {
      setReviewModalOpen(false)
      void qc.invalidateQueries({ queryKey: ['survey', id] })
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })

  const approveMutation = useMutation({
    mutationFn: () => api.surveys.approve(id!),
    onSuccess: data => {
      qc.setQueryData(['survey', id], data)
      void qc.invalidateQueries({ queryKey: ['surveys'] })
    },
  })

  const shareMutation = useMutation({
    mutationFn: () => api.surveys.shareLink(id!),
    onSuccess: (data) => {
      setShareUrl(data.url)
      setCopied(false)
      setShareModalOpen(true)
    },
  })

  const emailMutation = useMutation({
    mutationFn: (to: string) => api.surveys.email(id!, to || undefined),
    onSuccess: (res) => {
      setEmailMsg({ ok: true, text: res.message || 'Email sent successfully!' })
    },
    onError: (err) => {
      setEmailMsg({ ok: false, text: errorMessage(err) })
    },
  })

  const downloadMutation = useMutation({
    mutationFn: async () => {
      if (!id) return
      setDownloadError(null)
      const blob = await api.surveys.pdfBlob(id)
      saveBlob(blob, `${query.data?.surveyRef || 'survey-' + id}.pdf`)
    },
    onError: err => {
      setDownloadError(errorMessage(err))
    },
  })

  const handlePreviewPdf = async () => {
    if (!id) return
    setPdfPreviewOpen(true)
    if (pdfBlobUrl) return
    setPdfLoading(true)
    setPdfError(null)
    try {
      const blob = await api.surveys.pdfBlob(id)
      const url = URL.createObjectURL(blob)
      setPdfBlobUrl(url)
    } catch (err) {
      setPdfError(errorMessage(err))
    } finally {
      setPdfLoading(false)
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton rows={2} />
        <Skeleton rows={8} />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
  }

  const s = query.data
  const d = s.data || {}
  const s1 = d.section1 || {}
  const s2 = d.section2 || {}
  const s3 = d.section3 || {}
  const s4 = d.section4 || {}
  const s5 = d.section5 || {}
  const s6 = d.section6 || {}
  const s9 = d.section9 || {}
  const calcs = s.calculations || {}
  const overrides = s.overrides

  const statusBadgeMap: Record<SurveyStatus, 'green' | 'amber' | 'blue' | 'red' | 'slate'> = {
    assigned: 'blue',
    draft: 'amber',
    submitted: 'blue',
    reviewed: 'green',
    proposal_sent: 'blue',
    won: 'green',
    lost: 'red',
  }

  const verdictTone: 'green' | 'amber' | 'red' =
    s.verdict === 'FEASIBLE'
      ? 'green'
      : s.verdict === 'CONDITIONAL'
      ? 'amber'
      : 'red'

  return (
    <div className="space-y-6 pb-12">
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={() => nav('/surveys')}
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to site surveys
        </button>
      </div>

      {downloadError && (
        <Notice className="mb-2">PDF download failed: {downloadError}</Notice>
      )}

      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xl font-bold text-sky-900">
              {s.surveyRef || 'DRAFT SURVEY'}
            </span>
            <Badge tone={statusBadgeMap[s.status] || 'slate'}>
              {s.status.replace('_', ' ').toUpperCase()}
            </Badge>
            {s.verdict && <Badge tone={verdictTone}>{s.verdict}</Badge>}
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">{s.customerName}</h1>
          <p className="flex items-center text-sm text-slate-500">
            <MapPin className="mr-1 h-4 w-4 text-slate-400" />
            {s.siteAddress}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canApprove && !s.approvedForProposalAt && (s.status === 'submitted' || s.status === 'reviewed') && (
            <Button loading={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
              <BadgeCheck className="mr-1.5 h-4 w-4" /> Approve for proposal
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="secondary"
              onClick={() => setReassignModalOpen(true)}
            >
              <UserCheck className="mr-1.5 h-4 w-4" /> Reassign
            </Button>
          )}
          <Button
            variant="secondary"
            loading={downloadMutation.isPending}
            disabled={s.status === 'assigned'}
            onClick={() => downloadMutation.mutate()}
            title={s.status === 'assigned' ? 'PDF report is not available for assigned tasks until the survey has been started' : undefined}
          >
            <Download className="mr-1.5 h-4 w-4" /> Download PDF
          </Button>
          <Button
            variant="secondary"
            disabled={s.status === 'assigned'}
            onClick={handlePreviewPdf}
            title={s.status === 'assigned' ? 'PDF preview is not available for assigned tasks until the survey has been started' : undefined}
          >
            <Eye className="mr-1.5 h-4 w-4" /> Preview PDF
          </Button>
          {isAdmin && <>
          <Button
            variant="secondary"
            onClick={() => setEditModalOpen(true)}
          >
            <Pencil className="mr-1.5 h-4 w-4" /> Edit Survey
          </Button>
          <Button
            variant="secondary"
            loading={shareMutation.isPending}
            disabled={s.status === 'assigned' || s.status === 'draft'}
            onClick={() => shareMutation.mutate()}
            title={s.status === 'assigned' || s.status === 'draft' ? 'Sharing is available after survey submission' : undefined}
          >
            <Share2 className="mr-1.5 h-4 w-4" /> Share Link
          </Button>
          <Button
            variant="secondary"
            disabled={s.status === 'assigned' || s.status === 'draft'}
            onClick={() => {
              setEmailTo(s1.email || '')
              setEmailMsg(null)
              setEmailModalOpen(true)
            }}
            title={s.status === 'assigned' || s.status === 'draft' ? 'Emailing is available after survey submission' : undefined}
          >
            <Mail className="mr-1.5 h-4 w-4" /> Email Customer
          </Button>
          <Button
            onClick={() => {
              setNewStatus(s.status)
              setInternalComments(s.internalComments || '')
              setReviewModalOpen(true)
            }}
          >
            <CheckCircle className="mr-1.5 h-4 w-4" /> Review / Change Status
          </Button>
          </>}
        </div>
      </div>

      {approveMutation.error && <Notice>Approval failed: {errorMessage(approveMutation.error)}</Notice>}
      {s.approvedForProposalAt && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 shadow-sm" role="status">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <div className="font-bold">Approved for proposal</div>
            <p className="text-sm">
              By <span className="font-semibold">{s.approvedForProposalByName || 'management'}</span> on {fmtDateTime(s.approvedForProposalAt)}
            </p>
          </div>
        </div>
      )}

      {/* Assigned Task Banner */}
      {s.status === 'assigned' && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sky-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="font-bold flex items-center gap-2 text-sky-950">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
              Assigned Survey Task
            </div>
            <p className="text-sm mt-0.5 text-sky-800">
              This survey task has been assigned to <span className="font-semibold text-slate-900">{s.assignedEngineerName || s.engineerName}</span> and is waiting for site inspection.
              {s.plannedVisitDate && <> Planned visit date: <span className="font-semibold text-slate-900">{s.plannedVisitDate}</span>.</>}
            </p>
          </div>
          {isAdmin && (
            <Button variant="secondary" onClick={() => setReassignModalOpen(true)} className="shrink-0 bg-white hover:bg-sky-100">
              <UserCheck className="mr-1.5 h-4 w-4" /> Reassign Engineer
            </Button>
          )}
        </div>
      )}

      {/* Top System Sizing & Financial Estimates Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recommended Capacity</div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">
            {calcs.recommendedSystemSizeKw ?? s9.systemSizeKw ?? '—'} <span className="text-lg font-normal">kW</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {calcs.numberOfPanels ?? s9.numberOfPanels ?? '—'} panels (550 Wp)
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Est. Monthly Generation</div>
          <div className="mt-2 text-3xl font-extrabold text-sky-700">
            {calcs.unitsGeneratedPerMonth?.toLocaleString('en-IN') ?? s9.monthlyGenerationUnits?.toLocaleString('en-IN') ?? '—'} <span className="text-lg font-normal">Units</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Based on 4 daily peak sun hours</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Est. Annual Savings</div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-700">
            ₹{calcs.annualSavingsRs?.toLocaleString('en-IN') ?? s9.annualSavingsRs?.toLocaleString('en-IN') ?? '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            ₹{calcs.monthlySavingsRs?.toLocaleString('en-IN') ?? s9.monthlySavingsRs?.toLocaleString('en-IN') ?? '—'} / month
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Free Roof Area</div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">
            {calcs.netFreeAreaSqft?.toLocaleString('en-IN') ?? '—'} <span className="text-lg font-normal">sq.ft</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Gross area: {s3.availableAreaSqft ?? (s3.lengthFt && s3.widthFt ? s3.lengthFt * s3.widthFt : '—')} sq.ft
          </div>
        </div>
      </div>

      {/* Warning Banners */}
      {calcs.isRoofShortfall && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <h4 className="font-bold flex items-center gap-1.5">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> Roof Shortfall Warning
          </h4>
          <p className="text-sm mt-1">
            Available shadow-free roof area supports {calcs.capacityByRoofKw} kW, which is less than the client's consumption requirement of {calcs.capacityByConsumptionKw} kW.
          </p>
        </div>
      )}

      {calcs.isShadowRisk && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <h4 className="font-bold flex items-center gap-1.5">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> Shadow Risk Warning
          </h4>
          <p className="text-sm mt-1">
            Shadow area exceeds 30% or daily sunlight exposure is under 6 hours. Elevated structure or power optimizers recommended.
          </p>
        </div>
      )}

      {/* Overrides Banner if applied */}
      {overrides?.overrideReason && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 p-4 text-sky-900">
          <h4 className="font-bold flex items-center gap-1.5">
            <Zap className="h-5 w-5 text-sky-600" /> Manual System Sizing Override Applied
          </h4>
          <p className="text-sm mt-1">
            <span className="font-semibold">Reason:</span> {overrides.overrideReason}
          </p>
          <p className="text-xs text-sky-700 mt-1">
            Capacity Override: {overrides.overrideSystemSizeKw ?? 'None'} kW | Panels Override: {overrides.overrideNumberOfPanels ?? 'None'}
          </p>
        </div>
      )}

      {/* Task Assignment & Site Contact Card */}
      {(s.assignedEngineerId || s.customerType || s.plannedVisitDate || s.status === 'assigned') && (
        <Card className="border-sky-200 bg-sky-50/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-sky-100 gap-2 mb-3">
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-sky-600" />
                Task Assignment & Contact Details
              </h2>
              <p className="text-xs text-slate-500">
                Created and assigned by {s.assignedByUserName || 'Operations'} {s.assignedAt ? `on ${fmtDateTime(s.assignedAt)}` : ''}
              </p>
            </div>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setReassignModalOpen(true)} className="text-xs py-1 px-2.5">
                <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Reassign
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Assigned Engineer</dt>
              <dd className="font-semibold text-slate-900">{s.assignedEngineerName || s.engineerName || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Customer Type</dt>
              <dd className="font-medium text-slate-900">
                {s.customerType ? (
                  <Badge tone={s.customerType === 'Commercial' ? 'blue' : 'slate'}>{s.customerType}</Badge>
                ) : '—'}
              </dd>
            </div>
            {s.companyName && (
              <div>
                <dt className="text-xs text-slate-500">Company Name</dt>
                <dd className="font-semibold text-slate-900">{s.companyName}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-500">Contact Person</dt>
              <dd className="font-medium text-slate-900">{s.contactPerson || s1.contactPerson || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Contact Mobile</dt>
              <dd className="font-medium text-slate-900">
                {s.contactPhone || s1.phone ? (
                  <a href={`tel:${s.contactPhone || s1.phone}`} className="text-sky-600 hover:underline">
                    {s.contactPhone || s1.phone}
                  </a>
                ) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Planned Visit Date</dt>
              <dd className="font-medium text-slate-900">{s.plannedVisitDate || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Site Type</dt>
              <dd className="font-medium text-slate-900 capitalize">{s.siteType || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">City / Area</dt>
              <dd className="font-medium text-slate-900">{s.cityArea || '—'}</dd>
            </div>
            <div className="col-span-1 sm:col-span-2">
              <dt className="text-xs text-slate-500">Site Address</dt>
              <dd className="font-medium text-slate-900 flex items-start gap-1.5 mt-0.5">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <span>{s.siteAddress || '—'}</span>
                {s.googleMapsUrl && (
                  <a
                    href={s.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-xs font-semibold text-sky-600 hover:underline inline-flex items-center"
                  >
                    Open Maps &rarr;
                  </a>
                )}
              </dd>
            </div>
            {s.assignmentNotes && (
              <div className="col-span-1 sm:col-span-2">
                <dt className="text-xs text-slate-500">Assignment Notes for Engineer</dt>
                <dd className="font-medium text-slate-800 bg-white p-2.5 rounded border border-slate-200 mt-1 text-xs whitespace-pre-wrap">
                  {s.assignmentNotes}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {/* Main Details Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Customer Information (Section 1) */}
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">1. Customer Information</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Contact Person</dt>
              <dd className="font-medium text-slate-900">{s1.contactPerson || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Designation</dt>
              <dd className="font-medium text-slate-900">{s1.designation || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium text-slate-900">{s1.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{s1.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Customer Type</dt>
              <dd className="font-medium text-slate-900">{s1.customerType || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Units / Towers</dt>
              <dd className="font-medium text-slate-900">
                {s1.numberOfUnitsOrFlats ? `${s1.numberOfUnitsOrFlats} units` : '—'}
                {s1.numberOfTowers ? ` / ${s1.numberOfTowers} towers` : ''}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Electricity Connection (Section 2) */}
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">2. Electricity Connection</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Sanctioned Load</dt>
              <dd className="font-medium text-slate-900">{s2.sanctionedLoadKw ? `${s2.sanctionedLoadKw} kW` : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Contract Demand</dt>
              <dd className="font-medium text-slate-900">{s2.contractDemandKva ? `${s2.contractDemandKva} kVA` : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phase Type</dt>
              <dd className="font-medium text-slate-900">{s2.phaseType || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Monthly Bill</dt>
              <dd className="font-medium text-slate-900">{s2.monthlyBillRs ? `₹${s2.monthlyBillRs.toLocaleString('en-IN')}` : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Tariff Category</dt>
              <dd className="font-medium text-slate-900">{s2.tariffCategory || '—'} (₹{s2.tariffRateRsPerUnit || 7}/unit)</dd>
            </div>
            <div>
              <dt className="text-slate-500">Net Metering</dt>
              <dd className="font-medium text-slate-900">{s2.netMeteringAvailable || '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">EB Service Numbers</dt>
              <dd className="font-medium text-slate-900">
                {s2.ebServiceNumbers?.length ? s2.ebServiceNumbers.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Roof & Installation Area (Section 3) */}
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">3. Roof & Installation Area</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Installation Type</dt>
              <dd className="font-medium text-slate-900">{s3.installationType || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Roof Condition</dt>
              <dd className="font-medium text-slate-900">{s3.roofCondition || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Orientation & Tilt</dt>
              <dd className="font-medium text-slate-900">{s3.orientation || '—'} ({s3.tilt || 'Flat'}, {s3.tiltAngleDeg ?? 10}°)</dd>
            </div>
            <div>
              <dt className="text-slate-500">Material Access</dt>
              <dd className="font-medium text-slate-900 uppercase">{s3.materialAccess || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Waterproofing</dt>
              <dd className="font-medium text-slate-900">{s3.waterproofingStatus || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Obstructions</dt>
              <dd className="font-medium text-slate-900">
                {s3.obstructionAreasSqft?.length
                  ? `${s3.obstructionAreasSqft.reduce((a: number, b: number) => a + b, 0)} sq.ft deducted`
                  : 'None'}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Shadow Analysis (Section 4) */}
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">4. Shadow Analysis</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Shadow Observed</dt>
              <dd className="font-medium text-slate-900">{s4.shadowObserved || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Time of Observation</dt>
              <dd className="font-medium text-slate-900">{s4.timeOfObservation || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Shadow Area</dt>
              <dd className="font-medium text-slate-900">{s4.shadowAreaPercent != null ? `${s4.shadowAreaPercent}%` : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Direct Sun Exposure</dt>
              <dd className="font-medium text-slate-900">{s4.totalShadowFreeSunHours ? `${s4.totalShadowFreeSunHours} hours/day` : '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Sources of Shadow</dt>
              <dd className="font-medium text-slate-900">{s4.shadowSources || 'None reported'}</dd>
            </div>
          </dl>
        </Card>

        {/* Electrical Infrastructure (Section 5) */}
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">5. Electrical Infrastructure</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">MDB Location</dt>
              <dd className="font-medium text-slate-900">{s5.mdbLocation || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Roof-to-Inverter Distance</dt>
              <dd className="font-medium text-slate-900">{s5.roofToInverterDistanceM ? `${s5.roofToInverterDistanceM} m` : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">EB Meter Location</dt>
              <dd className="font-medium text-slate-900">{s5.ebMeterLocation || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">ACDB Location</dt>
              <dd className="font-medium text-slate-900">{s5.acdbLocation || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Earthing Points / WiFi</dt>
              <dd className="font-medium text-slate-900">
                {s5.earthingPointsAvailable || '—'} / WiFi: {s5.wifiAvailable || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Total Cable Route Length</dt>
              <dd className="font-medium text-slate-900">{calcs.totalCableLengthM ? `${calcs.totalCableLengthM} m (with buffer)` : '—'}</dd>
            </div>
          </dl>
        </Card>

        {/* Feasibility & Recommendation (Sections 6 & 9) */}
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">6 & 9. Feasibility & Recommendation</h2>
          <dl className="grid grid-cols-1 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Mounting Structure</dt>
              <dd className="font-medium text-slate-900">{s6.mountingStructureType || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Cable Route & Structural Feasibility</dt>
              <dd className="font-medium text-slate-900">
                Cable Feasible: {s6.cableRouteFeasible || 'YES'} | Reinforcement Needed: {s6.structuralReinforcementNeeded || 'NO'}
              </dd>
            </div>
            {s6.safetyAndAccessConstraints && (
              <div>
                <dt className="text-slate-500">Safety & Access Constraints</dt>
                <dd className="font-medium text-slate-900">{s6.safetyAndAccessConstraints}</dd>
              </div>
            )}
            {s9.recommendationNote && (
              <div>
                <dt className="text-slate-500">Recommendation Note</dt>
                <dd className="font-medium text-slate-900">{s9.recommendationNote}</dd>
              </div>
            )}
            {s9.conditions && (
              <div>
                <dt className="text-slate-500">Prerequisites / Conditions</dt>
                <dd className="font-medium text-slate-900">{s9.conditions}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      {/* Photo Gallery (Section 7) */}
      <Card>
        <h2 className="mb-3 font-semibold text-slate-900">{`Documentation Photos (${s.photos?.length || 0})`}</h2>
        {s.photos?.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {s.photos.map(p => (
              <div key={p.id} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img
                  src={p.filePath.startsWith('http') ? p.filePath : `${api.surveys.pdfUrl(s.id).replace('/pdf', '')}/photos`}
                  alt={p.caption || 'Survey Photo'}
                  className="h-36 w-full object-cover transition-transform group-hover:scale-105"
                  onError={e => {
                    // Fallback to placeholder if backend photo URL format differs
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <div className="p-2">
                  <div className="text-xs font-semibold uppercase text-sky-800">{p.tag || `Section ${p.sectionNumber}`}</div>
                  {p.caption && <div className="truncate text-xs text-slate-500" title={p.caption}>{p.caption}</div>}
                  {p.gpsLatitude && p.gpsLongitude && (
                    <div className="mt-1 text-[10px] text-slate-400">
                      GPS: {p.gpsLatitude}, {p.gpsLongitude}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-slate-400">No photos uploaded for this survey.</div>
        )}
      </Card>

      {/* Dual Signatures & Audit Trail (Section 8) */}
      <Card>
        <h2 className="mb-3 font-semibold text-slate-900">8. Signatures & Audit Trail</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Signatures */}
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-700">Sales Engineer Signature</div>
              <div className="mt-1 text-xs text-slate-500">{s.engineerName}</div>
              <div className="mt-2 h-28 w-64 rounded-lg border border-slate-200 bg-slate-50 p-2 flex items-center justify-center">
                {s.engineerSignaturePath ? (
                  <span className="text-sm font-semibold text-emerald-700">✓ Signed on device</span>
                ) : (
                  <span className="text-xs text-slate-400">Not signed</span>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-700">Customer Signature</div>
              <div className="mt-1 text-xs text-slate-500">Representative: {s.customerRepName || s1.contactPerson || s.customerName}</div>
              <div className="mt-2 h-28 w-64 rounded-lg border border-slate-200 bg-slate-50 p-2 flex items-center justify-center">
                {s.customerSignaturePath ? (
                  <span className="text-sm font-semibold text-emerald-700">✓ Signed by customer</span>
                ) : (
                  <span className="text-xs text-slate-400">Not signed</span>
                )}
              </div>
            </div>
          </div>

          {/* Audit trail */}
          <div className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
            <h4 className="font-bold text-slate-800">Survey History & Audit</h4>
            <div className="flex justify-between border-b border-slate-200 py-1.5">
              <span className="text-slate-500">Survey ID / Version</span>
              <span className="font-mono text-slate-700">{s.id.slice(0, 8)} · v{s.version}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 py-1.5">
              <span className="text-slate-500">Created At</span>
              <span className="text-slate-700">{fmtDateTime(s.createdAt)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 py-1.5">
              <span className="text-slate-500">Submitted At</span>
              <span className="text-slate-700">{s.submittedAt ? fmtDateTime(s.submittedAt) : 'Draft'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 py-1.5">
              <span className="text-slate-500">Reviewed By</span>
              <span className="text-slate-700">{s.reviewedBy ? 'Operations / Admin' : 'Pending review'}</span>
            </div>
            {s.reviewedAt && (
              <div className="flex justify-between border-b border-slate-200 py-1.5">
                <span className="text-slate-500">Reviewed At</span>
                <span className="text-slate-700">{fmtDateTime(s.reviewedAt)}</span>
              </div>
            )}
            {s.approvedForProposalAt && (
              <div className="flex justify-between border-b border-slate-200 py-1.5">
                <span className="text-slate-500">Approved for proposal</span>
                <span className="text-slate-700">{s.approvedForProposalByName || '—'} · {fmtDateTime(s.approvedForProposalAt)}</span>
              </div>
            )}
            {s.internalComments && (
              <div className="pt-2">
                <span className="block text-xs font-semibold text-slate-500 uppercase">Internal Comments / Proposal Notes</span>
                <p className="mt-1 text-slate-800 bg-white p-2.5 rounded border border-slate-200">{s.internalComments}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {canApprove && <SurveyComments surveyId={s.id} />}

      {/* Review & Status Change Modal */}
      {isAdmin && reviewModalOpen && (
        <Modal open={reviewModalOpen} title="Review & Update Survey Status" onClose={() => setReviewModalOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
              <Select value={newStatus} onChange={e => setNewStatus(e.target.value as SurveyStatus)}>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="reviewed">Reviewed (Approved for Proposal)</option>
                <option value="proposal_sent">Proposal Sent</option>
                <option value="won">Won (Deal Closed)</option>
                <option value="lost">Lost</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Internal Review Comments / Approval Notes
              </label>
              <textarea
                value={internalComments}
                onChange={e => setInternalComments(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="e.g. Approved capacity 25kW; quote prepared with mono PERC modules"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    status: newStatus,
                    internalComments: internalComments.trim() || null,
                  })
                }
              >
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Public Share Link Modal */}
      {shareModalOpen && (
        <Modal open={shareModalOpen} title="Share Site Survey Report" onClose={() => setShareModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This signed, secure link allows the customer or management to view and download the official PDF report without needing to sign in. The link is active for 7 days.
            </p>

            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} className="flex-1 font-mono text-xs" />
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check className="mr-1 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1 h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Here is the Solar PV Site Feasibility Report for ${s.customerName} (${s.surveyRef || 'Survey'}):\n${shareUrl}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-sm font-medium text-emerald-700 hover:text-emerald-800"
              >
                Share via WhatsApp Web →
              </a>
              <Button variant="secondary" onClick={() => setShareModalOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Email Customer Modal */}
      {emailModalOpen && (
        <Modal open={emailModalOpen} title="Email Survey Report PDF" onClose={() => setEmailModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Send the branded PDF report directly to the customer's email address. An operations copy will also be dispatched if configured.
            </p>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Recipient Email</label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                required
              />
            </div>

            {emailMsg && (
              <div className={`p-3 rounded-md text-sm ${emailMsg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {emailMsg.text}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEmailModalOpen(false)}>
                Close
              </Button>
              <Button
                loading={emailMutation.isPending}
                disabled={!emailTo.trim()}
                onClick={() => emailMutation.mutate(emailTo.trim())}
              >
                <Mail className="mr-1.5 h-4 w-4" /> Send Email
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reassign Modal */}
      {isAdmin && reassignModalOpen && (
        <SurveyReassignModal
          open={reassignModalOpen}
          onClose={() => setReassignModalOpen(false)}
          survey={s}
          onReassigned={() => {
            void qc.invalidateQueries({ queryKey: ['survey', id] })
            void qc.invalidateQueries({ queryKey: ['surveys'] })
          }}
        />
      )}

      {/* Edit Survey Modal */}
      {isAdmin && editModalOpen && (
        <SurveyEditModal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          survey={s}
          onUpdated={() => {
            setPdfBlobUrl(null)
          }}
        />
      )}

      {/* PDF Preview Modal */}
      {pdfPreviewOpen && (
        <Modal
          open={pdfPreviewOpen}
          title={`PDF Preview · ${s.surveyRef || 'Survey Report'}`}
          onClose={() => setPdfPreviewOpen(false)}
          wide
        >
          <div className="space-y-3">
            {pdfLoading && (
              <div className="flex h-[70vh] items-center justify-center rounded border border-slate-200 bg-slate-50 text-sm text-slate-500">
                Generating PDF preview...
              </div>
            )}
            {pdfError && (
              <ErrorState
                message={pdfError}
                onRetry={() => {
                  setPdfBlobUrl(null)
                  void handlePreviewPdf()
                }}
              />
            )}
            {pdfBlobUrl && !pdfLoading && !pdfError && (
              <iframe
                title="Survey PDF Preview"
                src={pdfBlobUrl}
                className="h-[75vh] w-full rounded border border-slate-200"
              />
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                Generated from current survey data.
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPdfBlobUrl(null)
                    void handlePreviewPdf()
                  }}
                >
                  Refresh
                </Button>
                <Button
                  loading={downloadMutation.isPending}
                  onClick={() => downloadMutation.mutate()}
                >
                  <Download className="mr-1.5 h-4 w-4" /> Download PDF
                </Button>
                <Button variant="secondary" onClick={() => setPdfPreviewOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
