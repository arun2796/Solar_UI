import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { clampPage, fmtDateTime } from '../../lib/format'
import type { SurveyStatus } from '../../lib/types'
import { Badge, Button, EmptyState, ErrorState, PageHeader, Pagination, Select, Skeleton, Table } from '../../components/ui'
import { SearchBox } from '../../components/SearchBox'
import { useRole } from '../../lib/useMe'
import { NewAssignedSurveyModal } from './NewAssignedSurveyModal'

export default function SurveysPage() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const isAdmin = useRole() === 'admin'

  const g = (k: string) => sp.get(k) ?? ''
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v)
    else n.delete(k)
    if (k !== 'page') n.delete('page')
    setSp(n)
  }

  const page = clampPage(sp.get('page'))
  const params = {
    search: g('q'),
    engineerId: g('engineer'),
    status: g('status'),
    siteType: g('siteType'),
    verdict: g('verdict'),
    from: g('from'),
    to: g('to'),
    sort: g('sort') || 'visit_desc',
    page,
    pageSize: 25,
  }

  const list = useQuery({ queryKey: ['surveys', params], queryFn: () => api.surveys.list(params) })
  const engineers = useQuery({ queryKey: ['engineers', 'all'], queryFn: () => api.engineers.list(), enabled: isAdmin })

  const filtered = !!(g('q') || g('engineer') || g('status') || g('siteType') || g('verdict') || g('from') || g('to'))

  // Calculate quick summary metrics (exclude 'assigned' tasks without survey data)
  const items = list.data?.items ?? []
  const totalCount = list.data?.total ?? 0
  const submittedCount = items.filter(s => s.status !== 'draft' && s.status !== 'assigned').length
  const wonCount = items.filter(s => s.status === 'won').length
  const totalKw = items.filter(s => s.status !== 'assigned').reduce((acc, s) => acc + (s.recommendedSystemSizeKw ?? 0), 0)

  // Export to CSV function
  const handleExportCsv = () => {
    if (!items.length) return
    const headers = ['Ref', 'Customer Name', 'Customer Type', 'Site Type', 'Address', 'Assigned To', 'Visit Date', 'Verdict', 'Recommended Capacity (kW)', 'Status', 'Submitted At']
    const rows = items.map(s => [
      `"${s.surveyRef || 'DRAFT'}"`,
      `"${(s.customerName || '').replace(/"/g, '""')}"`,
      `"${s.customerType || 'Commercial'}"`,
      `"${s.siteType}"`,
      `"${(s.siteAddress || '').replace(/"/g, '""')}"`,
      `"${s.assignedEngineerName || s.engineerName || ''}"`,
      `"${s.plannedVisitDate || (s.createdAt ? s.createdAt.slice(0, 10) : '')}"`,
      `"${s.verdict || ''}"`,
      s.recommendedSystemSizeKw ?? 0,
      `"${s.status}"`,
      `"${s.submittedAt ? s.submittedAt.slice(0, 10) : ''}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `site_surveys_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        title="Site surveys"
        subtitle="Manage rooftop solar site feasibility surveys, task assignments, reviews and proposals"
        actions={isAdmin &&
          <div className="flex gap-2">
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New assigned survey
            </Button>
            <Button variant="secondary" onClick={handleExportCsv} disabled={!items.length}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Metrics Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white shadow-card ring-1 ring-slate-900/6 p-4">
          <div className="text-[13px] font-medium text-slate-500">Total Surveys</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totalCount}</div>
        </div>
        <div className="rounded-xl bg-white shadow-card ring-1 ring-slate-900/6 p-4">
          <div className="text-[13px] font-medium text-slate-500">Submitted / Reviewed</div>
          <div className="mt-1 text-2xl font-bold text-sky-700">{submittedCount}</div>
        </div>
        <div className="rounded-xl bg-white shadow-card ring-1 ring-slate-900/6 p-4">
          <div className="text-[13px] font-medium text-slate-500">Won Proposals</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{wonCount}</div>
        </div>
        <div className="rounded-xl bg-white shadow-card ring-1 ring-slate-900/6 p-4">
          <div className="text-[13px] font-medium text-slate-500">Surveyed Capacity</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{totalKw > 0 ? `${totalKw.toFixed(1)} kW` : '—'}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="mb-3 grid gap-2 md:grid-cols-3 xl:grid-cols-7">
        <SearchBox
          value={g('q')}
          onSearch={v => set('q', v)}
          placeholder="Customer, address or ref"
          label="Search site surveys"
          className="md:col-span-2"
        />

        {isAdmin && (
          <Select aria-label="Engineer" value={g('engineer')} onChange={e => set('engineer', e.target.value)}>
            <option value="">All engineers</option>
            {engineers.data?.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </Select>
        )}

        <Select aria-label="Status" value={g('status')} onChange={e => set('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="assigned">Assigned</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="reviewed">Reviewed</option>
          <option value="proposal_sent">Proposal Sent</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </Select>

        <Select aria-label="Site Type" value={g('siteType')} onChange={e => set('siteType', e.target.value)}>
          <option value="">All site types</option>
          <option value="commercial">Commercial</option>
          <option value="gated_community">Gated Community</option>
          <option value="industrial">Industrial</option>
          <option value="maintenance">Maintenance</option>
        </Select>

        <Select aria-label="Verdict" value={g('verdict')} onChange={e => set('verdict', e.target.value)}>
          <option value="">All verdicts</option>
          <option value="FEASIBLE">Feasible</option>
          <option value="CONDITIONAL">Conditional</option>
          <option value="NOT_FEASIBLE">Not Feasible</option>
        </Select>

        {filtered && (
          <Button variant="ghost" onClick={() => setSp(new URLSearchParams())}>
            Clear filters
          </Button>
        )}
      </div>

      {list.isLoading ? (
        <Skeleton rows={8} />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data!.items.length === 0 ? (
        <EmptyState text={filtered ? 'No site surveys match these filters.' : 'No site surveys recorded yet.'} />
      ) : (
        <>
          <Table
            rows={list.data!.items}
            keyOf={s => s.id}
            onRow={s => nav(`/surveys/${s.id}`)}
            rowLabel={s => `Open survey ${s.surveyRef ?? 'draft'} for ${s.customerName}`}
            cols={[
              {
                h: 'Ref',
                cell: s =>
                  s.surveyRef ? (
                    <span className="font-mono font-semibold text-sky-900">{s.surveyRef}</span>
                  ) : (
                    <span className="text-slate-400">draft</span>
                  ),
              },
              {
                h: 'Customer / Site',
                cell: s => (
                  <div>
                    <span className="block max-w-[14rem] truncate font-semibold text-slate-900" title={s.customerName}>
                      {s.customerName}
                    </span>
                    <span className="block max-w-[14rem] truncate text-xs text-slate-500" title={s.siteAddress}>
                      {s.siteAddress}
                    </span>
                  </div>
                ),
              },
              {
                h: 'Site Type',
                cell: s => <span className="text-xs font-medium capitalize text-slate-600">{s.siteType.replace('_', ' ')}</span>,
              },
              {
                h: 'Assigned to',
                cell: s => (
                  <div>
                    <span className="font-medium text-slate-900">{s.assignedEngineerName || s.engineerName}</span>
                    {s.plannedVisitDate && (
                      <span className="block text-xs text-slate-500">Visit: {s.plannedVisitDate}</span>
                    )}
                  </div>
                ),
              },
              {
                h: 'Capacity',
                cell: s =>
                  s.recommendedSystemSizeKw ? (
                    <span className="font-semibold text-slate-900">{s.recommendedSystemSizeKw} kW</span>
                  ) : (
                    '—'
                  ),
                className: 'text-right',
              },
              {
                h: 'Verdict',
                cell: s => {
                  if (!s.verdict) return <span className="text-slate-400">—</span>
                  const tone =
                    s.verdict === 'FEASIBLE'
                      ? 'green'
                      : s.verdict === 'CONDITIONAL'
                      ? 'amber'
                      : 'red'
                  return <Badge tone={tone}>{s.verdict}</Badge>
                },
              },
              {
                h: 'Status',
                cell: s => {
                  const map: Record<SurveyStatus, 'green' | 'amber' | 'blue' | 'red' | 'slate'> = {
                    assigned: 'blue',
                    draft: 'amber',
                    submitted: 'blue',
                    reviewed: 'green',
                    proposal_sent: 'blue',
                    won: 'green',
                    lost: 'red',
                  }
                  return <Badge tone={map[s.status] || 'slate'}>{s.status.replace('_', ' ').toUpperCase()}</Badge>
                },
              },
              {
                h: 'Updated',
                cell: s => fmtDateTime(s.updatedAt),
              },
            ]}
          />
          <Pagination page={page} pageSize={25} total={list.data!.total} onPage={p => set('page', String(p))} />
        </>
      )}

      {isAdmin && <NewAssignedSurveyModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />}
    </>
  )
}
