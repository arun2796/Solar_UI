import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { fmtDateTime } from '../../lib/format'
import { Badge, Button, Card, ErrorState, Notice, Skeleton, Textarea } from '../../components/ui'

const MAX = 2000

/** Internal comment thread for the office (the API never sends it to engineers). */
export function SurveyComments({ surveyId }: { surveyId: string }) {
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const key = ['survey', surveyId, 'comments']
  const list = useQuery({ queryKey: key, queryFn: () => api.surveys.comments.list(surveyId) })
  const add = useMutation({
    mutationFn: () => api.surveys.comments.add(surveyId, body.trim()),
    onSuccess: () => { setBody(''); void qc.invalidateQueries({ queryKey: key }) },
  })
  const text = body.trim()

  return <Card>
    <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><MessageSquare className="h-5 w-5 text-sky-600" aria-hidden />Comments</h2>
    <p className="mb-3 text-xs text-slate-500">Visible to the office only, never to the sales engineer.</p>
    {list.isLoading ? <Skeleton rows={2} /> : list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> :
      list.data!.length === 0 ? <p className="py-3 text-sm text-slate-400">No comments yet.</p> :
        <ol className="mb-4 space-y-3" aria-label="Comments">
          {list.data!.map(c => <li key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-800">{c.authorName}</span>
              {c.authorRole === 'admin' && <Badge tone="blue">Operations</Badge>}
              <span>{fmtDateTime(c.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
          </li>)}
        </ol>}
    <form onSubmit={e => { e.preventDefault(); if (text && text.length <= MAX) add.mutate() }} className="space-y-2" noValidate>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Add a comment</span>
        <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={MAX} placeholder="e.g. Approved at 25 kW; prepare the CAPEX quote" /></label>
      {add.error && <Notice>{errorMessage(add.error)}</Notice>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{body.length}/{MAX}</span>
        <Button type="submit" loading={add.isPending} disabled={!text}>Post comment</Button>
      </div>
    </form>
  </Card>
}
